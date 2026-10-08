import { query } from '../config/database'
import { decryptSecret, encryptSecret } from '../utils/secret-crypto'
import type { AiEndpoint } from '../types/endpoint'

interface SystemEndpointRow {
  label: string
  base_url: string
  api_key_ciphertext: string
  model: string
  vision_model: string
}

export interface SystemEndpointInput {
  label: string
  baseUrl: string
  model: string
  visionModel: string
  /** 留空表示保持原密钥不变。 */
  apiKey: string
}

function mapRow(row: SystemEndpointRow): AiEndpoint {
  return {
    // 系统端点不属于任何用户，id 固定 0 只是为了满足类型。
    id: 0,
    label: row.label,
    baseUrl: row.base_url,
    apiKey: decryptSecret(row.api_key_ciphertext),
    model: row.model,
    visionModel: row.vision_model,
    trusted: true,
  }
}

/**
 * 单行表，所以不需要按条件筛选。
 */
export async function findSystemEndpoint(): Promise<AiEndpoint | null> {
  const result = await query<SystemEndpointRow>(
    `SELECT label, base_url, api_key_ciphertext, model, vision_model FROM system_ai_endpoint WHERE id = 1`,
  )

  return result.rows[0] ? mapRow(result.rows[0]) : null
}

/**
 * 密钥留空表示保持原值：管理员改模型名时不该被迫重新粘贴一次 Key。
 */
export async function saveSystemEndpoint(input: SystemEndpointInput): Promise<AiEndpoint> {
  const result = await query<SystemEndpointRow>(
    `
      INSERT INTO system_ai_endpoint (
        id,
        label,
        base_url,
        api_key_ciphertext,
        model,
        vision_model,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        label = EXCLUDED.label,
        base_url = EXCLUDED.base_url,
        api_key_ciphertext = CASE
          WHEN $6 = '' THEN system_ai_endpoint.api_key_ciphertext
          ELSE EXCLUDED.api_key_ciphertext
        END,
        model = EXCLUDED.model,
        vision_model = EXCLUDED.vision_model,
        updated_at = NOW()
      RETURNING label, base_url, api_key_ciphertext, model, vision_model
    `,
    [
      input.label,
      input.baseUrl,
      input.apiKey ? encryptSecret(input.apiKey) : '',
      input.model,
      input.visionModel,
      input.apiKey,
    ],
  )

  return mapRow(result.rows[0])
}

export async function deleteSystemEndpoint() {
  await query(`DELETE FROM system_ai_endpoint WHERE id = 1`)
}
