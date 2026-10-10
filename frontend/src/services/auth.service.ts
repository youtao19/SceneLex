import { del, get, patch, post, request, requestFile } from './http'
import type { ApiResponse } from '../types/api'
import type {
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '../types/auth'

export async function register(payload: RegisterPayload) {
  return post<ApiResponse<AuthSession>>('/auth/register', payload)
}

export async function login(payload: LoginPayload) {
  return post<ApiResponse<AuthSession>>('/auth/login', payload)
}

export async function getMe() {
  return get<ApiResponse<AuthUser>>('/auth/me')
}

export async function updateProfile(payload: UpdateProfilePayload) {
  return patch<ApiResponse<AuthUser>>('/auth/me', payload)
}

/**
 * 上传头像。
 * 注意：FormData 请求不能手动设置 Content-Type，fetch 会自动设置带 boundary 的 header。
 */
export async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('avatar', file)

  return request<ApiResponse<AuthUser>>('/auth/me/avatar', {
    method: 'POST',
    body: formData,
  })
}

/**
 * 改密码成功后当前会话仍然有效，只有其他设备会被踢下线。
 */
export async function changePassword(payload: ChangePasswordPayload) {
  return post<ApiResponse<null>>('/auth/password', payload)
}

/**
 * 注销账号要重新输密码：会话可能是别人在用，仅凭会话不足以销毁数据。
 */
export async function deleteAccount(password: string) {
  return del<ApiResponse<null>>('/auth/account', { password })
}

/**
 * 导出返回的是文件，不是 { code, message, data }，所以走 requestFile。
 */
export async function exportData() {
  return requestFile('/auth/export')
}

export async function logout() {
  return post<ApiResponse<null>>('/auth/logout', {})
}
