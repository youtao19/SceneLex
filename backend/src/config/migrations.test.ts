import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { resolveMigrationsDir } from './migrations';

/**
 * node-pg-migrate 会把迁移目录里的每个文件都当迁移加载，文件名前缀不是数字就直接抛错，
 * 后端因此起不来。曾经在 migrations/ 里放过一个 README.md，线上会直接挂掉，
 * 所以这里把「目录里只能有迁移文件」钉成测试。
 */
describe('migrations 目录', () => {
  it('只包含 <时间戳>_<描述>.cjs 形式的迁移文件', () => {
    const files = fs.readdirSync(resolveMigrationsDir());

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(file).toMatch(/^\d+_[a-z0-9_]+\.cjs$/);
    }
  });

  it('迁移文件名按字典序排列等于按时间戳排列', () => {
    const names = fs
      .readdirSync(resolveMigrationsDir())
      .map((file) => Number(file.split('_')[0]));

    const sorted = [...names].sort((a, b) => a - b);

    expect(names).toEqual(sorted);
    expect(new Set(names).size).toBe(names.length);
  });
});
