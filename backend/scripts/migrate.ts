/**
 * 手动执行迁移的 CLI。服务启动时会自动 up，这个脚本用于查看状态、排查和回滚。
 *
 * 用法:
 *   npm run migrate:status
 *   npm run migrate:up
 *   npm run migrate:down
 */
import { env } from '../src/config/env';
import { resolveMigrationsDir } from '../src/config/migrations';
import { query } from '../src/config/database';

const command = process.argv[2] ?? 'status';

/** 已执行过的迁移记录；表还没建时视为空，而不是报错。 */
async function readAppliedMigrations(): Promise<string[]> {
  const exists = await query<{ exists: boolean }>(
    `SELECT to_regclass('public.pgmigrations') IS NOT NULL AS exists`,
  );

  if (!exists.rows[0]?.exists) {
    return [];
  }

  const rows = await query<{ name: string }>(
    `SELECT name FROM pgmigrations ORDER BY id ASC`,
  );

  return rows.rows.map((row) => row.name);
}

async function runDirection(direction: 'up' | 'down') {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法执行迁移');
  }

  // node-pg-migrate v9 是纯 ESM 包，CommonJS 下只能动态 import。
  const { runner } = await import('node-pg-migrate');

  await runner({
    databaseUrl: env.databaseUrl,
    dir: resolveMigrationsDir(),
    direction,
    migrationsTable: 'pgmigrations',
    count: direction === 'up' ? Infinity : 1,
    singleTransaction: true,
    advisoryLockMode: 'wait',
    log: (message) => console.log(`[migrate] ${message}`),
  });
}

async function printStatus() {
  const applied = await readAppliedMigrations();

  if (applied.length === 0) {
    console.log('没有已执行的迁移记录');
    return;
  }

  console.log(`已执行 ${applied.length} 个迁移:`);

  for (const name of applied) {
    console.log(`  ✓ ${name}`);
  }
}

async function main() {
  if (command === 'up' || command === 'down') {
    await runDirection(command);
    return;
  }

  if (command === 'status') {
    await printStatus();
    return;
  }

  throw new Error(`不支持的迁移命令: ${command}（可用: up / down / status）`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('迁移失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
