import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';
import { runMigrations } from './migrations';

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

/**
 * 建表交给版本化迁移，这里只负责「迁移 + 参考数据」两件事。
 * DDL 直接写在代码里会失去版本记录，改列时无处回滚，所以全部搬到了 backend/migrations。
 */
export async function initializeDatabase() {
  if (!env.databaseUrl) {
    console.warn('DATABASE_URL 未配置，跳过 PostgreSQL 初始化。');
    return;
  }

  if (!env.migrateOnStartup) {
    // 本地开发连线上库时必须关掉：启动自动迁移会把本地还没发布的迁移直接应用到线上。
    // 仍然探测一次连通性，避免连不上时静默启动。
    await query('SELECT 1');
    console.log('[db] MIGRATE_ON_STARTUP=false，跳过迁移与词书播种');
    return;
  }

  await runMigrations();

  // 内置词书是随版本迭代的参考数据，不属于 schema，因此放在迁移之后。
  await seedSystemWordBooks();
}
