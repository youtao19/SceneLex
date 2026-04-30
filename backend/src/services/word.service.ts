import { buildWordPrompt } from '../prompts/word.prompt';
import { generateWithLocalModel } from './llm.service';
import { dictionaryService } from './dictionary.service';
import {
  findWordByText,
  findWordById,
  listTodayWords,
  saveWordCard,
  updateReviewSchedule,
} from '../repositories/word.repository';
import { HttpError } from '../utils/http-error';
import type {
  ReviewRating,
  SaveWordResult,
  StoredWord,
  WordGenerateResult,
  WordMeaningItem,
} from '../types/word';
import type { DictionaryEntry } from '../types/dictionary';

function buildFallback(word: string): WordGenerateResult {
  return {
    word,
    phonetic: '',
    coreFeeling: `${word} 像一个正在发生的画面`,
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
  let coreFeeling = fallback.coreFeeling;
  let meanings = fallback.meanings;

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const rawWord = data.word;

    if (typeof rawWord === 'string' && rawWord.trim()) {
      word = normalizeWord(rawWord);
    }

    phonetic = normalizePhonetic(data.phonetic);
    coreFeeling =
      typeof data.coreFeeling === 'string' && data.coreFeeling.trim()
        ? data.coreFeeling.trim()
        : coreFeeling;

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
    coreFeeling,
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
 * 词典义项比模型更稳定；场景内容保留模型生成，词性和中文释义以词库为准。
 */
function applyDictionaryFacts(
  result: WordGenerateResult,
  dictionaryEntry: DictionaryEntry | null,
): WordGenerateResult {
  if (!dictionaryEntry) {
    return result;
  }

  const meanings: WordMeaningItem[] = [];

  for (let i = 0; i < result.meanings.length; i += 1) {
    const generated = result.meanings[i];
    const dictionaryMeaning = dictionaryEntry.meanings[i] ?? dictionaryEntry.meanings[0];

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

function buildPrimaryMeaning(meanings: WordMeaningItem[]) {
  const primary = meanings[0];

  return primary.explanation || `${primary.partOfSpeech} ${primary.meaning}`.trim();
}

function normalizeCoreFeeling(value: unknown, meanings: WordMeaningItem[]) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return buildPrimaryMeaning(meanings);
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

/**
 * 查询缓存时只返回词卡预览需要的字段，避免前端误把复习进度当成可编辑内容。
 */
function toGenerateResultFromStoredWord(
  word: StoredWord,
  contentSource: WordGenerateResult['contentSource'],
): WordGenerateResult {
  return {
    word: word.word,
    phonetic: word.phonetic,
    coreFeeling: word.coreFeeling,
    meanings: word.meanings,
    source: 'database',
    contentSource,
    saved: true,
  };
}

function canUseStoredWord(word: StoredWord) {
  return word.meanings.length > 0;
}

function getNextInterval(interval: number, rating: ReviewRating) {
  if (rating === 'again') {
    return 1;
  }

  if (rating === 'hard') {
    return Math.max(1, Math.round(interval * 1.5));
  }

  return Math.max(1, Math.round(interval * 2));
}

export const wordService = {
  /**
   * 默认先查库，避免同一个用户重复查同一个词时反复消耗本地模型。
   */
  async generateWordContent(
    userId: number,
    word: string,
    forceRegenerate = false,
  ): Promise<WordGenerateResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const dictionaryEntry = dictionaryService.findByWord(cleanWord);

    if (!forceRegenerate) {
      const storedWord = await findWordByText(userId, cleanWord);

      if (storedWord && canUseStoredWord(storedWord)) {
        const storedContentSource = dictionaryEntry ? 'dictionary' : 'agent';
        return toGenerateResultFromStoredWord(storedWord, storedContentSource);
      }
    }

    const prompt = buildWordPrompt(cleanWord, dictionaryEntry ?? undefined);
    const rawText = await generateWithLocalModel(prompt);
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('模型返回非 JSON：', rawText);
      throw new Error('模型输出解析失败');
    }

    const normalized = applyDictionaryFacts(
      normalizeGeneratedResult(parsed, cleanWord),
      dictionaryEntry,
    );
    const contentSource: WordGenerateResult['contentSource'] = dictionaryEntry
      ? 'dictionary'
      : 'agent';
    const generated = {
      ...normalized,
      word: cleanWord,
      contentSource,
    };

    if (forceRegenerate) {
      return {
        ...generated,
        source: 'generated',
        saved: false,
      };
    }

    const primaryMeaning = generated.coreFeeling;
    const saved = await saveWordCard(
      userId,
      generated.word,
      generated.phonetic,
      primaryMeaning,
      generated.meanings,
    );

    return {
	      word: saved.card.word,
	      phonetic: saved.card.phonetic,
	      coreFeeling: saved.card.coreFeeling,
	      meanings: saved.card.meanings,
      source: 'generated',
      contentSource,
      saved: true,
    };
  },

  /**
   * 直接持久化用户刚刚看到的预览结果，避免预览和入库内容不一致。
   */
  async addWordToReview(
    userId: number,
    word: string,
    phoneticInput: unknown,
    coreFeelingInput: unknown,
    meaningsInput: unknown,
    bookIdsInput: unknown,
  ): Promise<SaveWordResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const meanings = normalizeIncomingMeanings(meaningsInput);
    const phonetic = normalizePhonetic(phoneticInput);
    const primaryMeaning = normalizeCoreFeeling(coreFeelingInput, meanings);
    const bookIds = normalizeBookIds(bookIdsInput);

    return saveWordCard(userId, cleanWord, phonetic, primaryMeaning, meanings, bookIds);
  },

  /**
   * 今日复习队列只返回到期单词，保证前端按单词逐张推进。
   */
  async getTodayReviewWords(userId: number): Promise<StoredWord[]> {
    return listTodayWords(userId);
  },

  /**
   * 评分只更新最简 SRS 字段，不动教学内容。
   */
  async reviewWord(
    userId: number,
    wordId: number,
    rating: ReviewRating,
  ): Promise<StoredWord> {
    if (!Number.isInteger(wordId) || wordId <= 0) {
      throw new HttpError(400, 'wordId 非法');
    }

    const allowedRatings: ReviewRating[] = ['again', 'hard', 'good'];

    if (!allowedRatings.includes(rating)) {
      throw new HttpError(400, 'rating 非法');
    }

    const current = await findWordById(userId, wordId);

    if (!current) {
      throw new HttpError(404, '单词不存在');
    }

    const nextInterval = getNextInterval(current.interval, rating);

    return updateReviewSchedule(userId, wordId, nextInterval);
  },
};
