import { query, withTransaction } from '../config/database'
import { decryptSecret, encryptSecret } from '../utils/secret-crypto'
import type { AiEndpoint } from '../types/endpoint'

interface EndpointRow {
  id: string
  label: string
  base_url: string
  api_key_ciphertext: string
  model: string
  vision_model: string
  is_default: boolean
}

export interface EndpointWriteInput {
  label: string
  baseUrl: string
  model: string
  visionModel: string
  /** 留空表示保持原密钥不变（编辑场景）。 */
  apiKey: string
  isDefault: boolean
}

const endpointColumns = `
  id, label, base_url, api_key_ciphertext, model, vision_model, is_default
`

/** 模型调用前才解密，减少明文在业务层停留的范围。 */
export function mapEndpointRow(row: EndpointRow): AiEndpoint {
  return {
    id: Number(row.id),
    label: row.label,
    baseUrl: row.base_url,
    apiKey: decryptSecret(row.api_key_ciphertext),
    model: row.model,
    visionModel: row.vision_model,
    trusted: false,
  }
}

export async function listEndpointRows(userId: number): Promise<EndpointRow[]> {
  const result = await query<EndpointRow>(
    `
      SELECT ${endpointColumns}
      FROM user_ai_endpoints
      WHERE user_id = $1
      ORDER BY is_default DESC, id ASC
    `,
    [userId],
  )

  return result.rows
}

export async function findEndpointRow(userId: number, id: number): Promise<EndpointRow | null> {
  const result = await query<EndpointRow>(
    `
      SELECT ${endpointColumns}
      FROM user_ai_endpoints
      WHERE user_id = $1 AND id = $2
    `,
    [userId, id],
  )

  return result.rows[0] ?? null
}

/**
 * 默认端点是所有生成请求的入口，取不到就说明用户还没配过。
 */
export async function findDefaultEndpointRow(userId: number): Promise<EndpointRow | null> {
  const result = await query<EndpointRow>(
    `
      SELECT ${endpointColumns}
      FROM user_ai_endpoints
      WHERE user_id = $1 AND is_default = TRUE
    `,
    [userId],
  )

  return result.rows[0] ?? null
}

/**
 * 清默认 + 设默认必须在一个事务里：部分唯一索引不允许同一用户出现两行 is_default。
 */
async function applyDefaultFlag(userId: number, id: number) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE user_ai_endpoints SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE`,
      [userId],
    )
    await client.query(
      `UPDATE user_ai_endpoints SET is_default = TRUE, updated_at = NOW() WHERE user_id = $1 AND id = $2`,
      [userId, id],
    )
  })
}

export async function insertEndpointRow(
  userId: number,
  input: EndpointWriteInput,
): Promise<EndpointRow> {
  const result = await query<EndpointRow>(
    `
      INSERT INTO user_ai_endpoints (
        user_id,
        label,
        base_url,
        api_key_ciphertext,
        model,
        vision_model,
        is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      RETURNING ${endpointColumns}
    `,
    [
      userId,
      input.label,
      input.baseUrl,
      encryptSecret(input.apiKey),
      input.model,
      input.visionModel,
    ],
  )

  if (input.isDefault) {
    await applyDefaultFlag(userId, Number(result.rows[0].id))
    return (await findEndpointRow(userId, Number(result.rows[0].id))) as EndpointRow
  }

  return result.rows[0]
}

export async function updateEndpointRow(
  userId: number,
  id: number,
  input: EndpointWriteInput,
): Promise<EndpointRow | null> {
  const result = await query<EndpointRow>(
    `
      UPDATE user_ai_endpoints
      SET
        label = $3,
        base_url = $4,
        model = $5,
        vision_model = $6,
        api_key_ciphertext = CASE WHEN $7 = '' THEN api_key_ciphertext ELSE $7 END,
        updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING ${endpointColumns}
    `,
    [
      userId,
      id,
      input.label,
      input.baseUrl,
      input.model,
      input.visionModel,
      input.apiKey ? encryptSecret(input.apiKey) : '',
    ],
  )

  if (!result.rows[0]) {
    return null
  }

  if (input.isDefault) {
    await applyDefaultFlag(userId, id)
    return findEndpointRow(userId, id)
  }

  return result.rows[0]
}

/**
 * 删掉默认端点后要把默认位交给剩下的第一个，否则用户会突然「没有默认端点」。
 */
export async function deleteEndpointRow(userId: number, id: number): Promise<boolean> {
  return withTransaction(async (client) => {
    const deleted = await client.query<{ was_default: boolean }>(
      `
        DELETE FROM user_ai_endpoints
        WHERE user_id = $1 AND id = $2
        RETURNING is_default AS was_default
      `,
      [userId, id],
    )

    if (!deleted.rows[0]) {
      return false
    }

    if (deleted.rows[0].was_default) {
      await client.query(
        `
          UPDATE user_ai_endpoints
          SET is_default = TRUE, updated_at = NOW()
          WHERE id = (
            SELECT id FROM user_ai_endpoints
            WHERE user_id = $1
            ORDER BY id ASC
            LIMIT 1
          )
        `,
        [userId],
      )
    }

    return true
  })
}

export async function setDefaultEndpointRow(userId: number, id: number): Promise<boolean> {
  const existing = await findEndpointRow(userId, id)

  if (!existing) {
    return false
  }

  await applyDefaultFlag(userId, id)

  return true
}
