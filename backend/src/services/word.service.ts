import { buildWordPrompt } from '../prompts/word.prompt';
import { generateWordJson } from './llm.service';
import { dictionaryService } from './dictionary.service';
import { settingsService } from './settings.service';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import type { AiEndpoint } from '../types/endpoint';
import {
  applyReviewSchedule,
  countDueWords,
  countNewWordCompletions,
  findWordByIdForUpdate,
  findWordByTextForUpdate,
  listNewWords as listNewWordItems,
  listTodayWords,
  restoreReviewSchedule,
  saveWordCard,
  toReviewSnapshot,
  upsertWordCard,
} from '../repositories/word.repository';
import { withTransaction } from '../config/database';
import {
  findStudyOperation,
  insertStudyOperation,
} from '../repositories/study-operation.repository';
import { addWordToBooks, ensureDefaultWordBook } from '../repositories/word-book.repository';
import { findSystemWordBookSummary } from '../repositories/system-word-book.repository';
import { getLearningDay } from '../utils/learning-day';
import {
  applyDailyReviewLimit,
  assertExpectedVersion,
  buildOperationFingerprint,
  normalizeOperationId,
} from '../utils/study-rules';
import {
  findSystemWordCardByWord,
  findSystemWordCardPreview,
  saveSystemWordCard,
  saveSystemWordCardPreview,
} from '../repositories/system-word-card-preview.repository';
import { HttpError } from '../utils/http-error';
import type {
  CompleteNewWordPayload,
  NewWordQueue,
  ReviewRating,
  ReviewRollbackPayload,
  ReviewWordPayload,
  SaveWordResult,
  StoredWord,
  StudyOverview,
  WordGenerateResult,
  WordLookupResult,
  WordMeaningItem,
  WordRequiredMeaning,
} from '../types/word';
import type { DictionaryEntry } from '../types/dictionary';

function buildFallback(word: string): WordGenerateResult {
  return {
    word,
    phonetic: '',
    meanings: [
      {
        partOfSpeech: '词性',
        meaning: '常见意思',
        sceneTitle: '常见使用场景',
        examples: [`I met the word ${word} in a short scene.`],
        explanation: `这个场景先保底展示 ${word}，避免生成失败时页面没有内容。`,
        imageQueries: [`${word} word learning scene`, `${word} example scene`, `${word} visual memory`],
        example: `I met the word ${word} in a short sentence.`,
        tip: `${word} 的使用场景`,
      },
    ],
    source: 'generated',
    contentSource: 'agent',
    saved: false,
  };
}

/**
 * 前端预览和正式入库共用同一套校验，避免两边看到的数据结构不一致。
 */
function readMeaningItems(value: unknown): WordMeaningItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: WordMeaningItem[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];

    if (!item || typeof item !== 'object') {
      continue;
    }

    const data = item as Record<string, unknown>;
    const partOfSpeech =
      typeof data.partOfSpeech === 'string' ? data.partOfSpeech.trim() : '';
    const meaning = typeof data.meaning === 'string' ? data.meaning.trim() : '';
    const sceneTitle = typeof data.sceneTitle === 'string' ? data.sceneTitle.trim() : meaning;
    const examples = readStringList(data.examples);
    const example = typeof data.example === 'string' ? data.example.trim() : '';
    const finalExamples = examples.length > 0 ? examples : [example].filter(Boolean);
    const explanation =
      typeof data.explanation === 'string' ? data.explanation.trim() : '';
    const imageQueries = readStringList(data.imageQueries);
    const tip = typeof data.tip === 'string' ? data.tip.trim() : '';

    if (!partOfSpeech || !meaning || finalExamples.length === 0 || !tip) {
      continue;
    }

    result.push({
      partOfSpeech,
      meaning,
      sceneTitle,
      examples: finalExamples,
      explanation: explanation || tip,
      imageQueries,
      example: example || finalExamples[0],
      tip,
    });
  }

  return result;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const text = item.trim();

    if (text) {
      result.push(text);
    }
  }

  return result;
}

function readLegacyMeaningItems(raw: Record<string, unknown>): WordMeaningItem[] {
  const examples = Array.isArray(raw.examples) ? raw.examples : [];
  const tips = Array.isArray(raw.tips) ? raw.tips : [];
  const count = Math.min(examples.length, tips.length);
  const result: WordMeaningItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const example = typeof examples[i] === 'string' ? examples[i].trim() : '';
    const tip = typeof tips[i] === 'string' ? tips[i].trim() : '';

    if (!example || !tip) {
      continue;
    }

    result.push({
      partOfSpeech: '词性',
      meaning: `义项 ${result.length + 1}`,
      sceneTitle: `场景 ${result.length + 1}`,
      examples: [example],
      explanation: tip,
      imageQueries: [],
      example,
      tip,
    });
  }

  return result;
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function normalizePhonetic(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeGeneratedResult(
  raw: unknown,
  fallbackWord: string,
): WordGenerateResult {
  const fallback = buildFallback(fallbackWord);
  let word = fallbackWord;
  let phonetic = fallback.phonetic;
  let meanings = fallback.meanings;

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const rawWord = data.word;

    if (typeof rawWord === 'string' && rawWord.trim()) {
      word = normalizeWord(rawWord);
    }

    phonetic = normalizePhonetic(data.phonetic);

    const meaningItems = readMeaningItems(data.meanings);
    const validMeaningItems = filterMeaningsByWord(meaningItems, fallbackWord);

    if (validMeaningItems.length > 0) {
      meanings = validMeaningItems;
    } else {
      const legacyItems = readLegacyMeaningItems(data);

      if (legacyItems.length > 0) {
        meanings = legacyItems;
      }
    }
  }

  return {
    word,
    phonetic,
    meanings,
    source: 'generated',
    contentSource: 'agent',
    saved: false,
  };
}

/**
 * 小模型偶尔会照搬提示词里的其他单词例句；这里直接拦掉脏场景。
 */
function filterMeaningsByWord(meanings: WordMeaningItem[], word: string) {
  const normalizedWord = word.toLowerCase();
  const result: WordMeaningItem[] = [];

  for (const meaning of meanings) {
    const examples = meaning.examples.filter((example) =>
      example.toLowerCase().includes(normalizedWord),
    );

    if (examples.length === 0) {
      continue;
    }

    result.push({
      ...meaning,
      examples,
      example: examples[0],
    });
  }

  return result;
}

/**
 * 词库能对上的义项更稳定；对不上的后续场景保留模型拆分，避免宽泛义项被复制成重复卡片。
 */
function applyDictionaryFacts(
  result: WordGenerateResult,
  dictionaryEntry: DictionaryEntry | null,
): WordGenerateResult {
  if (!dictionaryEntry) {
    return result;
  }

  const meanings: WordMeaningItem[] = [];
  const usedDictionaryMeanings: string[] = [];

  for (let i = 0; i < result.meanings.length; i += 1) {
    const generated = result.meanings[i];
    const dictionaryMeaning = dictionaryEntry.meanings[i];

    if (!dictionaryMeaning || usedDictionaryMeanings.includes(dictionaryMeaning.meaning)) {
      meanings.push(generated);
      continue;
    }

    usedDictionaryMeanings.push(dictionaryMeaning.meaning);

    meanings.push({
      ...generated,
      partOfSpeech: dictionaryMeaning.partOfSpeech,
      meaning: dictionaryMeaning.meaning,
    });
  }

  return {
    ...result,
    word: dictionaryEntry.word,
    phonetic: dictionaryEntry.phonetic || result.phonetic,
    meanings,
  };
}

function normalizeIncomingMeanings(value: unknown) {
  const meanings = readMeaningItems(value);

  if (meanings.length === 0) {
    throw new HttpError(400, 'meanings 不能为空，且必须包含合法义项');
  }

  return meanings;
}

function normalizeBookIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: number[] = [];

  for (const item of value) {
    const bookId = Number(item);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      throw new HttpError(400, 'bookIds 包含非法单词本');
    }

    if (!result.includes(bookId)) {
      result.push(bookId);
    }
  }

  return result;
}

function normalizeRequiredMeanings(value: unknown): WordRequiredMeaning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: WordRequiredMeaning[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const data = item as Record<string, unknown>;
    const partOfSpeech = typeof data.partOfSpeech === 'string' ? data.partOfSpeech.trim() : '';
    const meaning = typeof data.meaning === 'string' ? data.meaning.trim() : '';
    const priority = Number(data.priority);

    if (!partOfSpeech || !meaning || !Number.isInteger(priority)) {
      continue;
    }

    result.push({ partOfSpeech, meaning, priority });
  }

  return result
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 5);
}

function applyRequiredMeanings(
  result: WordGenerateResult,
  requiredMeanings: WordRequiredMeaning[],
): WordGenerateResult {
  if (requiredMeanings.length === 0) {
    return result;
  }

  const fallbackMeaning = result.meanings[0] ?? buildFallback(result.word).meanings[0];
  const meanings = requiredMeanings.map((required, index) => {
    const generated = result.meanings[index] ?? fallbackMeaning;

    return {
      ...generated,
      partOfSpeech: required.partOfSpeech,
      meaning: required.meaning,
    };
  });

  return {
    ...result,
    meanings,
  };
}

function readPositiveInteger(value: unknown) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * 评分档位只有这四档，非法值直接拒，不让排期算法拿到意外输入。
 */
function normalizeRating(value: unknown): ReviewRating {
  const allowedRatings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

  if (!allowedRatings.includes(value as ReviewRating)) {
    throw new HttpError(400, 'rating 非法');
  }

  return value as ReviewRating;
}

const MIN_ANKI_EASE = 1.3;
const DEFAULT_ANKI_EASE = 2.5;
const ANKI_HARD_INTERVAL = 1.2;
const ANKI_EASY_BONUS = 1.3;
const ANKI_INTERVAL_MODIFIER = 1;
const ANKI_MAX_INTERVAL = 36_500;

interface AnkiSchedule {
  interval: number;
  ease: number;
}

function clampAnkiEase(ease: number) {
  return Math.max(MIN_ANKI_EASE, Number(ease.toFixed(2)));
}

function clampAnkiInterval(interval: number) {
  return Math.min(ANKI_MAX_INTERVAL, Math.max(1, interval));
}

function growAnkiInterval(currentInterval: number, nextInterval: number) {
  const roundedInterval = Math.round(nextInterval * ANKI_INTERVAL_MODIFIER);

  return clampAnkiInterval(Math.max(currentInterval + 1, roundedInterval));
}

/**
 * SceneLex 目前只有天级 next_review，所以这里采用 Anki/SM-2 的日粒度版本。
 * 导出是为了让排期规则可以被单元测试直接钉住 —— 这是最容易被改错又最难发现的逻辑。
 */
export function getNextAnkiSchedule(word: StoredWord, rating: ReviewRating): AnkiSchedule {
  const currentInterval = Math.max(1, word.interval);
  const currentEase = word.ease > 0 ? word.ease : DEFAULT_ANKI_EASE;

  if (rating === 'again') {
    return {
      interval: 1,
      ease: clampAnkiEase(currentEase - 0.2),
    };
  }

  if (rating === 'hard') {
    return {
      interval: growAnkiInterval(currentInterval, currentInterval * ANKI_HARD_INTERVAL),
      ease: clampAnkiEase(currentEase - 0.15),
    };
  }

  const goodInterval = word.reviewCount === 0
    ? 1
    : currentInterval * currentEase;

  if (rating === 'easy') {
    return {
      interval: growAnkiInterval(currentInterval, goodInterval * ANKI_EASY_BONUS),
      ease: clampAnkiEase(currentEase + 0.2),
    };
  }

  return {
    interval: growAnkiInterval(currentInterval, goodInterval),
    ease: clampAnkiEase(currentEase),
  };
}

export const wordService = {
  /**
   * 仪表盘先展示词典事实，不调用模型，用户确认需要场景时再生成完整词卡。
   */
  async lookupWord(word: string): Promise<WordLookupResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const dictionaryEntry = await dictionaryService.findByWord(cleanWord);

    if (!dictionaryEntry) {
      throw new HttpError(404, '词库中暂未找到该单词');
    }

    return {
      word: dictionaryEntry.word,
      phonetic: dictionaryEntry.phonetic,
      meanings: dictionaryEntry.meanings.slice(0, 6).map((meaning, index) => ({
        partOfSpeech: meaning.partOfSpeech,
        meaning: meaning.meaning,
        priority: index + 1,
      })),
    };
  },

  /**
   * 普通查词默认走系统缓存，个人 words 只保存用户确认学习的进度。
   * endpoint 允许为空：命中系统缓存时不需要调模型，只有真要生成时才要求端点。
   */
  async generateWordContent(
    word: string,
    forceRegenerate = false,
    requiredMeaningsInput: unknown = [],
    systemBookItemIdInput: unknown = null,
    endpoint: AiEndpoint | null = null,
  ): Promise<WordGenerateResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const dictionaryEntry = await dictionaryService.findByWord(cleanWord);
    const requiredMeanings = normalizeRequiredMeanings(requiredMeaningsInput);
    const systemBookItemId = readPositiveInteger(systemBookItemIdInput);

    if (!forceRegenerate) {
      if (systemBookItemId && requiredMeanings.length > 0) {
        const cachedPreview = await findSystemWordCardPreview(systemBookItemId);

        if (cachedPreview) {
          return cachedPreview;
        }
      } else {
        const cachedCard = await findSystemWordCardByWord(cleanWord);

        if (cachedCard) {
          return cachedCard;
        }
      }
    }

    const prompt = buildWordPrompt(cleanWord, dictionaryEntry ?? undefined, requiredMeanings);

    if (!endpoint) {
      throw new HttpError(400, '还没有配置模型端点。可以自己添加一个，或联系管理员开通系统端点。');
    }

    const rawText = await generateWordJson(endpoint, prompt);
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('模型返回非 JSON：', rawText);
      throw new Error('模型输出解析失败');
    }

    const normalized = applyRequiredMeanings(
      applyDictionaryFacts(
        normalizeGeneratedResult(parsed, cleanWord),
        requiredMeanings.length > 0 ? null : dictionaryEntry,
      ),
      requiredMeanings,
    );
    const contentSource: WordGenerateResult['contentSource'] = dictionaryEntry
      ? 'dictionary'
      : 'agent';
    const generated = {
      ...normalized,
      word: cleanWord,
      contentSource,
    };

    if (forceRegenerate || requiredMeanings.length > 0) {
      if (systemBookItemId && requiredMeanings.length > 0) {
        await saveSystemWordCardPreview(systemBookItemId, generated);
      } else {
        await saveSystemWordCard(generated);
      }

      return {
        ...generated,
        source: 'generated',
        saved: false,
      };
    }

    await saveSystemWordCard(generated);

    return {
      word: generated.word,
      phonetic: generated.phonetic,
      meanings: generated.meanings,
      source: 'generated',
      contentSource,
      saved: false,
    };
  },

  /**
   * 直接持久化用户刚刚看到的预览结果，避免预览和入库内容不一致。
   */
  async addWordToReview(
    userId: number,
    word: string,
    phoneticInput: unknown,
    meaningsInput: unknown,
    bookIdsInput: unknown,
  ): Promise<SaveWordResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const meanings = normalizeIncomingMeanings(meaningsInput);
    const phonetic = normalizePhonetic(phoneticInput);
    const primaryMeaning = buildPrimaryMeaning(meanings);
    const bookIds = normalizeBookIds(bookIdsInput);

    return saveWordCard(userId, cleanWord, phonetic, primaryMeaning, meanings, bookIds);
  },

  /**
   * 今日复习队列只返回到期单词，保证前端按单词逐张推进。
   */
  async getTodayReviewWords(userId: number): Promise<StoredWord[]> {
    const settings = await settingsService.getLearningSettings(userId);
    const limit = settings.dailyReviewLimitEnabled ? settings.dailyReviewLimit : undefined;

    return listTodayWords(userId, limit);
  },

  /**
   * 学习概览：学习日、新词目标与完成数、当前词书、到期总数和受限队列一起返回。
   * 前端不用自己拼，也不会因为分页把“还有到期词”判成空。
   */
  async getStudyOverview(userId: number): Promise<StudyOverview> {
    const settings = await settingsService.getLearningSettings(userId)
    const [dueTotal, newWordCompleted, book] = await Promise.all([
      countDueWords(userId),
      countNewWordCompletions(userId),
      settings.currentSystemBookId === null
        ? Promise.resolve(null)
        : findSystemWordBookSummary(settings.currentSystemBookId),
    ])

    return {
      learningDay: getLearningDay(new Date()),
      newWordTarget: settings.dailyNewWordTarget,
      newWordCompleted,
      currentSystemBookId: book?.id ?? null,
      currentSystemBookName: book?.name ?? null,
      dueTotal,
      queueCount: applyDailyReviewLimit(
        dueTotal,
        settings.dailyReviewLimitEnabled,
        settings.dailyReviewLimit,
      ),
      dailyReviewLimitEnabled: settings.dailyReviewLimitEnabled,
      dailyReviewLimit: settings.dailyReviewLimit,
    }
  },

  /**
   * 顺序新词队列：只取当前词书里没学过的词，按词书顺序。
   * 不传 limit 时给“今日剩余目标”，目标已完成就返回空；想继续学要显式要更多。
   */
  async listNewWords(userId: number, limitInput: unknown): Promise<NewWordQueue> {
    const settings = await settingsService.getLearningSettings(userId)
    const newWordCompleted = await countNewWordCompletions(userId)
    const remainingTarget = Math.max(0, settings.dailyNewWordTarget - newWordCompleted)
    const limit = readPositiveInteger(limitInput) ?? remainingTarget
    const learningDay = getLearningDay(new Date())
    const bookId = settings.currentSystemBookId

    if (bookId === null) {
      return {
        bookId: null,
        bookName: null,
        learningDay,
        newWordTarget: settings.dailyNewWordTarget,
        newWordCompleted,
        remainingTarget,
        words: [],
      }
    }

    const book = await findSystemWordBookSummary(bookId)

    return {
      bookId: book?.id ?? null,
      bookName: book?.name ?? null,
      learningDay,
      newWordTarget: settings.dailyNewWordTarget,
      newWordCompleted,
      remainingTarget,
      words: book ? await listNewWordItems(userId, bookId, limit) : [],
    }
  },

  /**
   * 完成新词：保存词卡、首次评分和当日计数在同一个事务里完成，只生成预览不算完成。
   * 已经完成过的词再来一次只更新内容，不重复评分也不重复计数。
   */
  async completeNewWord(
    userId: number,
    payload: CompleteNewWordPayload,
  ): Promise<StoredWord> {
    const cleanWord = normalizeWord(payload.word ?? '')

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空')
    }

    const rating = normalizeRating(payload.rating)
    const meanings = normalizeIncomingMeanings(payload.meanings)
    const phonetic = normalizePhonetic(payload.phonetic)
    const primaryMeaning = buildPrimaryMeaning(meanings)
    const bookIds = normalizeBookIds(payload.bookIds)
    const operationId = normalizeOperationId(payload.operationId)
    const fingerprint = buildOperationFingerprint('complete_new', {
      word: cleanWord,
      rating,
      phonetic,
      meanings,
    })
    const replayed = await findReplayOperation(userId, operationId, fingerprint)

    if (replayed) {
      return replayed
    }

    return withTransaction(async (client) => {
      await ensureDefaultWordBook(client, userId)
      const existing = await findWordByTextForUpdate(client, userId, cleanWord)
      const card = await upsertWordCard(
        client,
        userId,
        cleanWord,
        phonetic,
        primaryMeaning,
        meanings,
        true,
      )
      const linkedCount = await addWordToBooks(client, userId, card.id, bookIds)

      if (bookIds.length > 0 && linkedCount !== bookIds.length) {
        throw new HttpError(404, '单词本不存在')
      }

      const isFirstCompletion = existing === null || existing.firstLearnedAt === null
      const finalCard = isFirstCompletion
        ? await applyReviewSchedule(
            client,
            userId,
            card.id,
            getNextAnkiSchedule(card, rating),
          )
        : card

      if (operationId) {
        await insertStudyOperation(client, {
          userId,
          operationId,
          kind: 'complete_new',
          wordId: finalCard.id,
          requestFingerprint: fingerprint,
          /**
           * 撤销首次完成要回到“词卡已存在但未完成”的状态：
           * 用刚 upsert 完的排期（upsert 不改排期字段）再把首次完成时间抹掉，
           * 不能写 null，否则回滚时没有可恢复的排期。
           */
          beforeState: { ...toReviewSnapshot(card), firstLearnedAt: null },
          result: finalCard,
          studyVersion: finalCard.studyVersion,
        })
      }

      return finalCard
    })
  },

  /**
   * 评分只更新最简 SRS 字段，不动教学内容。
   * 带 operationId 时重试返回原结果，不会重复推进排期。
   */
  async reviewWord(userId: number, payload: ReviewWordPayload): Promise<StoredWord> {
    const wordId = Number(payload.wordId)

    if (!Number.isInteger(wordId) || wordId <= 0) {
      throw new HttpError(400, 'wordId 非法')
    }

    const rating = normalizeRating(payload.rating)
    const operationId = normalizeOperationId(payload.operationId)
    const fingerprint = buildOperationFingerprint('review', { wordId, rating })
    const replayed = await findReplayOperation(userId, operationId, fingerprint)

    if (replayed) {
      return replayed
    }

    return withTransaction(async (client) => {
      const current = await findWordByIdForUpdate(client, userId, wordId)

      if (!current) {
        throw new HttpError(404, '单词不存在')
      }

      assertExpectedVersion(current.studyVersion, payload.expectedVersion)

      const card = await applyReviewSchedule(
        client,
        userId,
        wordId,
        getNextAnkiSchedule(current, rating),
      )

      if (operationId) {
        await insertStudyOperation(client, {
          userId,
          operationId,
          kind: 'review',
          wordId,
          requestFingerprint: fingerprint,
          beforeState: toReviewSnapshot(current),
          result: card,
          studyVersion: card.studyVersion,
        })
      }

      return card
    })
  },

  /**
   * 撤销只恢复复习排期字段，教学内容和词书归属不参与回滚。
   * 依据是服务端记录的评分操作，且它必须仍是这条记录的最新一次改动。
   */
  async rollbackReviewWord(
    userId: number,
    payload: ReviewRollbackPayload,
  ): Promise<StoredWord> {
    const wordId = Number(payload.wordId)

    if (!Number.isInteger(wordId) || wordId <= 0) {
      throw new HttpError(400, 'wordId 非法')
    }

    const targetOperationId = normalizeOperationId(payload.targetOperationId)
    const operationId = normalizeOperationId(payload.operationId)

    if (!targetOperationId) {
      throw new HttpError(409, '撤销需要服务端记录的操作引用，请刷新后重试')
    }

    const fingerprint = buildOperationFingerprint('rollback', {
      wordId,
      targetOperationId,
    })
    const replayed = await findReplayOperation(userId, operationId, fingerprint)

    if (replayed) {
      return replayed
    }

    return withTransaction(async (client) => {
      const current = await findWordByIdForUpdate(client, userId, wordId)

      if (!current) {
        throw new HttpError(404, '单词不存在')
      }

      const target = await findStudyOperation(userId, targetOperationId)

      if (!target || target.wordId !== wordId) {
        throw new HttpError(404, '找不到要撤销的评分记录')
      }

      if (target.studyVersion !== current.studyVersion) {
        throw new HttpError(409, '这条记录之后已被其他操作更新，不能再撤销')
      }

      if (target.beforeState === null) {
        throw new HttpError(409, '这次操作没有可恢复的排期')
      }

      const card = await restoreReviewSchedule(client, userId, wordId, target.beforeState)

      if (operationId) {
        await insertStudyOperation(client, {
          userId,
          operationId,
          kind: 'rollback',
          wordId,
          requestFingerprint: fingerprint,
          beforeState: toReviewSnapshot(current),
          result: card,
          studyVersion: card.studyVersion,
        })
      }

      return card
    })
  },
};

/**
 * 重试去重：同一个操作 ID 再来一次返回原结果；
 * 同 ID 不同内容说明客户端复用了 ID，直接拒比执行两次安全。
 */
async function findReplayOperation(
  userId: number,
  operationId: string | null,
  fingerprint: string,
): Promise<StoredWord | null> {
  if (!operationId) {
    return null
  }

  const existing = await findStudyOperation(userId, operationId)

  if (!existing) {
    return null
  }

  if (existing.requestFingerprint !== fingerprint) {
    throw new HttpError(409, '同一个操作 ID 提交了不同内容')
  }

  return existing.result
}
