import { describe, expect, it } from 'vitest';
import {
  buildQuotaMessage,
  readUsagePeriod,
  readUsageSource,
} from './model-usage.service';
import type { AiEndpoint } from '../types/endpoint';
import type { ModelUsageLimits } from '../types/model-usage';

function buildEndpoint(trusted: boolean): AiEndpoint {
  return {
    id: trusted ? 0 : 7,
    label: 'test',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'test-model',
    visionModel: '',
    trusted,
  };
}

const LIMITS: ModelUsageLimits = { dailyCalls: 200, monthlyCalls: 3000 };

describe('readUsageSource', () => {
  it('把系统端点单独标出来，因为只有它花的是管理员的钱', () => {
    expect(readUsageSource(buildEndpoint(true))).toBe('system');
  });

  it('用户自己配的端点算他自己的用量', () => {
    expect(readUsageSource(buildEndpoint(false))).toBe('user');
  });
});

describe('buildQuotaMessage', () => {
  it('额度内放行', () => {
    expect(buildQuotaMessage({ todayCalls: 199, monthCalls: 2999 }, LIMITS)).toBeNull();
  });

  it('上限是允许的次数：用完最后一次就算超额', () => {
    expect(buildQuotaMessage({ todayCalls: 200, monthCalls: 200 }, LIMITS)).toContain('今天');
  });

  it('日额度先于月额度报出来，用户看到的是最近的那个限制', () => {
    const message = buildQuotaMessage({ todayCalls: 999, monthCalls: 9999 }, LIMITS);

    expect(message).toContain('每天 200 次');
  });

  it('日额度用完但月额度还有时只提今天', () => {
    const message = buildQuotaMessage({ todayCalls: 200, monthCalls: 500 }, LIMITS);

    expect(message).toContain('明天再试');
    expect(message).not.toContain('联系管理员');
  });

  it('月额度用完时报的是月限制', () => {
    const message = buildQuotaMessage({ todayCalls: 0, monthCalls: 3000 }, LIMITS);

    expect(message).toContain('每月 3000 次');
  });

  it('0 表示不限，不拦任何调用', () => {
    const unlimited: ModelUsageLimits = { dailyCalls: 0, monthlyCalls: 0 };

    expect(buildQuotaMessage({ todayCalls: 10_000, monthCalls: 10_000 }, unlimited)).toBeNull();
  });

  it('可以只关掉其中一项', () => {
    expect(buildQuotaMessage({ todayCalls: 9999, monthCalls: 5 }, { dailyCalls: 0, monthlyCalls: 3000 })).toBeNull();
    expect(buildQuotaMessage({ todayCalls: 1, monthCalls: 3000 }, { dailyCalls: 0, monthlyCalls: 3000 })).toContain('本月');
  });
});

describe('readUsagePeriod', () => {
  it('跨过北京时间 04:00 才算新的一天', () => {
    // 北京时间 2026-10-11 03:59 = UTC 2026-10-10 19:59
    expect(readUsagePeriod(new Date('2026-10-10T19:59:00Z')).usageDate).toBe('2026-10-10');
    // 北京时间 2026-10-11 04:00 = UTC 2026-10-10 20:00
    expect(readUsagePeriod(new Date('2026-10-10T20:00:00Z')).usageDate).toBe('2026-10-11');
  });

  it('月初从学习日推出来，避免自然月和学习日两套边界打架', () => {
    // 北京时间 2026-11-01 02:00 仍属于 10 月 31 日那个学习日
    const { usageDate, monthStart } = readUsagePeriod(new Date('2026-10-31T18:00:00Z'));

    expect(usageDate).toBe('2026-10-31');
    expect(monthStart).toBe('2026-10-01');
  });
});
