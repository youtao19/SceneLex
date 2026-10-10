import { describe, expect, it } from 'vitest';
import { assertDatabaseConfigured } from './database';

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
