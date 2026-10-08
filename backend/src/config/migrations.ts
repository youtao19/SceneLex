import path from 'path';
import { env } from './env';

/**
 * 迁移文件放在 backend/migrations，和 src、dist 同级。
 * 必须从当前文件位置推导：dev 是 src/config，prod 是 dist/config，两边都指到同一目录。
 */
export function resolveMigrationsDir() {
  return path.resolve(__dirname, '../../migrations');
}

/**
 * 启动时把未执行的迁移跑完。
 *
 * 用 advisory lock 等待而不是直接失败：PM2 重启时新旧进程可能短暂重叠，
 * 等待锁能让后来者跳过迁移，而不是让服务起不来。
 *
 * node-pg-migrate v9 是纯 ESM 包，CommonJS 下只能动态 import。
 */
export async function runMigrations() {
  if (!env.databaseUrl) {
    return;
  }

  const { runner } = await import('node-pg-migrate');

  await runner({
    databaseUrl: env.databaseUrl,
    dir: resolveMigrationsDir(),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    singleTransaction: true,
    advisoryLockMode: 'wait',
    log: (message) => console.log(`[migrate] ${message}`),
  });
}
