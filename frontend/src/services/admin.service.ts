import { del, get, patch, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  AdminAccessKey,
  AdminUsageOverview,
  AdminUser,
  CreateAccessKeyPayload,
  CreatedAdminAccessKey,
} from '../types/admin'
import type {
  AiEndpoint,
  EndpointPayload,
  EndpointTestPayload,
  EndpointTestResult,
} from '../types/settings'

/**
 * 管理页读取用户列表。
 */
export function fetchAdminUsers() {
  return get<ApiResponse<AdminUser[]>>('/admin/users')
}

/**
 * 停用、恢复和续期用户。
 */
export function updateAdminUserAccess(userId: number, action: 'suspend' | 'resume' | 'renew', days?: number) {
  return patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/access`, {
    action,
    days,
  })
}

/**
 * 修改用户角色。
 */
/** 开通或取消 VIP。VIP 现在唯一的含义是可以用管理员配置的系统端点。 */
export function updateAdminUserVip(userId: number, isVip: boolean) {
  return patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/vip`, {
    isVip,
  });
}

/**
 * 模型用量总览。配额上限由后端一并返回，页面不重复默认值。
 */
export function fetchAdminUsage() {
  return get<ApiResponse<AdminUsageOverview>>('/admin/usage')
}

export function fetchSystemEndpoint() {
  return get<ApiResponse<AiEndpoint | null>>('/admin/system-endpoint');
}

export function saveSystemEndpoint(payload: EndpointPayload) {
  return patch<ApiResponse<AiEndpoint>>('/admin/system-endpoint', payload);
}

export function deleteSystemEndpoint() {
  return del<ApiResponse<null>>('/admin/system-endpoint');
}

/** 系统端点由管理员配置，所以允许指向内网、允许 http。 */
export function testSystemEndpoint(payload: EndpointTestPayload) {
  return post<ApiResponse<EndpointTestResult>>('/admin/system-endpoint/test', payload);
}

export function updateAdminUserRole(userId: number, role: 'user' | 'admin') {
  return patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/role`, {
    role,
  })
}

/**
 * 修改用户角色。
 */
/**
 * 管理页读取访问密钥列表。
 */
export function fetchAdminAccessKeys() {
  return get<ApiResponse<AdminAccessKey[]>>('/admin/access-keys')
}

/**
 * 创建访问密钥，明文只会在这次响应里出现。
 */
export function createAdminAccessKey(payload: CreateAccessKeyPayload) {
  return post<ApiResponse<CreatedAdminAccessKey>>('/admin/access-keys', payload)
}

/**
 * 撤销或恢复未使用的访问密钥。
 */
export function updateAdminAccessKey(accessKeyId: number, status: 'active' | 'revoked') {
  return patch<ApiResponse<AdminAccessKey>>(`/admin/access-keys/${accessKeyId}`, {
    status,
  })
}
