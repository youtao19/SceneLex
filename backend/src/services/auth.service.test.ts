import { describe, expect, it } from 'vitest';
import { assertNewPasswordIsUsable } from './auth.service';
import { HttpError } from '../utils/http-error';

/**
 * 新密码的规则是纯判断，不需要连库。把边界钉住，免得哪天"顺手放宽一点"。
 */
describe('assertNewPasswordIsUsable', () => {
  it('合规的新密码直接通过', () => {
    expect(() => assertNewPasswordIsUsable('old-password', 'new-password')).not.toThrow();
  });

  it('沿用注册时的最短长度：8 位通过，7 位拒绝', () => {
    expect(() => assertNewPasswordIsUsable('old-password', '12345678')).not.toThrow();
    expect(() => assertNewPasswordIsUsable('old-password', '1234567')).toThrow(HttpError);
  });

  it('新旧密码相同时拒绝', () => {
    expect(() => assertNewPasswordIsUsable('same-pass', 'same-pass')).toThrow(
      '新密码不能与当前密码相同',
    );
  });

  it('空的新密码拒绝', () => {
    expect(() => assertNewPasswordIsUsable('old-password', '')).toThrow(HttpError);
  });

  /**
   * 改密码失败必须是 4xx。如果哪天误写成 500，前端会把"你密码打错了"
   * 显示成"服务器出错，请稍后重试"，用户就会一直重试同一个错密码。
   */
  it('规则不满足时抛的是 400，不是 500', () => {
    try {
      assertNewPasswordIsUsable('old-password', 'short');
      throw new Error('本该抛出');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});
