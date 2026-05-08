import { aiConfig, type AiModelConfig } from '../config/ai'
import {
  deleteUserApiKey,
  getLearningSettings,
  listUserApiKeyRows,
  readUserApiKeys,
  saveLearningSettings,
  saveUserApiKey,
} from '../repositories/settings.repository'
import { HttpError } from '../utils/http-error'
import type { LearningSettings, UserApiKeyProvider, UserApiKeySettings } from '../types/settings'

function normalizeDailyReviewLimit(value: unknown) {
  const limit = Number(value)

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError(400, '每日复习数量必须是 1 到 200 之间的整数')
  }

  return limit
}

function normalizeDailyReviewLimitEnabled(value: unknown) {
  return value === true
}

/**
 * 用户密钥只开放给需要鉴权的 OpenAI-compatible 服务。
 */
function isUserApiKeyProvider(value: string): value is UserApiKeyProvider {
  return value === 'kimi' || value === 'deepseek'
}

/**
 * provider 在 API 边界收敛，避免用户写入任意字段污染配置表。
 */
function normalizeApiKeyProvider(value: unknown) {
  const provider = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!isUserApiKeyProvider(provider)) {
    throw new HttpError(400, 'API Key 目前只支持 kimi 或 deepseek')
  }

  return provider
}

/**
 * 密钥只做基本长度约束，具体有效性由模型服务在调用时判断。
 */
function normalizeApiKey(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'API Key 必须是字符串')
  }

  if (value.length > 300) {
    throw new HttpError(400, 'API Key 太长，请检查是否粘贴了错误内容')
  }

  return value.trim()
}

const userApiKeyProviderNames: Record<UserApiKeyProvider, string> = {
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
}

/**
 * 验证只发很短的请求，避免用户保存 key 时被完整生成任务拖住。
 */
function buildApiKeyTestBody(provider: UserApiKeyProvider, model: string) {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a connectivity test. Reply with OK only.',
      },
      {
        role: 'user',
        content: 'OK',
      },
    ],
    max_tokens: 8,
    temperature: 0,
    stream: false,
    ...(provider === 'kimi'
      ? {
        thinking: {
          type: 'disabled',
        },
      }
      : {}),
  }
}

/**
 * 上游错误可能包含密钥或长 JSON，只取短错误摘要反馈给用户。
 */
function summarizeProviderError(text: string) {
  const cleanText = text.trim()

  if (!cleanText) {
    return '没有返回错误详情'
  }

  try {
    const data = JSON.parse(cleanText) as {
      error?: {
        message?: string
      }
      message?: string
    }
    const message = data.error?.message ?? data.message

    if (message) {
      return message.slice(0, 180)
    }
  } catch {
    // 非 JSON 错误直接走下面的文本摘要。
  }

  return cleanText.slice(0, 180)
}

/**
 * 保存前测试用户自己的 key，避免把无效密钥写入后到生成时才失败。
 */
async function verifyUserApiKey(provider: UserApiKeyProvider, apiKey: string) {
  const config = aiConfig[provider] as AiModelConfig
  const timeout = Math.min(config.timeout, 15_000)
  let response: Response

  try {
    response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildApiKeyTestBody(provider, config.model)),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new HttpError(400, `${userApiKeyProviderNames[provider]} API Key 测试超时，请检查网络、服务地址或模型名`)
    }

    throw new HttpError(400, `${userApiKeyProviderNames[provider]} API Key 测试失败：${error instanceof Error ? error.message : '网络请求失败'}`)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new HttpError(
      400,
      `${userApiKeyProviderNames[provider]} API Key 测试失败：${response.status} ${summarizeProviderError(errorText)}`,
    )
  }
}

/**
 * 设置页展示状态即可，不能为了“已填写”把明文回传给前端。
 */
function buildUserApiKeySettings(
  rows: Array<{ provider: UserApiKeyProvider }>,
): UserApiKeySettings {
  const providers: UserApiKeyProvider[] = ['kimi', 'deepseek']

  return {
    activeProvider: aiConfig.provider,
    providers: providers.map((provider) => ({
      id: provider,
      name: userApiKeyProviderNames[provider],
      hasUserApiKey: rows.some((row) => row.provider === provider),
      hasServerApiKey: Boolean(aiConfig[provider].apiKey),
    })),
  }
}

export const settingsService = {
  /**
   * 复习舱和设置页共用同一份用户级学习设置。
   */
  async getLearningSettings(userId: number): Promise<LearningSettings> {
    return getLearningSettings(userId)
  },

  /**
   * 设置页保存的是每天最多进入队列的到期词数量，不改每个单词的 next_review。
   */
  async updateLearningSettings(
    userId: number,
    dailyReviewLimitEnabledInput: unknown,
    dailyReviewLimitInput: unknown,
  ): Promise<LearningSettings> {
    const dailyReviewLimitEnabled = normalizeDailyReviewLimitEnabled(dailyReviewLimitEnabledInput)
    const dailyReviewLimit = normalizeDailyReviewLimit(dailyReviewLimitInput)

    return saveLearningSettings(userId, dailyReviewLimitEnabled, dailyReviewLimit)
  },

  /**
   * 只返回密钥状态，不把用户密钥明文送回浏览器。
   */
  async getUserApiKeySettings(userId: number): Promise<UserApiKeySettings> {
    return buildUserApiKeySettings(await listUserApiKeyRows(userId))
  },

  /**
   * 空字符串表示清除该 provider 的用户密钥，方便用户撤销自己的配置。
   */
  async updateUserApiKey(
    userId: number,
    providerInput: unknown,
    apiKeyInput: unknown,
  ): Promise<UserApiKeySettings> {
    const provider = normalizeApiKeyProvider(providerInput)
    const apiKey = normalizeApiKey(apiKeyInput)

    if (apiKey) {
      await verifyUserApiKey(provider, apiKey)
      await saveUserApiKey(userId, provider, apiKey)
    } else {
      await deleteUserApiKey(userId, provider)
    }

    return buildUserApiKeySettings(await listUserApiKeyRows(userId))
  },

  /**
   * 模型调用只需要当前用户可解密的密钥，调用方不关心它来自数据库还是环境。
   */
  async getUserAiSecrets(userId: number) {
    return readUserApiKeys(userId)
  },
}
