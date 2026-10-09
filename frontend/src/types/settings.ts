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

/**
 * 系统端点的可见信息。后端只回传名字和模型，不回传地址和密钥。
 */
export interface SystemEndpointStatus {
  /** 这个用户有没有资格用系统端点（管理员或 VIP）。 */
  canUse: boolean;
  /** 管理员到底配没配。canUse 为 true 但没配时，界面要提示管理员去配。 */
  available: boolean;
  label: string | null;
  model: string | null;
}

export interface EndpointListData {
  endpoints: AiEndpoint[];
  presets: EndpointPreset[];
  system: SystemEndpointStatus;
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
  /** 每日新词目标，0 表示只复习；与复习数量限制互不影响。 */
  dailyNewWordTarget: number;
  /** 当前学习的系统词书，未选择时为 null。 */
  currentSystemBookId: number | null;
}

/**
 * 只提交要改的字段：没带的字段服务端保持原值，避免页面少传一项就被清零。
 */
export interface UpdateLearningSettingsPayload {
  dailyReviewLimitEnabled?: boolean;
  dailyReviewLimit?: number;
  dailyNewWordTarget?: number;
  currentSystemBookId?: number | null;
}
