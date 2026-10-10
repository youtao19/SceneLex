import { describe, expect, it } from 'vitest';
import { assertProductionConfig, readMigrateOnStartup } from './env';

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

/**
 * 生产环境缺 USER_API_KEY_SECRET 时宁可起不来：静默降级的话，
 * 用户模型 Key 等于用一个公开常量加密，事后无法察觉，也无法补救。
 */
describe('assertProductionConfig', () => {
  it('生产环境缺密钥时抛错，并说明去哪里配', () => {
    expect(() =>
      assertProductionConfig({ nodeEnv: 'production', userApiKeySecret: '' }),
    ).toThrow(/USER_API_KEY_SECRET/);
  });

  it('生产环境配了密钥就放行', () => {
    expect(() =>
      assertProductionConfig({ nodeEnv: 'production', userApiKeySecret: 'a-real-secret' }),
    ).not.toThrow();
  });

  it('开发与测试环境不强制，否则本地和 CI 都跑不起来', () => {
    for (const nodeEnv of ['development', 'test']) {
      expect(() => assertProductionConfig({ nodeEnv, userApiKeySecret: '' })).not.toThrow();
    }
  });
});
