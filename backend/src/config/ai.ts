import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { env } from './env'

export type AiProvider = 'ollama' | 'omlx'

function readProvider(): AiProvider {
  const provider = env.aiProvider.toLowerCase()

  if (provider === 'ollama' || provider === 'omlx') {
    return provider
  }

  throw new Error(`AI_PROVIDER 只支持 ollama 或 omlx，当前值是：${provider}`)
}

function readOmlxApiKey() {
  if (process.env.OMLX_API_KEY) {
    return process.env.OMLX_API_KEY
  }

  try {
    const settingsPath = path.join(os.homedir(), '.omlx', 'settings.json')

    if (!fs.existsSync(settingsPath)) {
      return ''
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      auth?: {
        api_key?: string
      }
    }

    // oMLX 桌面服务默认开启鉴权，本机开发时直接复用它自己的配置。
    return settings.auth?.api_key ?? ''
  } catch {
    return ''
  }
}

export const aiConfig = {
  provider: readProvider(),
  ollama: {
    // Ollama 原生 API 地址，注意这里带 /api。
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
    model: process.env.OLLAMA_MODEL ?? 'qwen3:4b',
    timeout: Number(process.env.OLLAMA_TIMEOUT ?? 60_000)
  },
  omlx: {
    // oMLX 使用 OpenAI-compatible API，默认服务地址是 localhost:8000/v1。
    baseURL: process.env.OMLX_BASE_URL ?? 'http://localhost:8000/v1',
    model: process.env.OMLX_MODEL ?? process.env.OLLAMA_MODEL ?? 'qwen3:4b',
    timeout: Number(process.env.OMLX_TIMEOUT ?? process.env.OLLAMA_TIMEOUT ?? 60_000),
    apiKey: readOmlxApiKey()
  }
}
