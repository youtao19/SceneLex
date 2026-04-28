import { query } from '../config/database';
import type { HistoryArchive, HistorySummary } from '../models/history.model';
import type { StoredWord, WordMeaningItem } from '../types/word';

interface WordRow {
  id: string;
  word: string;
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
 * 归档页和复习页复用同一种词卡结构，前端不用维护两套字段名。
 */
function mapWordRow(row: WordRow): StoredWord {
  return {
    id: Number(row.id),
    word: row.word,
    primaryMeaning: row.primary_meaning,
    meanings: row.meanings,
    ease: Number(row.ease),
    interval: Number(row.interval),
    nextReview: row.next_review,
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

  return {
    summary: mapSummary(summaryResult.rows[0]),
    recentWords: words.slice(0, 6),
    words,
  };
}
