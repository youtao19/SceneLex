import type { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { addWordToBooks, ensureDefaultWordBook } from './word-book.repository';
import { HttpError } from '../utils/http-error';
import { buildPrimaryMeaning } from '../utils/word-meaning';
import { LEARNING_DAY_SQL, learningDayOfSql } from '../utils/learning-day';
import type {
  NewWordCandidate,
  ReviewSnapshot,
  SaveWordResult,
  StoredWord,
  WordMeaningItem,
  WordRequiredMeaning,
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
  study_version: number;
  first_learned_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/**
 * 所有查询共用一份列清单：加字段只改这里，
 * 否则漏掉某个查询会让前端拿到 undefined 而不是报错。
 */
const WORD_COLUMNS = `
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
  updated_at
`;

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

function toNullableIsoString(value: string | Date | null) {
  return value === null ? null : new Date(value).toISOString();
}

function mapWordRow(row: WordRow): StoredWord {
  return {
    id: Number(row.id),
    word: row.word,
    phonetic: row.phonetic,
    primaryMeaning: buildPrimaryMeaning(row.meanings),
    meanings: row.meanings,
    ease: Number(row.ease),
    interval: Number(row.interval),
    nextReview: toDateString(row.next_review),
    reviewCount: Number(row.review_count),
    studyVersion: Number(row.study_version),
    firstLearnedAt: toNullableIsoString(row.first_learned_at),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function readExamMeanings(value: unknown): WordRequiredMeaning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: WordRequiredMeaning[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const data = item as Record<string, unknown>;
    const partOfSpeech = typeof data.partOfSpeech === 'string' ? data.partOfSpeech : '';
    const meaning = typeof data.meaning === 'string' ? data.meaning : '';
    const priority = Number(data.priority);

    if (!partOfSpeech || !meaning || !Number.isInteger(priority)) {
      continue;
    }

    result.push({ partOfSpeech, meaning, priority });
  }

  return result;
}

/**
 * 首次保存即“首次完成”：老库按这个口径把已存在的词视为已学，
 * 单独一列是为了撤销首次完成时能收回当日计数而不删词卡。
 */
function runUpsertWord(
  client: PoolClient,
  userId: number,
  word: string,
  phonetic: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
  markFirstLearned: boolean,
) {
  return client.query<WordRow>(
    `
      INSERT INTO words (
        user_id,
        word,
        phonetic,
        primary_meaning,
        meanings,
        first_learned_at,
        next_review
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        ${markFirstLearned ? 'NOW()' : 'NULL'},
        ${LEARNING_DAY_SQL} + 1
      )
      ON CONFLICT (user_id, word)
      DO UPDATE SET
        phonetic = EXCLUDED.phonetic,
        primary_meaning = EXCLUDED.primary_meaning,
        meanings = EXCLUDED.meanings,
        first_learned_at = COALESCE(words.first_learned_at, EXCLUDED.first_learned_at),
        updated_at = NOW()
      RETURNING ${WORD_COLUMNS}
    `,
    [userId, word, phonetic, primaryMeaning, JSON.stringify(meanings)],
  );
}

/**
 * 事务内用：拿到行锁，后续排期判断和写入之间不会被另一端插进来。
 */
export async function findWordByIdForUpdate(
  client: PoolClient,
  userId: number,
  id: number,
): Promise<StoredWord | null> {
  const result = await client.query<WordRow>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE user_id = $1 AND id = $2 FOR UPDATE`,
    [userId, id],
  );

  return result.rowCount === 0 ? null : mapWordRow(result.rows[0]);
}

export async function findWordByTextForUpdate(
  client: PoolClient,
  userId: number,
  word: string,
): Promise<StoredWord | null> {
  const result = await client.query<WordRow>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE user_id = $1 AND word = $2 FOR UPDATE`,
    [userId, word],
  );

  return result.rowCount === 0 ? null : mapWordRow(result.rows[0]);
}

/**
 * 保存词卡内容；markFirstLearned 决定这行是否算“已完成新词”。
 */
export async function upsertWordCard(
  client: PoolClient,
  userId: number,
  word: string,
  phonetic: string,
  primaryMeaning: string,
  meanings: WordMeaningItem[],
  markFirstLearned: boolean,
): Promise<StoredWord> {
  const saved = await runUpsertWord(
    client,
    userId,
    word,
    phonetic,
    primaryMeaning,
    meanings,
    markFirstLearned,
  );

  return mapWordRow(saved.rows[0]);
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
    // PC 的“保存单词”沿用“保存即已学”，与移动端“完成新词”口径一致。
    const card = await upsertWordCard(
      client,
      userId,
      word,
      phonetic,
      primaryMeaning,
      meanings,
      true,
    );
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

/**
 * 到期判断统一走学习日（北京时间 04:00），不再用 CURRENT_DATE。
 */
export async function listTodayWords(
  userId: number,
  limit?: number,
): Promise<StoredWord[]> {
  const result = await query<WordRow>(
    `
      SELECT ${WORD_COLUMNS}
      FROM words
      WHERE user_id = $1
        AND next_review <= ${LEARNING_DAY_SQL}
      ORDER BY
        GREATEST(${LEARNING_DAY_SQL} - next_review, 0)::double precision / GREATEST(interval, 1) DESC,
        next_review ASC,
        updated_at ASC,
        word ASC
      ${limit ? 'LIMIT $2' : ''}
    `,
    limit ? [userId, limit] : [userId],
  );

  return result.rows.map(mapWordRow);
}

/**
 * 到期总数不受队列数量限制影响：判断“今天还有没有复习”必须看这个数。
 */
export async function countDueWords(userId: number): Promise<number> {
  const result = await query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM words
      WHERE user_id = $1
        AND next_review <= ${LEARNING_DAY_SQL}
    `,
    [userId],
  );

  return Number(result.rows[0]?.total ?? 0);
}

/**
 * 当日新词完成数：按首次完成时间落在当前学习日统计，
 * 单词表本身按 (user_id, word) 唯一，所以天然按规范化单词去重。
 */
export async function countNewWordCompletions(userId: number): Promise<number> {
  const result = await query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM words
      WHERE user_id = $1
        AND first_learned_at IS NOT NULL
        AND ${learningDayOfSql('first_learned_at')} = ${LEARNING_DAY_SQL}
    `,
    [userId],
  );

  return Number(result.rows[0]?.total ?? 0);
}

/**
 * 顺序取当前词书里还没学过的词：个人 words 里已存在即视为已学，
 * 所以从别的词书学过的词在这里会被自动跳过（跨书去重）。
 */
export async function listNewWords(
  userId: number,
  bookId: number,
  limit: number,
): Promise<NewWordCandidate[]> {
  if (limit <= 0) {
    return [];
  }

  const result = await query<{
    id: string;
    word: string;
    order_index: number;
    unit: string;
    exam_meanings: unknown;
  }>(
    `
      SELECT
        item.id,
        item.word,
        item.order_index,
        item.unit,
        item.exam_meanings
      FROM system_word_book_items item
      LEFT JOIN words w
        ON w.user_id = $1
        AND w.word = item.word
      WHERE item.book_id = $2
        AND w.id IS NULL
      ORDER BY item.order_index ASC, item.word ASC
      LIMIT $3
    `,
    [userId, bookId, limit],
  );

  return result.rows.map((row) => ({
    itemId: Number(row.id),
    word: row.word,
    orderIndex: row.order_index,
    unit: row.unit,
    examMeanings: readExamMeanings(row.exam_meanings),
  }));
}

/**
 * 缓存命中必须按用户查，避免不同用户的词卡内容互相串用。
 */
export async function findWordByText(
  userId: number,
  word: string,
): Promise<StoredWord | null> {
  const result = await query<WordRow>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE user_id = $1 AND word = $2`,
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
    `SELECT ${WORD_COLUMNS} FROM words WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapWordRow(result.rows[0]);
}

/**
 * 写入新排期：next_review 从学习日算起，study_version +1 供双端冲突检测。
 */
export async function applyReviewSchedule(
  client: PoolClient,
  userId: number,
  id: number,
  schedule: { interval: number; ease: number },
): Promise<StoredWord> {
  const result = await client.query<WordRow>(
    `
      UPDATE words
      SET
        interval = $3,
        ease = $4,
        next_review = ${LEARNING_DAY_SQL} + $3::integer,
        review_count = review_count + 1,
        first_learned_at = COALESCE(first_learned_at, NOW()),
        study_version = study_version + 1,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING ${WORD_COLUMNS}
    `,
    [userId, id, schedule.interval, schedule.ease],
  );

  return mapWordRow(result.rows[0]);
}

/**
 * 撤销只恢复排期字段：教学内容和词书归属不参与回滚，
 * firstLearnedAt 传 null 表示这次要连“已完成新词”一起收回。
 */
export async function restoreReviewSchedule(
  client: PoolClient,
  userId: number,
  id: number,
  snapshot: ReviewSnapshot,
): Promise<StoredWord> {
  const result = await client.query<WordRow>(
    `
      UPDATE words
      SET
        interval = $3,
        ease = $4,
        next_review = $5::date,
        review_count = $6,
        first_learned_at = $7::timestamptz,
        study_version = study_version + 1,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING ${WORD_COLUMNS}
    `,
    [
      userId,
      id,
      snapshot.interval,
      snapshot.ease,
      snapshot.nextReview,
      snapshot.reviewCount,
      snapshot.firstLearnedAt,
    ],
  );

  return mapWordRow(result.rows[0]);
}

/** 操作回执里记录的“改之前是什么样”，撤销时原样恢复。 */
export function toReviewSnapshot(word: StoredWord): ReviewSnapshot {
  return {
    ease: word.ease,
    interval: word.interval,
    nextReview: word.nextReview,
    reviewCount: word.reviewCount,
    firstLearnedAt: word.firstLearnedAt,
  };
}
