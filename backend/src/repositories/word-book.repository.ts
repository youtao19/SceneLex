import type { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import type { StoredWord, WordMeaningItem } from '../types/word';
import type { WordBook, WordBookDetail } from '../types/word-book';

interface WordBookRow {
  id: string;
  name: string;
  is_default: boolean;
  word_count: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface WordRow {
  id: string;
  word: string;
  phonetic: string;
  primary_meaning: string;
  meanings: WordMeaningItem[];
  ease: number;
  interval: number;
  next_review: string | Date;
  review_count: number;
  created_at: string | Date;
  updated_at: string | Date;
}

function toDateString(value: string | Date) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function mapWordBookRow(row: WordBookRow): WordBook {
  return {
    id: Number(row.id),
    name: row.name,
    isDefault: row.is_default,
    wordCount: Number(row.word_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
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

async function insertDefaultBookIfMissing(client: PoolClient, userId: number) {
  await client.query(
    `
      INSERT INTO word_books (user_id, name, is_default)
      SELECT $1, '默认单词本', TRUE
      WHERE NOT EXISTS (
        SELECT 1
        FROM word_books
        WHERE user_id = $1
          AND is_default = TRUE
      )
    `,
    [userId],
  );
}

async function findDefaultBookId(client: PoolClient, userId: number) {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM word_books
      WHERE user_id = $1
        AND is_default = TRUE
      LIMIT 1
    `,
    [userId],
  );

  return Number(result.rows[0].id);
}

async function linkOrphanWordsToDefaultBook(
  client: PoolClient,
  userId: number,
  defaultBookId: number,
) {
  await client.query(
    `
      INSERT INTO word_book_items (book_id, word_id)
      SELECT $1, w.id
      FROM words w
      WHERE w.user_id = $2
        AND NOT EXISTS (
          SELECT 1
          FROM word_book_items item
          WHERE item.word_id = w.id
        )
      ON CONFLICT DO NOTHING
    `,
    [defaultBookId, userId],
  );
}

/**
 * 默认本是旧数据迁移的兜底入口，所有列表和保存路径都先保证它存在。
 */
export async function ensureDefaultWordBook(
  client: PoolClient,
  userId: number,
) {
  await insertDefaultBookIfMissing(client, userId);
  const defaultBookId = await findDefaultBookId(client, userId);
  await linkOrphanWordsToDefaultBook(client, userId, defaultBookId);

  return defaultBookId;
}

export async function listWordBooks(userId: number): Promise<WordBook[]> {
  return withTransaction(async (client) => {
    await ensureDefaultWordBook(client, userId);

    const result = await client.query<WordBookRow>(
      `
        SELECT
          b.id,
          b.name,
          b.is_default,
          COUNT(item.word_id)::text AS word_count,
          b.created_at,
          b.updated_at
        FROM word_books b
        LEFT JOIN word_book_items item
          ON item.book_id = b.id
        WHERE b.user_id = $1
        GROUP BY b.id
        ORDER BY b.is_default DESC, b.updated_at DESC, b.name ASC
      `,
      [userId],
    );

    return result.rows.map(mapWordBookRow);
  });
}

export async function findWordBook(
  userId: number,
  bookId: number,
): Promise<WordBook | null> {
  const result = await query<WordBookRow>(
    `
      SELECT
        b.id,
        b.name,
        b.is_default,
        COUNT(item.word_id)::text AS word_count,
        b.created_at,
        b.updated_at
      FROM word_books b
      LEFT JOIN word_book_items item
        ON item.book_id = b.id
      WHERE b.user_id = $1
        AND b.id = $2
      GROUP BY b.id
    `,
    [userId, bookId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordBookRow(result.rows[0]);
}

export async function getWordBookDetail(
  userId: number,
  bookId: number,
): Promise<WordBookDetail | null> {
  return withTransaction(async (client) => {
    await ensureDefaultWordBook(client, userId);
    const book = await findWordBook(userId, bookId);

    if (!book) {
      return null;
    }

    const wordsResult = await client.query<WordRow>(
      `
        SELECT
          w.id,
          w.word,
          w.phonetic,
          w.primary_meaning,
          w.meanings,
          w.ease,
          w.interval,
          w.next_review,
          w.review_count,
          w.created_at,
          w.updated_at
        FROM word_book_items item
        INNER JOIN words w
          ON w.id = item.word_id
        WHERE item.book_id = $1
          AND w.user_id = $2
        ORDER BY item.added_at DESC, w.word ASC
      `,
      [bookId, userId],
    );

    return {
      ...book,
      words: wordsResult.rows.map(mapWordRow),
    };
  });
}

export async function createWordBook(
  userId: number,
  name: string,
): Promise<WordBook> {
  const result = await query<WordBookRow>(
    `
      INSERT INTO word_books (user_id, name)
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        is_default,
        '0' AS word_count,
        created_at,
        updated_at
    `,
    [userId, name],
  );

  return mapWordBookRow(result.rows[0]);
}

export async function renameWordBook(
  userId: number,
  bookId: number,
  name: string,
): Promise<WordBook | null> {
  const result = await query<WordBookRow>(
    `
      UPDATE word_books
      SET
        name = $3,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING
        id,
        name,
        is_default,
        (
          SELECT COUNT(*)::text
          FROM word_book_items item
          WHERE item.book_id = word_books.id
        ) AS word_count,
        created_at,
        updated_at
    `,
    [userId, bookId, name],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordBookRow(result.rows[0]);
}

export async function deleteWordBook(userId: number, bookId: number) {
  const result = await query<{ id: string }>(
    `
      DELETE FROM word_books
      WHERE user_id = $1
        AND id = $2
        AND is_default = FALSE
      RETURNING id
    `,
    [userId, bookId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function addWordToBooks(
  client: PoolClient,
  userId: number,
  wordId: number,
  bookIds: number[],
) {
  const targetBookIds = bookIds.length > 0
    ? bookIds
    : [await ensureDefaultWordBook(client, userId)];

  const validBooks = await client.query<{ id: string }>(
    `
      SELECT id
      FROM word_books
      WHERE user_id = $1
        AND id = ANY($2::bigint[])
    `,
    [userId, targetBookIds],
  );
  const validBookIds = validBooks.rows.map((row) => Number(row.id));

  for (const bookId of validBookIds) {
    await client.query(
      `
        INSERT INTO word_book_items (book_id, word_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [bookId, wordId],
    );
  }

  return validBookIds.length;
}

export async function removeWordFromBook(
  userId: number,
  bookId: number,
  wordId: number,
) {
  const result = await query(
    `
      DELETE FROM word_book_items item
      USING word_books b, words w
      WHERE item.book_id = b.id
        AND item.word_id = w.id
        AND b.user_id = $1
        AND w.user_id = $1
        AND item.book_id = $2
        AND item.word_id = $3
      RETURNING item.word_id
    `,
    [userId, bookId, wordId],
  );

  return (result.rowCount ?? 0) > 0;
}
