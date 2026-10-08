import { del, get, patch, post } from './http';
import type { ApiResponse } from '../types/api';
import type {
  AiEndpoint,
  EndpointListData,
  EndpointPayload,
  EndpointTestPayload,
  EndpointTestResult,
  LearningSettings,
  UpdateLearningSettingsPayload,
} from '../types/settings';

/**
 * 端点列表和预设一起返回，设置页首屏只需要一次请求。
 */
export function fetchEndpoints() {
  return get<ApiResponse<EndpointListData>>('/settings/endpoints');
}

export function createEndpoint(payload: EndpointPayload) {
  return post<ApiResponse<AiEndpoint>>('/settings/endpoints', payload);
}

export function updateEndpoint(endpointId: number, payload: EndpointPayload) {
  return patch<ApiResponse<AiEndpoint>>(`/settings/endpoints/${endpointId}`, payload);
}

export function deleteEndpoint(endpointId: number) {
  return del<ApiResponse<null>>(`/settings/endpoints/${endpointId}`);
}

export function setDefaultEndpoint(endpointId: number) {
  return post<ApiResponse<AiEndpoint[]>>(`/settings/endpoints/${endpointId}/default`, {});
}

/**
 * 保存前先测一次连通性，避免把无效配置写进去。
 */
export function testEndpointConnection(payload: EndpointTestPayload) {
  return post<ApiResponse<EndpointTestResult>>('/settings/endpoints/test', payload);
}

/**
 * 测试已保存的端点：前端拿不到密钥明文，只能让后端用它自己解密出来的那份。
 */
export function testSavedEndpoint(endpointId: number) {
  return post<ApiResponse<EndpointTestResult>>(`/settings/endpoints/${endpointId}/test`, {});
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
