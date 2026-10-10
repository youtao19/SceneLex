import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabasePool, query } from '../config/database';
import { getHistoryArchive } from './history.repository';
import { getLearningDay } from '../utils/learning-day';

/**
 * 汇总口径现在由窗口聚合在 SQL 里算出来，纯规则单测覆盖不到，只有真跑数据库才验证得到。
 * 零词用户尤其要跑：那种情况查询一行都不返回，汇总只能走空分支。
 *
 * 默认跳过：`npm test` 不允许依赖数据库。要跑就用隔离测试库显式打开：
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scenlex_test \
 *     npx vitest run src/repositories/history.repository.db.test.ts
 * 绝不要把它指向生产库：用例会写入并删除测试用户。
 */
const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDbTests)('归档查询（隔离测试库）', () => {
  const suffix = Date.now();
  const learningDay = getLearningDay(new Date());
  const meanings = JSON.stringify([
    { partOfSpeech: 'n.', meaning: '测试释义', sceneTitle: '', examples: [], explanation: '', imageQueries: [] },
  ]);
  let emptyUserId = 0;
  let userId = 0;

  beforeAll(async () => {
    /**
     * 先备一个全新用户，覆盖"一个词都没存过"时的汇总分支。
     */
    const emptyUser = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, '空词库', 'salt', 'hash')
        RETURNING id
      `,
      [`history-empty-${suffix}@example.test`],
    );
    emptyUserId = Number(emptyUser.rows[0].id);

    const user = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, '归档测试', 'salt', 'hash')
        RETURNING id
      `,
      [`history-${suffix}@example.test`],
    );
    userId = Number(user.rows[0].id);

    /**
     * created_at 依次拉开，用来验证列表按 created_at DESC 排列；
     * next_review 分成已过期、今天到期、未来三档，用来验证"到期"和"复习过"是两个口径。
     */
    await query(
      `
        INSERT INTO words (
          user_id, word, primary_meaning, meanings, next_review, review_count, created_at
        )
        VALUES
          ($1, 'alpha', '第一个', $3::jsonb, $2::date - 2,  3, NOW() - INTERVAL '3 days'),
          ($1, 'beta',  '第二个', $3::jsonb, $2::date + 30, 0, NOW() - INTERVAL '2 days'),
          ($1, 'gamma', '第三个', $3::jsonb, $2::date,      7, NOW() - INTERVAL '1 day')
      `,
      [userId, learningDay, meanings],
    );
  });

  afterAll(async () => {
    for (const id of [userId, emptyUserId]) {
      if (id) {
        await query('DELETE FROM users WHERE id = $1', [id]);
      }
    }

    await getDatabasePool().end();
  });

  it('一个词都没有时汇总全零，三个列表都是空数组', async () => {
    const archive = await getHistoryArchive(emptyUserId);

    expect(archive.summary).toEqual({ totalWords: 0, dueToday: 0, reviewedWords: 0 });
    expect(archive.words).toEqual([]);
    expect(archive.dueWords).toEqual([]);
    expect(archive.recentWords).toEqual([]);
  });

  it('汇总和列表来自同一次扫描，计数与逐行数据一致', async () => {
    const archive = await getHistoryArchive(userId);

    expect(archive.summary).toEqual({ totalWords: 3, dueToday: 2, reviewedWords: 2 });
    expect(archive.words.map((word) => word.word)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('到期词按 next_review 升序，未来词不进队列', async () => {
    const archive = await getHistoryArchive(userId);

    expect(archive.dueWords.map((word) => word.word)).toEqual(['alpha', 'gamma']);
  });

  it('最近词取创建时间倒序的头部', async () => {
    const archive = await getHistoryArchive(userId);

    expect(archive.recentWords.map((word) => word.word)).toEqual(['gamma', 'beta', 'alpha']);
  });
});
