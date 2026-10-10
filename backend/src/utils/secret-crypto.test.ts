import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, resolveEncryptionSecret } from './secret-crypto';

/**
 * 这条规则值得钉死：生产环境缺 USER_API_KEY_SECRET 时不许有兜底。
 * 一旦允许兜底，用户模型 Key 就是用一个公开常量加密的，而且从外部毫无迹象。
 */
describe('resolveEncryptionSecret', () => {
  it('配了就用自己的密钥', () => {
    expect(
      resolveEncryptionSecret({
        nodeEnv: 'production',
        userApiKeySecret: 'a-real-secret',
        databaseUrl: 'postgresql://u:p@h/db',
      }),
    ).toBe('a-real-secret');
  });

  it('生产环境缺密钥直接抛错，不退化成兜底值', () => {
    expect(() =>
      resolveEncryptionSecret({
        nodeEnv: 'production',
        userApiKeySecret: '',
        databaseUrl: 'postgresql://u:p@h/db',
      }),
    ).toThrow(/USER_API_KEY_SECRET/);
  });

  it('开发环境允许兜底，避免本地库读写旧设置时报错', () => {
    expect(
      resolveEncryptionSecret({
        nodeEnv: 'development',
        userApiKeySecret: '',
        databaseUrl: 'postgresql://u:p@h/db',
      }),
    ).toBe('postgresql://u:p@h/db');
  });

  it('开发环境连数据库都没配时仍有兜底', () => {
    expect(
      resolveEncryptionSecret({
        nodeEnv: 'development',
        userApiKeySecret: '',
        databaseUrl: '',
      }),
    ).toBe('scenelex-local-dev-key');
  });
});

describe('加解密', () => {
  it('密文能还原成原文', () => {
    const plain = 'sk-some-model-api-key';
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('同一明文两次加密结果不同（每次都用新 IV）', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('格式不对时返回空串，而不是抛错', () => {
    expect(decryptSecret('not-a-valid-payload')).toBe('');
  });
});
