import type { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import type {
  SaveWordResult,
  StoredWord,
  WordMeaningItem,
} from '../types/word';

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

function runUpsertWord(
  client: PoolClient,
  word: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
) {
  return client.query<WordRow>(
    `
      INSERT INTO words (
        word,
        primary_meaning,
        meanings
      )
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (word)
      DO UPDATE SET
        primary_meaning = EXCLUDED.primary_meaning,
        meanings = EXCLUDED.meanings,
        updated_at = NOW()
      RETURNING
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
    `,
    [word, primaryMeaning, JSON.stringify(meanings)],
  );
}

/**
 * 查重后再 upsert，是为了明确告诉前端本次是新增还是更新。
 */
export async function saveWordCard(
  word: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
): Promise<SaveWordResult> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM words WHERE word = $1',
      [word],
    );
    const saved = await runUpsertWord(client, word, primaryMeaning, meanings);

    return {
      card: mapWordRow(saved.rows[0]),
      wasUpdated: (existing.rowCount ?? 0) > 0,
    };
  });
}

export async function listTodayWords(today: string): Promise<StoredWord[]> {
  const result = await query<WordRow>(
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
      WHERE next_review <= $1::date
      ORDER BY next_review ASC, updated_at ASC, word ASC
    `,
    [today],
  );

  return result.rows.map(mapWordRow);
}

export async function findWordById(id: number): Promise<StoredWord | null> {
  const result = await query<WordRow>(
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
      WHERE id = $1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordRow(result.rows[0]);
}

export async function updateReviewSchedule(
  id: number,
  interval: number,
  nextReview: string,
): Promise<StoredWord> {
  const result = await query<WordRow>(
    `
      UPDATE words
      SET
        interval = $2,
        next_review = $3::date,
        review_count = review_count + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
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
    `,
    [id, interval, nextReview],
  );

  return mapWordRow(result.rows[0]);
}
