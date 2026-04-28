import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

/**
 * 每个密码独立加盐，避免数据库泄露后被同值比对直接撞出弱密码。
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

/**
 * 登录校验必须走恒时比较，否则错误密码和正确密码的耗时差会泄露信息。
 */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedBuffer);
}
