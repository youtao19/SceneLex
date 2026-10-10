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

        // DO NOTHING：种子只负责首次填充。种子词和全量词表大量重叠，之前用
        // DO UPDATE 会在每次启动时把它们拽回书首（order_index 重置、difficulty
        // 变回 'core'），把导入的正式数据改坏。
        //
        // 代价：往 SYSTEM_WORD_BOOK_SEEDS 里加词不会再自动进库，已有库要手动
        // 补一次（重跑 npm run wordbook:import，或直接 INSERT）。
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
            DO NOTHING
          `,
          [bookId, word, index + 1, 'Unit 1', 'core', JSON.stringify(examMeanings)],
        );
      }
    }
  });
}

/**
 * 没有连接串就直接失败，不要「警告一句然后照常监听端口」。
 *
 * 之前的行为是跳过初始化继续启动，于是 /health 照样返回 200：部署脚本、
 * 健康检查和监控都显示发布成功，而每个真实请求都在报数据库错误，
 * 排查时得先怀疑一圈无关的东西。宁可起不来。
 *
 * 与 USER_API_KEY_SECRET 不同，这里不区分环境——没有数据库的后端
 * 在任何环境里都没有意义，本地也一样。
 */
export function assertDatabaseConfigured(databaseUrl: string) {
  if (databaseUrl) {
    return;
  }

  throw new Error(
    [
      'DATABASE_URL 未配置，拒绝启动。',
      '',
      '本地开发：写进 backend/.env.dev.local（格式见 backend/.env 模板）。',
      '  连线上库调试要先开隧道：npm run dev:db-tunnel',
      '生产环境：写进 ecosystem.config.cjs 的 env 块，然后',
      '  pm2 restart ecosystem.config.cjs --only scenelex --update-env',
    ].join('\n'),
  );
}

/**
 * 建表交给版本化迁移，这里只负责「迁移 + 参考数据」两件事。
 * DDL 直接写在代码里会失去版本记录，改列时无处回滚，所以全部搬到了 backend/migrations。
 */
export async function initializeDatabase() {
  assertDatabaseConfigured(env.databaseUrl);

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
