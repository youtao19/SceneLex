import { buildWordPrompt } from '../prompts/word.prompt';
import { generateWithLocalModel } from './llm.service';
import {
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

function buildFallback(word: string): WordGenerateResult {
  return {
    word,
    meanings: [
      {
        partOfSpeech: '词性',
        meaning: '常见意思',
        example: `I met the word ${word} in a short sentence.`,
        tip: `${word} 的使用场景`,
      },
    ],
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
    const example = typeof data.example === 'string' ? data.example.trim() : '';
    const tip = typeof data.tip === 'string' ? data.tip.trim() : '';

    if (!partOfSpeech || !meaning || !example || !tip) {
      continue;
    }

    result.push({
      partOfSpeech,
      meaning,
      example,
      tip,
    });
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
      example,
      tip,
    });
  }

  return result;
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function normalizeGeneratedResult(
  raw: unknown,
  fallbackWord: string,
): WordGenerateResult {
  const fallback = buildFallback(fallbackWord);
  let word = fallbackWord;
  let meanings = fallback.meanings;

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const rawWord = data.word;

    if (typeof rawWord === 'string' && rawWord.trim()) {
      word = normalizeWord(rawWord);
    }

    const meaningItems = readMeaningItems(data.meanings);

    if (meaningItems.length > 0) {
      meanings = meaningItems;
    } else {
      const legacyItems = readLegacyMeaningItems(data);

      if (legacyItems.length > 0) {
        meanings = legacyItems;
      }
    }
  }

  return {
    word,
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

  return `${primary.partOfSpeech} ${primary.meaning}`.trim();
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const baseDate = new Date(`${dateString}T00:00:00.000Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
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
   * 生成预览内容时沿用当前 prompt，只负责把模型结果整理成稳定结构。
   */
  async generateWordContent(word: string): Promise<WordGenerateResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const prompt = buildWordPrompt(cleanWord);
    const rawText = await generateWithLocalModel(prompt);

    try {
      const parsed = JSON.parse(rawText);
      return normalizeGeneratedResult(parsed, cleanWord);
    } catch {
      console.error('模型返回非 JSON：', rawText);
      throw new Error('模型输出解析失败');
    }
  },

  /**
   * 直接持久化用户刚刚看到的预览结果，避免预览和入库内容不一致。
   */
  async addWordToReview(
    userId: number,
    word: string,
    meaningsInput: unknown,
  ): Promise<SaveWordResult> {
    const cleanWord = normalizeWord(word);

    if (!cleanWord) {
      throw new HttpError(400, 'word 不能为空');
    }

    const meanings = normalizeIncomingMeanings(meaningsInput);
    const primaryMeaning = buildPrimaryMeaning(meanings);

    return saveWordCard(userId, cleanWord, primaryMeaning, meanings);
  },

  /**
   * 今日复习队列只返回到期单词，保证前端按单词逐张推进。
   */
  async getTodayReviewWords(userId: number): Promise<StoredWord[]> {
    return listTodayWords(userId, getTodayDateString());
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
    const nextReview = addDays(getTodayDateString(), nextInterval);

    return updateReviewSchedule(userId, wordId, nextInterval, nextReview);
  },
};
