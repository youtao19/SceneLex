import { query } from '../config/database';
import type {
  SystemWordBook,
  SystemWordBookDetail,
  SystemWordBookItem,
} from '../types/system-word-book';

interface SystemWordBookRow {
  id: string;
  code: string;
  name: string;
  description: string;
  total_words: string;
  learned_words: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface SystemWordBookItemRow {
  id: string;
  book_id: string;
  word: string;
  order_index: number;
  unit: string;
  difficulty: string;
  exam_meanings: unknown;
  learned: boolean;
}

function toIsoString(value: string | Date) {
  return new Date(value).toISOString();
}

function mapBookRow(row: SystemWordBookRow): SystemWordBook {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    totalWords: Number(row.total_words),
    learnedWords: Number(row.learned_words),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapItemRow(row: SystemWordBookItemRow): SystemWordBookItem {
  return {
    id: Number(row.id),
    bookId: Number(row.book_id),
    word: row.word,
    orderIndex: row.order_index,
    unit: row.unit,
    difficulty: row.difficulty,
    examMeanings: Array.isArray(row.exam_meanings)
      ? row.exam_meanings
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const data = item as Record<string, unknown>;
          const partOfSpeech = typeof data.partOfSpeech === 'string' ? data.partOfSpeech : '';
          const meaning = typeof data.meaning === 'string' ? data.meaning : '';
          const priority = Number(data.priority);

          if (!partOfSpeech || !meaning || !Number.isInteger(priority)) {
            return null;
          }

          return { partOfSpeech, meaning, priority };
        })
        .filter((item) => item !== null)
      : [],
    learned: row.learned,
  };
}

export async function listSystemWordBooks(userId: number): Promise<SystemWordBook[]> {
  const result = await query<SystemWordBookRow>(
    `
      SELECT
        b.id,
        b.code,
        b.name,
        b.description,
        COUNT(item.id)::text AS total_words,
        COUNT(w.id)::text AS learned_words,
        b.created_at,
        b.updated_at
      FROM system_word_books b
      LEFT JOIN system_word_book_items item
        ON item.book_id = b.id
      LEFT JOIN words w
        ON w.user_id = $1
        AND w.word = item.word
      GROUP BY b.id
      ORDER BY b.sort_order ASC, b.id ASC
    `,
    [userId],
  );

  return result.rows.map(mapBookRow);
}

export async function getSystemWordBookDetail(
  userId: number,
  bookId: number,
  limit: number,
  offset: number,
): Promise<SystemWordBookDetail | null> {
  const bookResult = await query<SystemWordBookRow>(
    `
      SELECT
        b.id,
        b.code,
        b.name,
        b.description,
        COUNT(item.id)::text AS total_words,
        COUNT(w.id)::text AS learned_words,
        b.created_at,
        b.updated_at
      FROM system_word_books b
      LEFT JOIN system_word_book_items item
        ON item.book_id = b.id
      LEFT JOIN words w
        ON w.user_id = $1
        AND w.word = item.word
      WHERE b.id = $2
      GROUP BY b.id
    `,
    [userId, bookId],
  );

  if (bookResult.rowCount === 0) {
    return null;
  }

  const nextWordsResult = await query<SystemWordBookItemRow>(
    `
      SELECT
        item.id,
        item.book_id,
        item.word,
        item.order_index,
        item.unit,
        item.difficulty,
        item.exam_meanings,
        (w.id IS NOT NULL) AS learned
      FROM system_word_book_items item
      LEFT JOIN words w
        ON w.user_id = $1
        AND w.word = item.word
      WHERE item.book_id = $2
      ORDER BY
        (w.id IS NOT NULL) ASC,
        item.order_index ASC,
        item.word ASC
      LIMIT $3 OFFSET $4
    `,
    [userId, bookId, limit, offset],
  );

  return {
    ...mapBookRow(bookResult.rows[0]),
    nextWords: nextWordsResult.rows.map(mapItemRow),
  };
}
