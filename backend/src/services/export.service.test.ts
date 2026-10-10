import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { UserExportRows } from '../repositories/export.repository';
import { buildExportDocument, buildExportFilename } from './export.service';

function emptyRows(): UserExportRows {
  return {
    profile: [],
    words: [],
    wordBooks: [],
    wordBookItems: [],
    readingArticles: [],
    assistantChats: [],
    assistantMessages: [],
    learningSettings: [],
    endpoints: [],
    ocrBatches: [],
    ocrPages: [],
  };
}

describe('buildExportDocument', () => {
  it('把账号那一条从数组里提出来，其余按表原样带出', () => {
    const rows = emptyRows();
    rows.profile = [{ id: '7', email: 'a@example.com' }];
    rows.words = [{ id: '1', word: 'apple' }];

    const document = buildExportDocument(rows, '2026-10-10T00:00:00.000Z');

    expect(document.account).toEqual({ id: '7', email: 'a@example.com' });
    expect(document.words).toEqual([{ id: '1', word: 'apple' }]);
  });

  it('查不到账号时给空对象，而不是崩在一次取下标上', () => {
    const document = buildExportDocument(emptyRows(), '2026-10-10T00:00:00.000Z');

    expect(document.account).toEqual({});
  });

  it('导出文件自带说明，否则用户过几个月不知道这堆字段是什么', () => {
    const document = buildExportDocument(emptyRows(), '2026-10-10T00:00:00.000Z');

    expect(document.exportVersion).toBeGreaterThan(0);
    expect(document.notice).toContain('API Key');
  });

  it('导出内容里不出现任何凭据字段名', () => {
    const serialized = JSON.stringify(
      buildExportDocument(emptyRows(), '2026-10-10T00:00:00.000Z'),
    );

    // 这条能拦住"往文档里塞了凭据"，但拦不住"查询里多查了一列"——下面单独盯着 SQL。
    for (const forbidden of ['password_hash', 'password_salt', 'token_hash', 'ciphertext']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  /**
   * 上面那条断言只能检查拼装结果，而列是查询捞出来的——查询多取一列，文档里
   * 就多一列，光看 buildExportDocument 看不出来。所以直接读源码比对，不连库。
   */
  it('导出查询不整表取列，也不把凭据当输出列', () => {
    const source = readFileSync(
      path.join(__dirname, '../repositories/export.repository.ts'),
      'utf8',
    );

    // 整表导出是这段代码最容易走偏的方向：列随 schema 漂移，将来加了凭据列会静默跟着出去。
    expect(source).not.toMatch(/SELECT\s+\*/i);

    for (const column of ['password_hash', 'password_salt', 'token_hash']) {
      expect(source).not.toContain(column);
    }

    // 密文列名必然出现——要用它算 has_api_key——但不能作为输出列被单独取走。
    expect(source).not.toMatch(/^\s*api_key_ciphertext\s*,?\s*$/m);
    expect(source).toContain('AS has_api_key');

    // 会话表根本不该出现在导出里。
    expect(source).not.toContain('user_sessions');
  });
});

describe('buildExportFilename', () => {
  it('文件名只带日期，不带邮箱或昵称', () => {
    const filename = buildExportFilename('2026-10-10T12:34:56.000Z');

    expect(filename).toBe('scenelex-export-2026-10-10.json');
    expect(filename).not.toContain('@');
  });
});
