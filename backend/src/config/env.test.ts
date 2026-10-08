import { describe, expect, it } from 'vitest';
import { readMigrateOnStartup } from './env';

/**
 * 这个默认值一旦被改反，线上会静默地永远不再执行迁移 —— 不会报错，只会慢慢跑偏。
 * 所以把「默认开启、只有显式 false 才关闭」钉成测试。
 */
describe('readMigrateOnStartup', () => {
  it('未配置时默认开启，保证线上继续自动迁移', () => {
    expect(readMigrateOnStartup(undefined)).toBe(true);
  });

  it('空字符串也视为开启', () => {
    expect(readMigrateOnStartup('')).toBe(true);
  });

  it('只有显式的 false 才关闭', () => {
    expect(readMigrateOnStartup('false')).toBe(false);
  });

  it('其他取值都不算关闭，避免拼错时静默停掉迁移', () => {
    for (const value of ['0', 'no', 'False', 'FALSE', 'off', 'true']) {
      expect(readMigrateOnStartup(value)).toBe(true);
    }
  });
});
