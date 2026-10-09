import { describe, expect, it } from 'vitest';
import { getNextAnkiSchedule } from './word.service';
import type { ReviewRating, StoredWord } from '../types/word';

/** 只关心排期字段，其余内容对算法没有影响。 */
function buildWord(overrides: Partial<StoredWord> = {}): StoredWord {
  return {
    id: 1,
    word: 'curious',
    phonetic: '',
    primaryMeaning: 'adj. 好奇的',
    meanings: [],
    ease: 2.5,
    interval: 1,
    nextReview: '2026-01-01',
    reviewCount: 0,
    studyVersion: 0,
    firstLearnedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getNextAnkiSchedule', () => {
  it('again 把间隔打回 1 天并下调 ease', () => {
    const result = getNextAnkiSchedule(buildWord({ interval: 30, ease: 2.5 }), 'again');

    expect(result).toEqual({ interval: 1, ease: 2.3 });
  });

  it('ease 有 1.3 下限，连续 again 不会掉穿', () => {
    let word = buildWord({ interval: 10, ease: 1.4 });

    for (let i = 0; i < 5; i += 1) {
      const result = getNextAnkiSchedule(word, 'again');
      word = { ...word, ease: result.ease, interval: result.interval };
    }

    expect(word.ease).toBe(1.3);
  });

  it('首次复习 good 只推进 1 天，不按 ease 直接跳到 2.5 天', () => {
    const result = getNextAnkiSchedule(buildWord({ reviewCount: 0, interval: 1 }), 'good');

    // reviewCount 为 0 时 goodInterval 固定为 1，再被 growAnkiInterval 的 +1 兜底抬到 2
    expect(result.interval).toBe(2);
  });

  it('已复习过的卡片 good 按 ease 放大间隔', () => {
    const result = getNextAnkiSchedule(
      buildWord({ reviewCount: 3, interval: 10, ease: 2.5 }),
      'good',
    );

    expect(result).toEqual({ interval: 25, ease: 2.5 });
  });

  it('hard 至少把间隔推进 1 天，避免卡在同一个数字上', () => {
    const result = getNextAnkiSchedule(buildWord({ interval: 2, ease: 2.5 }), 'hard');

    // 2 * 1.2 = 2.4，四舍五入回 2，必须靠 +1 兜底才有进展
    expect(result.interval).toBe(3);
    expect(result.ease).toBe(2.35);
  });

  it('同一张卡 easy 的间隔总是大于 good', () => {
    const word = buildWord({ reviewCount: 5, interval: 20, ease: 2.5 });

    const good = getNextAnkiSchedule(word, 'good');
    const easy = getNextAnkiSchedule(word, 'easy');

    expect(easy.interval).toBeGreaterThan(good.interval);
  });

  it('间隔封顶 36500 天，防止数值膨胀到不可用', () => {
    const result = getNextAnkiSchedule(
      buildWord({ reviewCount: 50, interval: 36_000, ease: 2.5 }),
      'easy',
    );

    expect(result.interval).toBe(36_500);
  });

  it('ease 非法（<= 0）时退回默认 2.5，而不是算出负数间隔', () => {
    const result = getNextAnkiSchedule(
      buildWord({ reviewCount: 2, interval: 10, ease: 0 }),
      'good',
    );

    expect(result).toEqual({ interval: 25, ease: 2.5 });
  });

  it('interval 为 0 或负数时按 1 处理', () => {
    const ratings: ReviewRating[] = ['hard', 'good', 'easy'];

    for (const rating of ratings) {
      const result = getNextAnkiSchedule(buildWord({ interval: 0, ease: 2.5 }), rating);

      expect(result.interval).toBeGreaterThanOrEqual(1);
    }
  });
});
