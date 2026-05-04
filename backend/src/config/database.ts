import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';

let pool: Pool | null = null;

const SYSTEM_WORD_BOOK_SEEDS = [
  {
    code: 'cet4',
    name: '四级核心词',
    description: '大学英语四级高频基础词，适合从通用考试词汇开始。',
    sortOrder: 10,
    words: ['abandon', 'ability', 'absorb', 'academic', 'access', 'account', 'achieve', 'adapt', 'adequate', 'advance'],
  },
  {
    code: 'cet6',
    name: '六级核心词',
    description: '大学英语六级常见进阶词，适合在四级基础上继续扩展。',
    sortOrder: 20,
    words: [
      {
        word: 'ambiguous',
        examMeanings: [
          { partOfSpeech: 'adj.', meaning: '模棱两可的', priority: 1 },
          { partOfSpeech: 'adj.', meaning: '有歧义的', priority: 2 },
        ],
      },
      {
        word: 'anticipate',
        examMeanings: [
          { partOfSpeech: 'v.', meaning: '预期', priority: 1 },
          { partOfSpeech: 'v.', meaning: '提前应对', priority: 2 },
        ],
      },
      {
        word: 'approximate',
        examMeanings: [
          { partOfSpeech: 'adj.', meaning: '大约的', priority: 1 },
          { partOfSpeech: 'v.', meaning: '接近', priority: 2 },
        ],
      },
      {
        word: 'capacity',
        examMeanings: [
          { partOfSpeech: 'n.', meaning: '能力', priority: 1 },
          { partOfSpeech: 'n.', meaning: '容量', priority: 2 },
        ],
      },
      {
        word: 'collapse',
        examMeanings: [
          { partOfSpeech: 'v.', meaning: '倒塌', priority: 1 },
          { partOfSpeech: 'n.', meaning: '崩溃', priority: 2 },
        ],
      },
      {
        word: 'comprehensive',
        examMeanings: [
          { partOfSpeech: 'adj.', meaning: '全面的', priority: 1 },
          { partOfSpeech: 'adj.', meaning: '综合的', priority: 2 },
        ],
      },
      {
        word: 'controversy',
        examMeanings: [
          { partOfSpeech: 'n.', meaning: '争议', priority: 1 },
          { partOfSpeech: 'n.', meaning: '争论', priority: 2 },
        ],
      },
      {
        word: 'dimension',
        examMeanings: [
          { partOfSpeech: 'n.', meaning: '方面', priority: 1 },
          { partOfSpeech: 'n.', meaning: '维度', priority: 2 },
        ],
      },
      {
        word: 'eliminate',
        examMeanings: [
          { partOfSpeech: 'v.', meaning: '消除', priority: 1 },
          { partOfSpeech: 'v.', meaning: '淘汰', priority: 2 },
        ],
      },
      {
        word: 'substantial',
        examMeanings: [
          { partOfSpeech: 'adj.', meaning: '大量的', priority: 1 },
          { partOfSpeech: 'adj.', meaning: '实质的', priority: 2 },
        ],
      },
    ],
  },
  {
    code: 'postgraduate',
    name: '考研核心词',
    description: '考研英语常见核心词，优先覆盖阅读和写作高频表达。',
    sortOrder: 30,
    words: ['analysis', 'approach', 'assumption', 'concept', 'context', 'derive', 'emphasis', 'evidence', 'indicate', 'significant'],
  },
  {
    code: 'tem4',
    name: '专四核心词',
    description: '英语专业四级基础核心词，兼顾语言学术表达和常用语义辨析。',
    sortOrder: 40,
    words: ['coherent', 'compound', 'connotation', 'dictation', 'fluent', 'interpret', 'literal', 'morphology', 'phrase', 'syntax'],
  },
  {
    code: 'tem8',
    name: '专八核心词',
    description: '英语专业八级进阶词，适合高阶阅读、翻译和写作积累。',
    sortOrder: 50,
    words: ['aesthetic', 'allegory', 'discourse', 'elaborate', 'empirical', 'metaphor', 'nuance', 'paradigm', 'rhetoric', 'sophisticated'],
  },
];

function createPool() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法连接 PostgreSQL');
  }

  return new Pool({
    connectionString: env.databaseUrl,
  });
}

export function getDatabasePool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getDatabasePool().query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDatabasePool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 内置词书只提供全局学习模板，用户进度仍然由自己的 words 表判断。
 */
async function seedSystemWordBooks() {
  await withTransaction(async (client) => {
    for (const book of SYSTEM_WORD_BOOK_SEEDS) {
      const bookResult = await client.query<{ id: string }>(
        `
          INSERT INTO system_word_books (code, name, description, sort_order)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
          RETURNING id
        `,
        [book.code, book.name, book.description, book.sortOrder],
      );
      const bookId = Number(bookResult.rows[0].id);

      for (const [index, item] of book.words.entries()) {
        const word = typeof item === 'string' ? item : item.word;
        const examMeanings = typeof item === 'string' ? [] : item.examMeanings;

        await client.query(
          `
            INSERT INTO system_word_book_items (
              book_id,
              word,
              order_index,
              unit,
              difficulty,
              exam_meanings
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (book_id, word)
            DO UPDATE SET
              order_index = EXCLUDED.order_index,
              unit = EXCLUDED.unit,
              difficulty = EXCLUDED.difficulty,
              exam_meanings = EXCLUDED.exam_meanings
          `,
          [bookId, word, index + 1, 'Unit 1', 'core', JSON.stringify(examMeanings)],
        );
      }
    }
  });
}

export async function initializeDatabase() {
  if (!env.databaseUrl) {
    console.warn('DATABASE_URL 未配置，跳过 PostgreSQL 初始化。');
    return;
  }

  await query(
    `
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL,
        access_status TEXT NOT NULL DEFAULT 'active',
        access_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active'
    `,
  );

  await query(
    `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `,
  );

  await query(
    `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS access_keys (
        id BIGSERIAL PRIMARY KEY,
        key_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        granted_days INTEGER NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        bound_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        note TEXT NOT NULL DEFAULT '',
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_access_keys_status
      ON access_keys (status)
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash
      ON user_sessions (token_hash)
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
      ON user_sessions (user_id)
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS user_learning_settings (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        daily_review_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        daily_review_limit INTEGER NOT NULL DEFAULT 20,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_learning_settings_daily_review_limit_check
          CHECK (daily_review_limit BETWEEN 1 AND 200)
      )
    `,
  );

  await query(
    `
      ALTER TABLE user_learning_settings
      ADD COLUMN IF NOT EXISTS daily_review_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS words (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        phonetic TEXT NOT NULL DEFAULT '',
        primary_meaning TEXT NOT NULL,
        meanings JSONB NOT NULL,
        ease DOUBLE PRECISION NOT NULL DEFAULT 2.5,
        interval INTEGER NOT NULL DEFAULT 1,
        next_review DATE NOT NULL DEFAULT CURRENT_DATE + 1,
        review_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      ALTER TABLE words
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    `,
  );

  await query(
    `
      ALTER TABLE words
      ADD COLUMN IF NOT EXISTS phonetic TEXT NOT NULL DEFAULT ''
    `,
  );

  await query(
    `
      ALTER TABLE words
      DROP CONSTRAINT IF EXISTS words_word_key
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_words_user_word
      ON words (user_id, word)
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_words_next_review
      ON words (next_review)
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_words_user_next_review
      ON words (user_id, next_review)
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS word_books (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_word_books_user_name
      ON word_books (user_id, name)
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_word_books_default
      ON word_books (user_id)
      WHERE is_default = TRUE
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS word_book_items (
        book_id BIGINT NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
        word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (book_id, word_id)
      )
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_word_book_items_word_id
      ON word_book_items (word_id)
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS system_word_books (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      CREATE TABLE IF NOT EXISTS system_word_book_items (
        id BIGSERIAL PRIMARY KEY,
        book_id BIGINT NOT NULL REFERENCES system_word_books(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT '',
        exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      ALTER TABLE system_word_book_items
      ADD COLUMN IF NOT EXISTS exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_system_word_book_items_book_word
      ON system_word_book_items (book_id, word)
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_system_word_book_items_book_order
      ON system_word_book_items (book_id, order_index)
    `,
  );

  await seedSystemWordBooks();

  await query(
    `
      CREATE TABLE IF NOT EXISTS reading_articles (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_articles_user_hash
      ON reading_articles (user_id, content_hash)
    `,
  );

  await query(
    `
      CREATE INDEX IF NOT EXISTS idx_reading_articles_user_updated
      ON reading_articles (user_id, updated_at DESC)
    `,
  );
}
