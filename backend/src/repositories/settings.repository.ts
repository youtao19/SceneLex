import { query } from '../config/database'
import { env } from '../config/env'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { LearningSettings, UserApiKeyProvider } from '../types/settings'

interface LearningSettingsRow {
  daily_review_limit_enabled: boolean
  daily_review_limit: string
}

interface UserApiKeyRow {
  provider: UserApiKeyProvider
  api_key_ciphertext: string
}

const defaultLearningSettings: LearningSettings = {
  dailyReviewLimitEnabled: false,
  dailyReviewLimit: 20
}

function mapLearningSettings(row: LearningSettingsRow): LearningSettings {
  return {
    dailyReviewLimitEnabled: row.daily_review_limit_enabled,
    dailyReviewLimit: Number(row.daily_review_limit)
  }
}

/**
 * 生产环境应显式配置密钥；本地兜底只为避免开发库无法读写旧设置。
 */
function getEncryptionSecret() {
  return env.userApiKeySecret || env.databaseUrl || 'scenelex-local-dev-key'
}

/**
 * AES 需要固定长度 key，用 hash 把环境密钥收敛成 32 字节。
 */
function getEncryptionKey() {
  return createHash('sha256').update(getEncryptionSecret()).digest()
}

/**
 * 用户密钥要能再次调用模型，所以不能只 hash；这里至少避免数据库里直接存明文。
 */
function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, ciphertext].map((item) => item.toString('base64url')).join('.')
}

/**
 * 解密失败直接抛错，让调用处暴露配置问题，而不是静默改用错误密钥。
 */
function decryptApiKey(value: string) {
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

/**
 * 首次进入设置页时自动补一行，后续复习队列就能稳定读取用户偏好。
 */
export async function getLearningSettings(userId: number): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING daily_review_limit_enabled, daily_review_limit
    `,
    [userId],
  )

  if (result.rowCount === 0) {
    return defaultLearningSettings
  }

  return mapLearningSettings(result.rows[0])
}

/**
 * 只保存用户可调的学习节奏字段，避免设置页影响 SRS 算法本身。
 */
export async function saveLearningSettings(
  userId: number,
  dailyReviewLimitEnabled: boolean,
  dailyReviewLimit: number,
): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (
        user_id,
        daily_review_limit_enabled,
        daily_review_limit,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        daily_review_limit_enabled = EXCLUDED.daily_review_limit_enabled,
        daily_review_limit = EXCLUDED.daily_review_limit,
        updated_at = NOW()
      RETURNING daily_review_limit_enabled, daily_review_limit
    `,
    [userId, dailyReviewLimitEnabled, dailyReviewLimit],
  )

  return mapLearningSettings(result.rows[0])
}

/**
 * 设置页只需要知道哪些 provider 已保存过密钥。
 */
export async function listUserApiKeyRows(userId: number): Promise<UserApiKeyRow[]> {
  const result = await query<UserApiKeyRow>(
    `
      SELECT provider, api_key_ciphertext
      FROM user_ai_api_keys
      WHERE user_id = $1
    `,
    [userId],
  )

  return result.rows
}

/**
 * 每次保存都重新加密，避免数据库里出现可直接复制使用的密钥。
 */
export async function saveUserApiKey(
  userId: number,
  provider: UserApiKeyProvider,
  apiKey: string,
) {
  await query(
    `
      INSERT INTO user_ai_api_keys (user_id, provider, api_key_ciphertext, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, provider)
      DO UPDATE SET
        api_key_ciphertext = EXCLUDED.api_key_ciphertext,
        updated_at = NOW()
    `,
    [userId, provider, encryptApiKey(apiKey)],
  )
}

/**
 * 用户可以撤销自己的密钥，避免继续用旧账号额度。
 */
export async function deleteUserApiKey(userId: number, provider: UserApiKeyProvider) {
  await query(
    `
      DELETE FROM user_ai_api_keys
      WHERE user_id = $1 AND provider = $2
    `,
    [userId, provider],
  )
}

/**
 * 模型调用前才解密，减少明文在业务层停留的范围。
 */
export async function readUserApiKeys(userId: number) {
  const rows = await listUserApiKeyRows(userId)
  const keys: Partial<Record<UserApiKeyProvider, string>> = {}

  for (const row of rows) {
    keys[row.provider] = decryptApiKey(row.api_key_ciphertext)
  }

  return keys
}
