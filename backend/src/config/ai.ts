import { env } from './env'

export type AiProvider = 'ollama' | 'kimi' | 'deepseek'
export type AiModelConfig = {
  baseURL: string
  model: string
  timeout: number
  apiKey?: string
}

export interface AiSettingsSnapshot {
  provider: AiProvider
  providers: Array<{
    id: AiProvider
    name: string
    model: string
    baseURL: string
    timeout: number
    hasApiKey: boolean
  }>
}

function readProvider(): AiProvider {
  const provider = env.aiProvider.toLowerCase()

  if (provider === 'ollama' || provider === 'kimi' || provider === 'deepseek') {
    return provider
  }

  throw new Error(`AI_PROVIDER 只支持 ollama、kimi 或 deepseek，当前值是：${provider}`)
}

export const aiConfig = {
  provider: readProvider(),
  ollama: {
    // Ollama 原生 API 地址，注意这里带 /api。
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
    model: process.env.OLLAMA_MODEL ?? 'qwen3.5:4b',
    timeout: Number(process.env.OLLAMA_TIMEOUT ?? 60_000)
  },
  kimi: {
    // Kimi 使用 OpenAI-compatible API，和 OCR 的远程 Kimi 配置保持一致。
    baseURL: process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1',
    model: process.env.KIMI_MODEL ?? 'kimi-k2.6',
    timeout: Number(process.env.KIMI_TIMEOUT ?? process.env.OLLAMA_TIMEOUT ?? 60_000),
    apiKey: process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? ''
  },
  deepseek: {
    // DeepSeek 官方 API 兼容 OpenAI chat/completions。
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
    timeout: Number(process.env.DEEPSEEK_TIMEOUT ?? 60_000),
    apiKey: process.env.DEEPSEEK_API_KEY ?? ''
  }
}

const providerNames: Record<AiProvider, string> = {
  ollama: 'Ollama',
  kimi: 'Kimi',
  deepseek: 'DeepSeek'
}

/**
 * 前端设置页只需要运行态快照，不能把 API Key 原文传给浏览器。
 */
export function readAiSettings(): AiSettingsSnapshot {
  const providers: AiSettingsSnapshot['providers'] = (['ollama', 'kimi', 'deepseek'] as AiProvider[]).map((id) => {
    const config = aiConfig[id] as AiModelConfig

    return {
      id,
      name: providerNames[id],
      model: config.model,
      baseURL: config.baseURL,
      timeout: config.timeout,
      hasApiKey: Boolean(config.apiKey)
    }
  })

  return {
    provider: aiConfig.provider,
    providers
  }
}

/**
 * 设置页切换的是当前 Node 进程的运行态，避免从浏览器改写本地 .env。
 */
export function updateAiSettings(provider: AiProvider, model: string): AiSettingsSnapshot {
  aiConfig.provider = provider
  aiConfig[provider].model = model

  return readAiSettings()
}

/**
 * API 边界统一校验 provider，避免业务层收到不存在的模型配置。
 */
export function isAiProvider(value: string): value is AiProvider {
  return value === 'ollama' || value === 'kimi' || value === 'deepseek'
}
