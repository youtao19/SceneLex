import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env'

/**
 * 用户密钥要能再次拿去调用模型，所以不能只做 hash，必须可逆。
 * 这里用 AES-256-GCM：数据库泄露时至少拿不到可直接使用的明文。
 */

/**
 * 生产环境必须显式配置密钥；本地兜底只为避免开发库无法读写旧设置。
 *
 * 启动时 assertProductionConfig 已经拦过一次，这里再判一次是因为加密函数
 * 也可能被脚本直接引用而不经过 server.ts —— 那时候更不能悄悄用一个公开常量。
 * 写成纯函数是为了能直接测，不必真去改进程的 NODE_ENV。
 */
export function resolveEncryptionSecret(config: {
  nodeEnv: string;
  userApiKeySecret: string;
  databaseUrl: string;
}) {
  if (config.userApiKeySecret) {
    return config.userApiKeySecret
  }

  if (config.nodeEnv === 'production') {
    throw new Error('USER_API_KEY_SECRET 未配置，无法加解密用户端点的 API Key')
  }

  return config.databaseUrl || 'scenelex-local-dev-key'
}

function getEncryptionSecret() {
  return resolveEncryptionSecret(env)
}

/**
 * AES 需要固定长度 key，用 hash 把环境密钥收敛成 32 字节。
 */
function getEncryptionKey() {
  return createHash('sha256').update(getEncryptionSecret()).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, ciphertext].map((item) => item.toString('base64url')).join('.')
}

/**
 * 解密失败直接抛错，让调用处暴露配置问题，而不是静默改用错误密钥。
 */
export function decryptSecret(value: string) {
  const [ivText, tagText, ciphertextText] = value.split('.')

  if (!ivText || !tagText || !ciphertextText) {
    return ''
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
