import { describe, expect, it } from 'vitest';
import { resolveEffectiveAccessStatus } from './access-status';

const NOW = new Date('2026-10-10T12:00:00Z');

function state(overrides: Partial<Parameters<typeof resolveEffectiveAccessStatus>[0]> = {}) {
  return {
    role: 'user' as const,
    accessStatus: 'active' as const,
    accessExpiresAt: '2026-11-10T12:00:00Z',
    ...overrides,
  };
}

describe('resolveEffectiveAccessStatus', () => {
  it('还在有效期内就是可用', () => {
    expect(resolveEffectiveAccessStatus(state(), NOW)).toBe('active');
  });

  it('过了到期时间就是过期，不需要谁去改数据库', () => {
    expect(resolveEffectiveAccessStatus(state({ accessExpiresAt: '2026-10-09T12:00:00Z' }), NOW)).toBe('expired');
  });

  it('到期时刻本身算过期：不能出现「显示剩余 0 天但还能用」', () => {
    expect(resolveEffectiveAccessStatus(state({ accessExpiresAt: NOW.toISOString() }), NOW)).toBe('expired');
  });

  it('停用优先于一切，包括管理员', () => {
    expect(resolveEffectiveAccessStatus(state({ accessStatus: 'suspended' }), NOW)).toBe('suspended');
    expect(
      resolveEffectiveAccessStatus(
        state({ role: 'admin', accessStatus: 'suspended', accessExpiresAt: '2026-10-09T12:00:00Z' }),
        NOW,
      ),
    ).toBe('suspended');
  });

  it('管理员不因到期而失效，否则没人能再给用户续期', () => {
    expect(
      resolveEffectiveAccessStatus(state({ role: 'admin', accessExpiresAt: '2020-01-01T00:00:00Z' }), NOW),
    ).toBe('active');
  });

  it('手工标记成过期的账号不因为时间没到就恢复', () => {
    expect(
      resolveEffectiveAccessStatus(state({ accessStatus: 'expired', accessExpiresAt: '2030-01-01T00:00:00Z' }), NOW),
    ).toBe('expired');
  });
});
