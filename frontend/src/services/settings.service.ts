import { get, patch } from './http';
import type { ApiResponse } from '../types/api';
import type {
  AiSettings,
  LearningSettings,
  UpdateAiSettingsPayload,
  UpdateLearningSettingsPayload,
} from '../types/settings';

/**
 * 更多页面需要后端运行态，避免前端和真实模型配置各说各的。
 */
export function fetchAiSettings() {
  return get<ApiResponse<AiSettings>>('/settings/ai');
}

/**
 * 只提交用户能安全操作的 provider 和 model。
 */
export function updateAiSettings(payload: UpdateAiSettingsPayload) {
  return patch<ApiResponse<AiSettings>>('/settings/ai', payload);
}

/**
 * 读取复习舱每天最多推送的到期单词数。
 */
export function fetchLearningSettings() {
  return get<ApiResponse<LearningSettings>>('/settings/learning');
}

/**
 * 保存后端用户级学习节奏，下一次同步复习舱会立即生效。
 */
export function updateLearningSettings(payload: UpdateLearningSettingsPayload) {
  return patch<ApiResponse<LearningSettings>>('/settings/learning', payload);
}
