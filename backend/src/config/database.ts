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
      CREATE TABLE IF NOT EXISTS words (
        id BIGSERIAL PRIMARY KEY,
        word TEXT NOT NULL UNIQUE,
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
      CREATE INDEX IF NOT EXISTS idx_words_next_review
      ON words (next_review)
    `,
  );
}
