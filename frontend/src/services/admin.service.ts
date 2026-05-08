import { get, patch, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  AdminAccessKey,
  AdminUser,
  CreateAccessKeyPayload,
  CreatedAdminAccessKey,
} from '../types/admin'

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
export function updateAdminUserRole(userId: number, role: 'user' | 'admin') {
  return patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/role`, {
    role,
  })
}

/**
 * 修改用户 VIP 状态，VIP 可以使用服务器统一配置的模型 API。
 */
export function updateAdminUserVip(userId: number, isVip: boolean) {
  return patch<ApiResponse<AdminUser>>(`/admin/users/${userId}/vip`, {
    isVip,
  })
}

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
