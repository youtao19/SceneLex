import { get, patch } from './http';
import type { ApiResponse } from '../types/api';
import type { AiSettings, UpdateAiSettingsPayload } from '../types/settings';

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
