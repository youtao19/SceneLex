import { readTrustedEndpointUrls } from '../config/endpoint-presets'
import { canUseSystemEndpoint } from '../utils/system-endpoint-access'
import { HttpError } from '../utils/http-error'
import { assertSafeEndpointUrl, UnsafeEndpointUrlError } from '../utils/ssrf-guard'
import { chatCompletion, LlmRequestError, type ChatMessage } from './llm-client'
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
import {
  deleteSystemEndpoint as deleteSystemEndpointRow,
  findSystemEndpoint,
  saveSystemEndpoint as saveSystemEndpointRow,
} from '../repositories/system-endpoint.repository'
import type { AiEndpoint, AiEndpointView } from '../types/endpoint'
import type { AuthUser } from '../types/auth'

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

/**
 * 系统端点由管理员配置，允许指向内网、允许 http：管理员就是服务器主人，
 * 把系统端点指到内网的 vLLM 是正常运维，不是攻击。
 */
async function normalizeAdminBaseUrl(value: unknown) {
  const raw = readTrimmedString(value, '接口地址', 300, true)

  try {
    const url = await assertSafeEndpointUrl(raw, { allowPrivateAddresses: true })

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

const TEST_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are a connectivity test. Reply with OK only.' },
  { role: 'user', content: 'OK' },
]

/**
 * 用一个极短的 chat completion 测连通性：它同时验证了地址、密钥和模型名，
 * 而 /models 有些兼容层并不实现。
 */
async function runConnectionTest(endpoint: AiEndpoint): Promise<EndpointTestResult> {
  try {
    await chatCompletion(endpoint, TEST_MESSAGES, {
      maxTokens: 8,
      temperature: 0,
      timeoutMs: 20_000,
    })

    return { ok: true, message: '连接成功' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof LlmRequestError ? error.message : '连接失败',
    }
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
   * 测试一份还没保存的配置。
   */
  async testConnection(input: EndpointInput, trusted = false): Promise<EndpointTestResult> {
    let baseUrl: string
    let apiKey: string
    let model: string

    try {
      baseUrl = trusted ? await normalizeAdminBaseUrl(input.baseUrl) : await normalizeBaseUrl(input.baseUrl)
      apiKey = readTrimmedString(input.apiKey, 'API Key', API_KEY_MAX, false)
      model = readTrimmedString(input.model, '模型名', MODEL_MAX, true)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '参数不正确' }
    }

    // 管理员改模型名或地址时不该被迫重新粘贴一次 Key，所以留空就沿用已保存的那份。
    if (trusted && !apiKey) {
      apiKey = (await findSystemEndpoint())?.apiKey ?? ''
    }

    return runConnectionTest({
      id: 0,
      label: 'test',
      baseUrl,
      apiKey,
      model,
      visionModel: '',
      trusted,
    })
  },

  /**
   * 测试已保存的端点。密钥只在后端解密，所以卡片上的「测试」按钮
   * 不能复用未保存那条路径。
   */
  async testSavedEndpoint(userId: number, id: number): Promise<EndpointTestResult> {
    const row = await findEndpointRow(userId, id)

    if (!row) {
      throw new HttpError(404, '端点不存在')
    }

    return runConnectionTest(mapEndpointRow(row))
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
   * 不抛错的版本：词卡命中系统缓存时根本不需要调模型，
   * 所以调用方要先拿到「可能为空」的端点，而不是在这里就把请求打回去。
   */
  /**
   * 决定这个用户实际用哪个端点：先看他自己配的，没有再看系统端点。
   * 返回 null 表示两者都没有 —— 词卡命中系统缓存时不需要调模型，
   * 所以这里不能直接报错，要让调用方决定要不要报。
   */
  async findEndpointForUser(user: AuthUser): Promise<AiEndpoint | null> {
    const own = await findDefaultEndpointRow(user.id)

    if (own) {
      return mapEndpointRow(own)
    }

    return canUseSystemEndpoint(user) ? findSystemEndpoint() : null
  },

  /**
   * 生成请求的入口。拿不到端点时必须给出可操作的错误，而不是静默失败。
   */
  async resolveEndpointForUser(user: AuthUser): Promise<AiEndpoint> {
    const endpoint = await this.findEndpointForUser(user)

    if (endpoint) {
      return endpoint
    }

    if (canUseSystemEndpoint(user)) {
      throw new HttpError(400, '管理员还没有配置系统端点')
    }

    throw new HttpError(400, '还没有配置模型端点。可以自己添加一个，或联系管理员开通系统端点。')
  },

  /**
   * OCR 需要视觉模型。优先用用户自己的，其次才是系统端点，
   * 这样用户配了视觉模型就不必占用管理员的额度。
   */
  async resolveVisionEndpointForUser(user: AuthUser): Promise<AiEndpoint> {
    const rows = await listEndpointRows(user.id)
    const preferred =
      rows.find((row) => row.is_default && row.vision_model) ??
      rows.find((row) => row.vision_model)

    if (preferred) {
      const endpoint = mapEndpointRow(preferred)

      // 视觉调用要用 visionModel，覆盖掉默认的文本模型。
      return { ...endpoint, model: endpoint.visionModel }
    }

    if (canUseSystemEndpoint(user)) {
      const system = await findSystemEndpoint()

      if (system?.visionModel) {
        return { ...system, model: system.visionModel }
      }
    }

    throw new HttpError(400, '没有可用于 OCR 的端点。给某个端点填上视觉模型，或联系管理员开通系统端点。')
  },

  /**
   * 系统端点只有管理员能改，所以读取时不需要按用户过滤。
   */
  async readSystemEndpoint(): Promise<AiEndpointView | null> {
    const endpoint = await findSystemEndpoint()

    return endpoint ? toView(endpoint, true) : null
  },

  async saveSystemEndpoint(input: EndpointInput): Promise<AiEndpointView> {
    const existing = await findSystemEndpoint()
    // 密钥留空表示保持原值，但第一次配置必须有 Key，否则端点无法调用。
    const normalized = normalizeInput(input, { requireApiKey: !existing })
    normalized.baseUrl = await normalizeAdminBaseUrl(input.baseUrl)

    const endpoint = await saveSystemEndpointRow({
      label: normalized.label,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      visionModel: normalized.visionModel,
      apiKey: normalized.apiKey,
    })

    return toView(endpoint, true)
  },

  async deleteSystemEndpoint() {
    await deleteSystemEndpointRow()
  },

  async findEndpoint(userId: number, id: number): Promise<AiEndpoint | null> {
    const row = await findEndpointRow(userId, id)

    return row ? mapEndpointRow(row) : null
  },
}
