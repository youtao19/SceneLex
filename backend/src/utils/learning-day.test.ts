import { describe, expect, it } from 'vitest';
import { LEARNING_DAY_SQL, getLearningDay } from './learning-day';

/**
 * 学习日边界是最容易改错又最难发现的规则，用北京时间 04:00 前后各一秒钉住。
 */
describe('getLearningDay', () => {
  it('北京时间 03:59:59 仍算前一天', () => {
    // 2026-10-10 03:59:59 +08:00
    expect(getLearningDay(new Date('2026-10-09T19:59:59Z'))).toBe('2026-10-09');
  });

  it('北京时间 04:00:00 进入新学习日', () => {
    expect(getLearningDay(new Date('2026-10-09T20:00:00Z'))).toBe('2026-10-10');
  });

  it('同一时刻用不同时区写法结果一致', () => {
    expect(getLearningDay(new Date('2026-10-10T03:59:59+08:00'))).toBe(
      getLearningDay(new Date('2026-10-09T19:59:59Z')),
    );
  });

  it('北京时间中午属于当天学习日', () => {
    expect(getLearningDay(new Date('2026-10-10T04:00:00Z'))).toBe('2026-10-10');
  });

  it('跨年边界不会算错月份', () => {
    // 北京时间 2027-01-01 03:00 仍属于 2026-12-31 学习日
    expect(getLearningDay(new Date('2026-12-31T19:00:00Z'))).toBe('2026-12-31');
  });
});

describe('LEARNING_DAY_SQL', () => {
  it('SQL 表达式与函数用同一个起点小时', () => {
    expect(LEARNING_DAY_SQL).toContain("INTERVAL '4 hours'");
    expect(LEARNING_DAY_SQL).toContain("AT TIME ZONE 'Asia/Shanghai'");
  });
});
