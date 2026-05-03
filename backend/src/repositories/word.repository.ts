import type { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { addWordToBooks, ensureDefaultWordBook } from './word-book.repository';
import { HttpError } from '../utils/http-error';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import type {
  SaveWordResult,
  StoredWord,
  WordMeaningItem,
} from '../types/word';

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

/**
 * DATE 字段出库后统一成 YYYY-MM-DD，避免前端和排序逻辑拿到 Date 对象。
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

function mapWordRow(row: WordRow): StoredWord {
  return {
    id: Number(row.id),
    word: row.word,
    phonetic: row.phonetic,
    primaryMeaning: buildPrimaryMeaning(row.meanings),
    coreFeeling: row.primary_meaning,
    meanings: row.meanings,
    ease: Number(row.ease),
    interval: Number(row.interval),
    nextReview: toDateString(row.next_review),
    reviewCount: Number(row.review_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function runUpsertWord(
  client: PoolClient,
  userId: number,
  word: string,
  phonetic: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
) {
  return client.query<WordRow>(
    `
      INSERT INTO words (
        user_id,
        word,
        phonetic,
        primary_meaning,
        meanings
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (user_id, word)
      DO UPDATE SET
        phonetic = EXCLUDED.phonetic,
        primary_meaning = EXCLUDED.primary_meaning,
        meanings = EXCLUDED.meanings,
        updated_at = NOW()
      RETURNING
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
    `,
    [userId, word, phonetic, primaryMeaning, JSON.stringify(meanings)],
  );
}

/**
 * 查重后再 upsert，是为了明确告诉前端本次是新增还是更新。
 */
export async function saveWordCard(
  userId: number,
  word: string,
  phonetic: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
  bookIds: number[] = [],
): Promise<SaveWordResult> {
  return withTransaction(async (client) => {
    await ensureDefaultWordBook(client, userId);
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM words WHERE user_id = $1 AND word = $2',
      [userId, word],
    );
    const saved = await runUpsertWord(client, userId, word, phonetic, primaryMeaning, meanings);
    const card = mapWordRow(saved.rows[0]);
    const linkedCount = await addWordToBooks(client, userId, card.id, bookIds);

    if (bookIds.length > 0 && linkedCount !== bookIds.length) {
      throw new HttpError(404, '单词本不存在');
    }

    return {
      card,
      wasUpdated: (existing.rowCount ?? 0) > 0,
    };
  });
}

export async function listTodayWords(
  userId: number,
): Promise<StoredWord[]> {
  const result = await query<WordRow>(
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
        AND next_review <= CURRENT_DATE
      ORDER BY next_review ASC, updated_at ASC, word ASC
    `,
    [userId],
  );

  return result.rows.map(mapWordRow);
}

/**
 * 缓存命中必须按用户查，避免不同用户的词卡内容互相串用。
 */
export async function findWordByText(
  userId: number,
  word: string,
): Promise<StoredWord | null> {
  const result = await query<WordRow>(
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
        AND word = $2
    `,
    [userId, word],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordRow(result.rows[0]);
}

export async function findWordById(
  userId: number,
  id: number,
): Promise<StoredWord | null> {
  const result = await query<WordRow>(
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
        AND id = $2
    `,
    [userId, id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordRow(result.rows[0]);
}

export async function updateReviewSchedule(
  userId: number,
  id: number,
  interval: number,
  ease: number,
): Promise<StoredWord> {
  const result = await query<WordRow>(
    `
      UPDATE words
      SET
        interval = $3,
        ease = $4,
        next_review = CURRENT_DATE + $3::integer,
        review_count = review_count + 1,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING
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
    `,
    [userId, id, interval, ease],
  );

  return mapWordRow(result.rows[0]);
}
