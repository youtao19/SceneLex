import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabasePool, query, withTransaction } from '../config/database';
import { ensureDefaultWordBook } from './word-book.repository';

/**
 * 默认本的"建或复用"合并成了一条 CTE 语句，孤儿词补链也改成了先探测再写，
 * 这些都要真跑数据库才验证得到并发下的唯一性和补链的边界。
 *
 * 默认跳过：`npm test` 不允许依赖数据库。要跑就用隔离测试库显式打开：
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scenlex_test \
 *     npx vitest run src/repositories/word-book.repository.db.test.ts
 * 绝不要把它指向生产库：用例会写入并删除测试用户。
 */
const runDbTests = process.env.RUN_DB_TESTS === '1';

const meanings = JSON.stringify([
  { partOfSpeech: 'n.', meaning: '测试释义', sceneTitle: '', examples: [], explanation: '', imageQueries: [] },
]);

describe.skipIf(!runDbTests)('默认单词本（隔离测试库）', () => {
  const suffix = Date.now();
  let freshUserId = 0;
  let orphanUserId = 0;
  let linkedUserId = 0;

  async function createUser(label: string) {
    const result = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, $2, 'salt', 'hash')
        RETURNING id
      `,
      [`word-book-${label}-${suffix}@example.test`, label],
    );

    return Number(result.rows[0].id);
  }

  async function createWord(userId: number, word: string) {
    const result = await query<{ id: string }>(
      `
        INSERT INTO words (user_id, word, primary_meaning, meanings)
        VALUES ($1, $2, '测试', $3::jsonb)
        RETURNING id
      `,
      [userId, word, meanings],
    );

    return Number(result.rows[0].id);
  }

  beforeAll(async () => {
    freshUserId = await createUser('全新用户');
    orphanUserId = await createUser('孤儿词用户');
    linkedUserId = await createUser('已入本用户');

    // 先落词再建本，模拟建本功能上线前就已经存在的孤儿数据。
    await createWord(orphanUserId, 'orphan-a');
    await createWord(orphanUserId, 'orphan-b');
  });

  afterAll(async () => {
    for (const id of [freshUserId, orphanUserId, linkedUserId]) {
      if (id) {
        await query('DELETE FROM users WHERE id = $1', [id]);
      }
    }

    await getDatabasePool().end();
  });

  it('全新用户会拿到新建的默认本', async () => {
    const bookId = await withTransaction((client) =>
      ensureDefaultWordBook(client, freshUserId),
    );

    expect(bookId).toBeGreaterThan(0);
  });

  it('重复调用复用同一个默认本，不会建出第二个', async () => {
    const first = await withTransaction((client) =>
      ensureDefaultWordBook(client, freshUserId),
    );
    const second = await withTransaction((client) =>
      ensureDefaultWordBook(client, freshUserId),
    );

    expect(second).toBe(first);

    const count = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM word_books WHERE user_id = $1 AND is_default = TRUE`,
      [freshUserId],
    );

    expect(count.rows[0].total).toBe('1');
  });

  it('孤儿词仍然会被补进默认本', async () => {
    const bookId = await withTransaction((client) =>
      ensureDefaultWordBook(client, orphanUserId),
    );

    const linked = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM word_book_items item
        JOIN words w ON w.id = item.word_id
        WHERE item.book_id = $1
          AND w.user_id = $2
      `,
      [bookId, orphanUserId],
    );

    expect(linked.rows[0].total).toBe('2');
  });

  it('已经属于其他本的词不会被再链到默认本', async () => {
    const defaultBookId = await withTransaction((client) =>
      ensureDefaultWordBook(client, linkedUserId),
    );

    const customBook = await query<{ id: string }>(
      `
        INSERT INTO word_books (user_id, name, is_default)
        VALUES ($1, '自建词本', FALSE)
        RETURNING id
      `,
      [linkedUserId],
    );
    const customBookId = Number(customBook.rows[0].id);

    const linkedWordId = await createWord(linkedUserId, 'already-linked');
    await query(
      `INSERT INTO word_book_items (book_id, word_id) VALUES ($1, $2)`,
      [customBookId, linkedWordId],
    );

    // 再丢一个孤儿进来，确认这一轮补链只补孤儿，不碰已经有归属的词。
    const orphanWordId = await createWord(linkedUserId, 'new-orphan');

    await withTransaction((client) => ensureDefaultWordBook(client, linkedUserId));

    const inCustom = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM word_book_items WHERE book_id = $1 AND word_id = $2`,
      [customBookId, linkedWordId],
    );
    const inDefault = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM word_book_items WHERE book_id = $1 AND word_id = $2`,
      [defaultBookId, linkedWordId],
    );
    const orphanInDefault = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM word_book_items WHERE book_id = $1 AND word_id = $2`,
      [defaultBookId, orphanWordId],
    );

    expect(inCustom.rows[0].total).toBe('1');
    expect(inDefault.rows[0].total).toBe('0');
    expect(orphanInDefault.rows[0].total).toBe('1');
  });
});
