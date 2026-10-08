/**
 * 端点相关的类型。
 *
 * 只走 OpenAI-compatible 的 /v1/chat/completions，所以一个端点就是
 * 地址 + 密钥 + 模型；视觉模型单独一个字段，留空表示这个端点不做 OCR。
 */

/** 后端只回传密钥掩码，明文不出后端。 */
export interface AiEndpoint {
  id: number;
  label: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  keyPreview: string;
  isDefault: boolean;
}

export interface EndpointPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  visionModels: string[];
  hint: string;
  trusted: boolean;
}

export interface EndpointListData {
  endpoints: AiEndpoint[];
  presets: EndpointPreset[];
}

export interface EndpointPayload {
  label: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  /** 编辑时留空表示保持原密钥不变。 */
  apiKey: string;
  isDefault?: boolean;
}

export interface EndpointTestPayload {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface EndpointTestResult {
  ok: boolean;
  message: string;
}

export interface LearningSettings {
  dailyReviewLimitEnabled: boolean;
  dailyReviewLimit: number;
}

export interface UpdateLearningSettingsPayload {
  dailyReviewLimitEnabled: boolean;
  dailyReviewLimit: number;
}
