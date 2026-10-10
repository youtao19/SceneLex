import { describe, expect, it } from 'vitest';
import { buildContactMailto } from './contact';

describe('buildContactMailto', () => {
  it('拼出带主题和正文的 mailto', () => {
    const mailto = buildContactMailto('admin@example.com');

    expect(mailto).toContain('mailto:admin@example.com?');
    expect(mailto).toContain('subject=');
    expect(mailto).toContain('body=');
  });

  it('中文主题按 URL 编码，不留下裸中文', () => {
    const mailto = buildContactMailto('admin@example.com');

    expect(mailto).not.toMatch(/[一-龥]/);
    expect(decodeURIComponent(mailto)).toContain('申请开通 SceneLex 访问密钥');
  });

  it('前后空格不影响结果', () => {
    expect(buildContactMailto('  admin@example.com  ')).toBe(
      buildContactMailto('admin@example.com'),
    );
  });

  /**
   * 空值时返回空串由调用方决定隐藏入口：一个收不到信的 mailto:
   * 会让人以为申请已经发出去了。
   */
  it('没配置时返回空串，而不是半截 mailto', () => {
    expect(buildContactMailto('')).toBe('');
    expect(buildContactMailto('   ')).toBe('');
  });
});
