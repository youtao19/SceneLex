import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDatabaseConfigured, SYSTEM_WORD_BOOK_SEEDS } from './database';

/**
 * 缺 DATABASE_URL 时曾经只是打一句 warning 就继续启动，
 * 结果 /health 返回 200、部署脚本以为成功，而每个真实请求都在报数据库错误。
 * 这条测试把「宁可起不来」钉住。
 */
describe('assertDatabaseConfigured', () => {
  it('没有连接串时抛错', () => {
    expect(() => assertDatabaseConfigured('')).toThrow(/DATABASE_URL/);
  });

  it('错误信息要说清本地和生产分别该改哪个文件', () => {
    expect(() => assertDatabaseConfigured('')).toThrow(/\.env\.dev\.local/);
    expect(() => assertDatabaseConfigured('')).toThrow(/ecosystem\.config\.cjs/);
  });

  it('配了就放行，且不解析连接串内容', () => {
    expect(() => assertDatabaseConfigured('postgresql://u:p@127.0.0.1:5432/db')).not.toThrow();
  });
});

/**
 * 种子词必须出现在自己的词表里，否则全量导入之后它会变成书里的孤儿：
 * 每次启动都被播种补回书首、order_index 与别的词撞车、difficulty 是 'core'。
 * 线上曾有 9 个这样的词（cet6:approximate、tem4:morphology、tem8:aesthetic 等），
 * 光把它们从数据库删掉没用 —— 下次启动就回来了，必须改种子表本身。
 */
describe('SYSTEM_WORD_BOOK_SEEDS', () => {
  it('凡是带全量词表的书，种子词都能在词表里找到', () => {
    const orphans: string[] = [];
    let checkedBooks = 0;

    for (const book of SYSTEM_WORD_BOOK_SEEDS) {
      const wordListPath = path.join(__dirname, '../../data', `${book.code}-word-list.json`);

      // 没有词表的书（cet4、postgraduate）种子词就是全部内容，无从比对。
      if (!existsSync(wordListPath)) {
        continue;
      }

      checkedBooks += 1;
      const parsed = JSON.parse(readFileSync(wordListPath, 'utf8')) as {
        wordList?: Array<{ value?: string }>;
      };
      const available = new Set(
        (parsed.wordList ?? []).map((item) => String(item.value ?? '').trim().toLowerCase()),
      );

      for (const item of book.words) {
        const word = typeof item === 'string' ? item : item.word;

        if (!available.has(word)) {
          orphans.push(`${book.code}:${word}`);
        }
      }
    }

    // 防止哪天词表文件被改名，测试悄悄变成空转。
    expect(checkedBooks).toBeGreaterThanOrEqual(3);
    expect(orphans).toEqual([]);
  });
});
