import { readTrustedEndpointUrls } from '../config/endpoint-presets'
import { HttpError } from '../utils/http-error'
import { assertSafeEndpointUrl, UnsafeEndpointUrlError } from '../utils/ssrf-guard'
import { chatCompletion, LlmRequestError } from './llm-client'
import {
  deleteEndpointRow,
  findDefaultEndpointRow,
  findEndpointRow,
  insertEndpointRow,
  listEndpointRows,
  mapEndpointRow,
  setDefaultEndpointRow,
  updateEndpointRow,
  type EndpointWriteInput,
} from '../repositories/endpoint.repository'
import type { AiEndpoint, AiEndpointView } from '../types/endpoint'

const LABEL_MAX = 40
const MODEL_MAX = 120
const API_KEY_MAX = 300

export interface EndpointInput {
  label?: unknown
  baseUrl?: unknown
  model?: unknown
  visionModel?: unknown
  apiKey?: unknown
  isDefault?: unknown
}

export interface EndpointTestResult {
  ok: boolean
  message: string
}

function readTrimmedString(value: unknown, field: string, max: number, required: boolean) {
  if (value === undefined || value === null) {
    if (required) {
      throw new HttpError(400, `${field}不能为空`)
    }

    return ''
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field}必须是字符串`)
  }

  const text = value.trim()

  if (required && !text) {
    throw new HttpError(400, `${field}不能为空`)
  }

  if (text.length > max) {
    throw new HttpError(400, `${field}太长，最多 ${max} 个字符`)
  }

  return text
}

/**
 * 地址是唯一会变成出站请求的字段，所以必须过 SSRF 守卫：
 * 服务器上有本机 PostgreSQL 和云厂商元数据端点，不能替用户去请求任意主机。
 */
async function normalizeBaseUrl(value: unknown) {
  const raw = readTrimmedString(value, '接口地址', 300, true)

  try {
    const url = await assertSafeEndpointUrl(raw, { trustedUrls: readTrustedEndpointUrls() })

    return url.toString().replace(/\/+$/, '')
  } catch (error) {
    if (error instanceof UnsafeEndpointUrlError) {
      throw new HttpError(400, error.message)
    }

    throw error
  }
}

function normalizeInput(input: EndpointInput, options: { requireApiKey: boolean }): EndpointWriteInput {
  return {
    label: readTrimmedString(input.label, '名称', LABEL_MAX, true),
    // baseUrl 需要异步校验，调用方先填占位，随后覆盖。
    baseUrl: '',
    model: readTrimmedString(input.model, '模型名', MODEL_MAX, true),
    visionModel: readTrimmedString(input.visionModel, '视觉模型', MODEL_MAX, false),
    apiKey: readTrimmedString(input.apiKey, 'API Key', API_KEY_MAX, options.requireApiKey),
    isDefault: input.isDefault === true,
  }
}

/** 密钥只回传掩码，明文不出后端。 */
function buildKeyPreview(apiKey: string) {
  if (!apiKey) {
    return '未设置'
  }

  if (apiKey.length <= 4) {
    return '••••'
  }

  return `••••••••${apiKey.slice(-4)}`
}

function toView(endpoint: AiEndpoint, isDefault: boolean): AiEndpointView {
  return {
    id: endpoint.id,
    label: endpoint.label,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    visionModel: endpoint.visionModel,
    keyPreview: buildKeyPreview(endpoint.apiKey),
    isDefault,
  }
}

function toViews(rows: Awaited<ReturnType<typeof listEndpointRows>>): AiEndpointView[] {
  return rows.map((row) => toView(mapEndpointRow(row), row.is_default))
}

export const endpointService = {
  async listEndpoints(userId: number): Promise<AiEndpointView[]> {
    return toViews(await listEndpointRows(userId))
  },

  /**
   * 测试连接用一个极短的 chat completion：它同时验证了地址、密钥和模型名，
   * 而 /models 有些兼容层并不实现。
   */
  async testConnection(input: EndpointInput): Promise<EndpointTestResult> {
    let baseUrl: string
    let apiKey: string
    let model: string

    try {
      baseUrl = await normalizeBaseUrl(input.baseUrl)
      apiKey = readTrimmedString(input.apiKey, 'API Key', API_KEY_MAX, false)
      model = readTrimmedString(input.model, '模型名', MODEL_MAX, true)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '参数不正确' }
    }

    try {
      await chatCompletion(
        { id: 0, label: 'test', baseUrl, apiKey, model, visionModel: '' },
        [
          { role: 'system', content: 'You are a connectivity test. Reply with OK only.' },
          { role: 'user', content: 'OK' },
        ],
        { maxTokens: 8, temperature: 0, timeoutMs: 20_000 },
      )

      return { ok: true, message: '连接成功' }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof LlmRequestError ? error.message : '连接失败',
      }
    }
  },

  async createEndpoint(userId: number, input: EndpointInput): Promise<AiEndpointView> {
    const normalized = normalizeInput(input, { requireApiKey: true })
    normalized.baseUrl = await normalizeBaseUrl(input.baseUrl)

    // 第一个端点自动成为默认，否则用户会处于「有端点但没有默认」的状态。
    const existing = await listEndpointRows(userId)
    normalized.isDefault = normalized.isDefault || existing.length === 0

    const row = await insertEndpointRow(userId, normalized)

    return toView(mapEndpointRow(row), row.is_default)
  },

  async updateEndpoint(
    userId: number,
    id: number,
    input: EndpointInput,
  ): Promise<AiEndpointView> {
    const normalized = normalizeInput(input, { requireApiKey: false })
    normalized.baseUrl = await normalizeBaseUrl(input.baseUrl)

    const row = await updateEndpointRow(userId, id, normalized)

    if (!row) {
      throw new HttpError(404, '端点不存在')
    }

    return toView(mapEndpointRow(row), row.is_default)
  },

  async deleteEndpoint(userId: number, id: number) {
    const removed = await deleteEndpointRow(userId, id)

    if (!removed) {
      throw new HttpError(404, '端点不存在')
    }
  },

  async setDefaultEndpoint(userId: number, id: number) {
    const updated = await setDefaultEndpointRow(userId, id)

    if (!updated) {
      throw new HttpError(404, '端点不存在')
    }

    return this.listEndpoints(userId)
  },

  /**
   * 生成请求的入口。没有默认端点说明用户还没配过 ——
   * 现在没有服务器兜底，这里必须给出可操作的错误，而不是静默失败。
   */
  async resolveDefaultEndpoint(userId: number): Promise<AiEndpoint> {
    const row = await findDefaultEndpointRow(userId)

    if (!row) {
      throw new HttpError(400, '还没有配置模型端点，请先到设置里添加一个')
    }

    return mapEndpointRow(row)
  },

  /**
   * OCR 需要视觉模型。默认端点能做就用它，否则退到任意一个能做的，
   * 这样用户不必为了 OCR 把默认端点也换成视觉模型。
   */
  async resolveVisionEndpoint(userId: number): Promise<AiEndpoint> {
    const rows = await listEndpointRows(userId)
    const preferred =
      rows.find((row) => row.is_default && row.vision_model) ??
      rows.find((row) => row.vision_model)

    if (!preferred) {
      throw new HttpError(400, '没有可用于 OCR 的端点，请给某个端点填写视觉模型')
    }

    const endpoint = mapEndpointRow(preferred)

    // 视觉调用要用 visionModel，覆盖掉默认的文本模型。
    return { ...endpoint, model: endpoint.visionModel }
  },

  async findEndpoint(userId: number, id: number): Promise<AiEndpoint | null> {
    const row = await findEndpointRow(userId, id)

    return row ? mapEndpointRow(row) : null
  },
}
