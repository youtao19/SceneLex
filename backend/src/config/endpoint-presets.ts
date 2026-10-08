import type { EndpointPreset } from '../types/endpoint'

/**
 * 预设是给用户抄近路用的，不是白名单 —— 用户仍然可以填任意 OpenAI 兼容地址。
 *
 * trusted 的含义只有一个：这个地址由管理员维护，所以允许指向内网、允许 http。
 * 本机 Ollama 就是唯一需要这个豁免的场景。
 */
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    visionModels: [],
    hint: '便宜稳定，不支持图片',
    trusted: false
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.6', 'kimi-thinking-preview'],
    visionModels: ['kimi-k2.6-vision'],
    hint: '支持视觉，可兼做 OCR',
    trusted: false
  },
  {
    id: 'ollama',
    name: 'Ollama（本机）',
    baseUrl: process.env.OLLAMA_OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
    models: ['qwen3.5:4b', 'gemma4:e4b'],
    visionModels: ['qwen3-vl:8b'],
    hint: '本地免费，需要先自己拉起服务',
    trusted: true
  }
]

/**
 * SSRF 守卫用这份列表判断「管理员预设」和「用户手填」。
 * 从预设派生而不是另写一份，避免两处漂移。
 */
export function readTrustedEndpointUrls() {
  return ENDPOINT_PRESETS.filter((preset) => preset.trusted).map((preset) => preset.baseUrl)
}
