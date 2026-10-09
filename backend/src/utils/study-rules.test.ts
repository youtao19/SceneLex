import { describe, expect, it } from 'vitest';
import {
  applyDailyReviewLimit,
  assertExpectedVersion,
  buildOperationFingerprint,
  normalizeNewWordTarget,
  normalizeOperationId,
} from './study-rules';

describe('normalizeNewWordTarget', () => {
  it('0 表示只复习，200 是上限', () => {
    expect(normalizeNewWordTarget(0)).toBe(0);
    expect(normalizeNewWordTarget(200)).toBe(200);
  });

  it('超出范围或非整数直接拒绝，不截断', () => {
    expect(() => normalizeNewWordTarget(-1)).toThrow('每日新词目标');
    expect(() => normalizeNewWordTarget(201)).toThrow('每日新词目标');
    expect(() => normalizeNewWordTarget(2.5)).toThrow('每日新词目标');
  });
});

describe('normalizeOperationId', () => {
  it('不传表示旧客户端，返回 null', () => {
    expect(normalizeOperationId(undefined)).toBeNull();
    expect(normalizeOperationId(null)).toBeNull();
  });

  it('太短或太长的 ID 都拒绝', () => {
    expect(() => normalizeOperationId('short')).toThrow('operationId 非法');
    expect(() => normalizeOperationId('x'.repeat(129))).toThrow('operationId 非法');
  });

  it('去掉首尾空白后返回', () => {
    expect(normalizeOperationId('  operation-1234  ')).toBe('operation-1234');
  });
});

describe('buildOperationFingerprint', () => {
  it('字段顺序不同、值相同算同一个操作', () => {
    const left = buildOperationFingerprint('review', { wordId: 1, rating: 'good' });
    const right = buildOperationFingerprint('review', { rating: 'good', wordId: 1 });

    expect(left).toBe(right);
  });

  it('内容不同就是不同操作，不能互相顶替', () => {
    const left = buildOperationFingerprint('review', { wordId: 1, rating: 'good' });
    const right = buildOperationFingerprint('review', { wordId: 1, rating: 'again' });

    expect(left).not.toBe(right);
  });

  it('不同 kind 不共享指纹', () => {
    expect(buildOperationFingerprint('review', { wordId: 1 })).not.toBe(
      buildOperationFingerprint('rollback', { wordId: 1 }),
    );
  });
});

describe('assertExpectedVersion', () => {
  it('版本一致放行', () => {
    expect(() => assertExpectedVersion(3, 3)).not.toThrow();
  });

  it('版本落后说明另一端已改过，返回冲突', () => {
    expect(() => assertExpectedVersion(4, 3)).toThrowError(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('旧客户端不带版本时跳过校验', () => {
    expect(() => assertExpectedVersion(4, undefined)).not.toThrow();
    expect(() => assertExpectedVersion(4, null)).not.toThrow();
  });

  it('版本字段本身非法时返回参数错误', () => {
    expect(() => assertExpectedVersion(4, 'abc')).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe('applyDailyReviewLimit', () => {
  it('关闭限制时返回全部到期数', () => {
    expect(applyDailyReviewLimit(120, false, 20)).toBe(120);
  });

  it('开启限制时只裁剪队列，不改到期总数', () => {
    expect(applyDailyReviewLimit(120, true, 20)).toBe(20);
    expect(applyDailyReviewLimit(5, true, 20)).toBe(5);
  });
});
