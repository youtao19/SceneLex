/**
 * 端点相关的类型。
 *
 * 只走 OpenAI-compatible 的 /v1/chat/completions，所以一个端点就是
 * baseUrl + apiKey + model 三件事；视觉模型单独一个字段，留空表示不做 OCR。
 */

/** 带明文密钥，只允许在后端内部流转，绝不出现在 API 响应里。 */
export interface AiEndpoint {
  id: number
  label: string
  baseUrl: string
  apiKey: string
  model: string
  /** 空字符串表示这个端点不做视觉 OCR。 */
  visionModel: string
  /**
   * 管理员配置的系统端点。只影响出站校验：管理员就是服务器主人，
   * 允许他指向内网；用户填的端点永远是 false。
   */
  trusted: boolean
}

/** 给前端的形态：密钥只留掩码。 */
export interface AiEndpointView {
  id: number
  label: string
  baseUrl: string
  model: string
  visionModel: string
  keyPreview: string
  isDefault: boolean
}

export interface EndpointPreset {
  id: string
  name: string
  baseUrl: string
  models: string[]
  visionModels: string[]
  hint: string
  /** 管理员维护的预设允许指向内网（例如本机 Ollama），用户手填的地址不行。 */
  trusted: boolean
}
