import { query } from '../config/database';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import type { HistoryArchive, HistorySummary } from '../models/history.model';
import type { StoredWord, WordMeaningItem } from '../types/word';

interface WordRow {
  id: string;
  word: string;
  phonetic: string;
  primary_meaning: string;
  meanings: WordMeaningItem[];
  ease: number;
  interval: number;
  next_review: string;
  review_count: number;
  created_at: string | Date;
  updated_at: string | Date;
}

interface HistorySummaryRow {
  total_words: string;
  due_today: string;
  reviewed_words: string;
}

/**
 * pg 的 DATE 运行时可能是 Date，也可能是字符串；前端统一只需要日期部分。
 */
function toDateString(value: string | Date) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 归档页和复习页复用同一种词卡结构，前端不用维护两套字段名。
 */
function mapWordRow(row: WordRow): StoredWord {
  const nextReview = toDateString(row.next_review);

  return {
    id: Number(row.id),
    word: row.word,
    phonetic: row.phonetic,
    primaryMeaning: buildPrimaryMeaning(row.meanings),
    meanings: row.meanings,
    ease: Number(row.ease),
    interval: Number(row.interval),
    nextReview,
    reviewCount: Number(row.review_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * PostgreSQL 聚合值会以字符串返回，这里统一转成前端能直接展示的数字。
 */
function mapSummary(row: HistorySummaryRow): HistorySummary {
  return {
    totalWords: Number(row.total_words),
    dueToday: Number(row.due_today),
    reviewedWords: Number(row.reviewed_words),
  };
}

/**
 * 归档页展示的是用户自己的词库，所以所有统计和列表都必须按 user_id 收口。
 */
export async function getHistoryArchive(userId: number): Promise<HistoryArchive> {
  const summaryResult = await query<HistorySummaryRow>(
    `
      SELECT
        COUNT(*)::text AS total_words,
        COUNT(*) FILTER (WHERE next_review <= CURRENT_DATE)::text AS due_today,
        COUNT(*) FILTER (WHERE review_count > 0)::text AS reviewed_words
      FROM words
      WHERE user_id = $1
    `,
    [userId],
  );

  const wordsResult = await query<WordRow>(
    `
      SELECT
        id,
        word,
        phonetic,
        primary_meaning,
        meanings,
        ease,
        interval,
        next_review,
        review_count,
        created_at,
        updated_at
      FROM words
      WHERE user_id = $1
      ORDER BY created_at DESC, word ASC
    `,
    [userId],
  );

  const words = wordsResult.rows.map(mapWordRow);
  const dueWords = words
    .filter((word) => isDueToday(word.nextReview))
    .sort((left, right) => left.nextReview.localeCompare(right.nextReview));

  return {
    summary: mapSummary(summaryResult.rows[0]),
    dueWords,
    recentWords: words.slice(0, 6),
    words,
  };
}

/**
 * 归档页只需要按日期判断是否到期，不能让本地时分秒影响今天的结果。
 */
function isDueToday(nextReview: string) {
  const today = new Date().toISOString().slice(0, 10);
  const reviewDate = new Date(nextReview).toISOString().slice(0, 10);

  return reviewDate <= today;
}
