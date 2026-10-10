import { describe, expect, it } from 'vitest';
import {
  assertProductionConfig,
  readMigrateOnStartup,
  readSystemEndpointCallLimit,
  readTrustProxyHops,
} from './env';

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

/**
 * 跳数写错的两个方向都会出事：数少了所有用户共用一个限流桶，
 * 数多了攻击者伪造的 X-Forwarded-For 会被当成真实客户端。
 */
describe('readTrustProxyHops', () => {
  it('未配置时用线上链路的值：Cloudflare + Nginx 两跳', () => {
    expect(readTrustProxyHops(undefined)).toBe(2);
  });

  it('0 是合法值，表示不信任任何代理', () => {
    expect(readTrustProxyHops('0')).toBe(0);
  });

  it('显式配置按配置走，覆盖不套 Cloudflare 的部署', () => {
    expect(readTrustProxyHops('1')).toBe(1);
    expect(readTrustProxyHops('3')).toBe(3);
  });

  it('非法值回落到默认两跳，而不是回落到 0', () => {
    for (const value of ['', 'abc', '-1', '1.5']) {
      expect(readTrustProxyHops(value)).toBe(2);
    }
  });
});

/**
 * 系统端点配额写错时必须回落到默认值，不能回落到「不限」——
 * 一个字符的笔误不该把管理员账单的保护整个关掉。
 */
describe('readSystemEndpointCallLimit', () => {
  it('未配置时用默认上限', () => {
    expect(readSystemEndpointCallLimit(undefined, 200)).toBe(200);
    expect(readSystemEndpointCallLimit('  ', 200)).toBe(200);
  });

  it('显式配置按配置走', () => {
    expect(readSystemEndpointCallLimit('50', 200)).toBe(50);
  });

  it('0 是明确的「不限」，是唯一能关掉配额的值', () => {
    expect(readSystemEndpointCallLimit('0', 200)).toBe(0);
  });

  it('非法值回落到默认上限，而不是回落到不限', () => {
    for (const value of ['abc', '-1', '1.5', '200次']) {
      expect(readSystemEndpointCallLimit(value, 200)).toBe(200);
    }
  });
});
