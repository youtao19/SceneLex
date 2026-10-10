import { query } from '../config/database';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import { LEARNING_DAY_SQL, getLearningDay } from '../utils/learning-day';
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
  study_version: number;
  first_learned_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface HistorySummaryRow {
  total_words: string;
  due_today: string;
  reviewed_words: string;
}

/**
 * 汇总和列表合成一次扫描后，每行都会带上同一份汇总值。
 */
interface HistoryRow extends WordRow, HistorySummaryRow {}

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
    studyVersion: Number(row.study_version),
    firstLearnedAt:
      row.first_learned_at === null ? null : new Date(row.first_learned_at).toISOString(),
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
  /**
   * 窗口聚合让汇总和列表共用同一次扫描，省掉原来那条单独的 COUNT 查询；
   * ORDER BY 由 idx_words_user_created 直接提供顺序，不必再对整份词表排序。
   */
  const result = await query<HistoryRow>(
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
        study_version,
        first_learned_at,
        created_at,
        updated_at,
        (COUNT(*) OVER ())::text AS total_words,
        (COUNT(*) FILTER (WHERE next_review <= ${LEARNING_DAY_SQL}) OVER ())::text AS due_today,
        (COUNT(*) FILTER (WHERE review_count > 0) OVER ())::text AS reviewed_words
      FROM words
      WHERE user_id = $1
      ORDER BY created_at DESC, word ASC
    `,
    [userId],
  );

  /**
   * 新用户一个词都没有时查不到任何行，汇总只能按零处理，不能从空数组里读。
   */
  if (result.rowCount === 0) {
    return {
      summary: { totalWords: 0, dueToday: 0, reviewedWords: 0 },
      dueWords: [],
      recentWords: [],
      words: [],
    };
  }

  const words = result.rows.map(mapWordRow);
  const dueWords = words
    .filter((word) => isDueToday(word.nextReview))
    .sort((left, right) => left.nextReview.localeCompare(right.nextReview));

  return {
    summary: mapSummary(result.rows[0]),
    dueWords,
    recentWords: words.slice(0, 6),
    words,
  };
}

/**
 * 归档页只需要按日期判断是否到期，不能让本地时分秒影响今天的结果。
 * 到期口径和复习队列保持一致：北京时间 04:00 开始的新学习日。
 */
function isDueToday(nextReview: string) {
  return nextReview <= getLearningDay(new Date());
}
