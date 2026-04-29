import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';

let pool: Pool | null = null;

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
}
