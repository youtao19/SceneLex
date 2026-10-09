import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabasePool, query } from '../config/database';
import { settingsService } from './settings.service';
import { wordService } from './word.service';
import { getLearningDay } from '../utils/learning-day';
import type { WordMeaningItem } from '../types/word';

/**
 * 事务、行锁、幂等回执和撤销冲突只有真跑数据库才验证得到，纯规则单测覆盖不了。
 *
 * 默认跳过：`npm test` 不允许依赖数据库。要跑就用隔离测试库显式打开：
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scenlex_test \
 *     npx vitest run src/services/word-study.db.test.ts
 * 绝不要把它指向生产库：用例会写入并删除测试用户。
 */
const runDbTests = process.env.RUN_DB_TESTS === '1';

const meanings: WordMeaningItem[] = [
  {
    partOfSpeech: 'adj',
    meaning: '好奇的',
    sceneTitle: '好奇的场景',
    examples: ['a curious mind'],
    explanation: '对事情感兴趣',
    imageQueries: [],
    example: 'a curious mind',
    tip: '常用搭配 be curious about',
  },
];

describe.skipIf(!runDbTests)('学习事务（隔离测试库）', () => {
  const suffix = Date.now();
  let userId = 0;
  let bookId = 0;

  beforeAll(async () => {
    const user = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, '学习测试', 'salt', 'hash')
        RETURNING id
      `,
      [`study-${suffix}@example.test`],
    );
    userId = Number(user.rows[0].id);

    const book = await query<{ id: string }>(
      `
        INSERT INTO system_word_books (code, name)
        VALUES ($1, '学习测试词书')
        RETURNING id
      `,
      [`study-test-${suffix}`],
    );
    bookId = Number(book.rows[0].id);

    await query(
      `
        INSERT INTO system_word_book_items (book_id, word, order_index)
        VALUES ($1, 'alpha', 1), ($1, 'beta', 2), ($1, 'gamma', 3)
      `,
      [bookId],
    );

    await settingsService.updateLearningSettings(userId, {
      dailyNewWordTarget: 20,
      currentSystemBookId: bookId,
    });
  });

  afterAll(async () => {
    if (userId) {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }

    if (bookId) {
      await query('DELETE FROM system_word_books WHERE id = $1', [bookId]);
    }

    await getDatabasePool().end();
  });

  it('设置只提交部分字段时不会清掉其他设置', async () => {
    const settings = await settingsService.updateLearningSettings(userId, {
      dailyReviewLimit: 5,
    });

    expect(settings.dailyReviewLimit).toBe(5);
    expect(settings.dailyNewWordTarget).toBe(20);
    expect(settings.currentSystemBookId).toBe(bookId);
  });

  it('新词目标超出 0~200 直接拒绝', async () => {
    await expect(
      settingsService.updateLearningSettings(userId, { dailyNewWordTarget: 201 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('不存在的词书不能设为当前词书', async () => {
    await expect(
      settingsService.updateLearningSettings(userId, { currentSystemBookId: 99999999 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('顺序新词队列按词书顺序给出未学词', async () => {
    const queue = await wordService.listNewWords(userId, undefined);

    expect(queue.bookId).toBe(bookId);
    expect(queue.learningDay).toBe(getLearningDay(new Date()));
    expect(queue.words.map((word) => word.word)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('完成新词：保存词卡、首次评分和当日计数在同一事务完成', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'alpha',
      phonetic: '/ˈælfə/',
      meanings,
      rating: 'good',
      operationId: `complete-alpha-${suffix}`,
    });

    expect(card.firstLearnedAt).not.toBeNull();
    expect(card.reviewCount).toBe(1);
    expect(card.studyVersion).toBe(1);
    // 现有公式下首次 good 的间隔是 2 天（growAnkiInterval 至少 +1），不在这里改算法。
    expect(card.nextReview).toBe(addDays(getLearningDay(new Date()), 2));

    const overview = await wordService.getStudyOverview(userId);
    expect(overview.newWordCompleted).toBe(1);
    expect(overview.dueTotal).toBe(0);
  });

  it('重复完成同一个词不再计数，也不再评分', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'alpha',
      phonetic: '/ˈælfə/',
      meanings,
      rating: 'good',
    });

    expect(card.reviewCount).toBe(1);

    const overview = await wordService.getStudyOverview(userId);
    expect(overview.newWordCompleted).toBe(1);
  });

  it('新词队列跳过已学词（跨书去重的依据就是个人 words）', async () => {
    const queue = await wordService.listNewWords(userId, undefined);

    expect(queue.words.map((word) => word.word)).toEqual(['beta', 'gamma']);
  });

  it('同一个操作 ID 重试返回原结果，不重复推进排期', async () => {
    const operationId = `review-beta-${suffix}`;
    const first = await wordService.completeNewWord(userId, {
      word: 'beta',
      meanings,
      rating: 'good',
      operationId,
    });
    const replay = await wordService.completeNewWord(userId, {
      word: 'beta',
      meanings,
      rating: 'good',
      operationId,
    });

    expect(replay.id).toBe(first.id);
    expect(replay.reviewCount).toBe(first.reviewCount);
    expect(replay.studyVersion).toBe(first.studyVersion);
  });

  it('同一个操作 ID 提交不同内容直接拒绝', async () => {
    const operationId = `review-beta-again-${suffix}`;
    await wordService.completeNewWord(userId, {
      word: 'gamma',
      meanings,
      rating: 'good',
      operationId,
    });

    await expect(
      wordService.completeNewWord(userId, {
        word: 'gamma',
        meanings,
        rating: 'again',
        operationId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('评分带过期版本时返回冲突，不覆盖另一端的新进度', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'delta',
      meanings,
      rating: 'good',
    });

    await expect(
      wordService.reviewWord(userId, {
        wordId: card.id,
        rating: 'good',
        expectedVersion: card.studyVersion - 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('撤销上一词评分恢复排期，并拒绝过期快照', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'epsilon',
      meanings,
      rating: 'good',
    });
    const rated = await wordService.reviewWord(userId, {
      wordId: card.id,
      rating: 'easy',
      operationId: `review-epsilon-${suffix}`,
      expectedVersion: card.studyVersion,
    });

    expect(rated.reviewCount).toBe(2);

    const restored = await wordService.rollbackReviewWord(userId, {
      wordId: card.id,
      targetOperationId: `review-epsilon-${suffix}`,
      operationId: `rollback-epsilon-${suffix}`,
    });

    expect(restored.reviewCount).toBe(1);
    expect(restored.interval).toBe(card.interval);
    expect(restored.nextReview).toBe(card.nextReview);
  });

  it('另一端改过之后不能再撤销旧操作', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'zeta',
      meanings,
      rating: 'good',
    });
    await wordService.reviewWord(userId, {
      wordId: card.id,
      rating: 'good',
      operationId: `review-zeta-a-${suffix}`,
    });
    // 模拟另一端又评了一次：这条记录的最新操作已经不是 a 了。
    await wordService.reviewWord(userId, {
      wordId: card.id,
      rating: 'good',
      operationId: `review-zeta-b-${suffix}`,
    });

    await expect(
      wordService.rollbackReviewWord(userId, {
        wordId: card.id,
        targetOperationId: `review-zeta-a-${suffix}`,
        operationId: `rollback-zeta-${suffix}`,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('撤销首次完成会收回当日计数，但不删词卡', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'eta',
      meanings,
      rating: 'good',
      operationId: `complete-eta-${suffix}`,
    });
    const before = await wordService.getStudyOverview(userId);

    const restored = await wordService.rollbackReviewWord(userId, {
      wordId: card.id,
      targetOperationId: `complete-eta-${suffix}`,
      operationId: `rollback-eta-${suffix}`,
    });
    const after = await wordService.getStudyOverview(userId);

    expect(restored.firstLearnedAt).toBeNull();
    expect(restored.reviewCount).toBe(0);
    expect(after.newWordCompleted).toBe(before.newWordCompleted - 1);
    // 词卡还在，收藏（单词本归属）不会被撤销连带删掉。
    const stillThere = await query('SELECT id FROM words WHERE id = $1', [card.id]);
    expect(stillThere.rowCount).toBe(1);
  });

  it('旧网页不带操作引用的撤销请求被拒绝，不能用快照覆盖新进度', async () => {
    const card = await wordService.completeNewWord(userId, {
      word: 'theta',
      meanings,
      rating: 'good',
    });

    await expect(
      wordService.rollbackReviewWord(userId, {
        wordId: card.id,
        // 旧客户端只带快照字段，这些字段现在一律不看。
        ...({ ease: 2.5, interval: 1, nextReview: '2026-01-01', reviewCount: 0 } as object),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('昨天完成的新词不算今天的完成数', async () => {
    const before = await wordService.getStudyOverview(userId);
    const card = await wordService.completeNewWord(userId, {
      word: 'iota',
      meanings,
      rating: 'good',
    });

    expect((await wordService.getStudyOverview(userId)).newWordCompleted).toBe(
      before.newWordCompleted + 1,
    );

    // 把首次完成时间挪到前一个学习日：当日计数必须跟着变。
    await query(`UPDATE words SET first_learned_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [
      card.id,
    ]);

    expect((await wordService.getStudyOverview(userId)).newWordCompleted).toBe(
      before.newWordCompleted,
    );
  });
});

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
