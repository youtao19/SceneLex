import { get, patch, post, request } from './http'
import type { ApiResponse } from '../types/api'
import type {
  AuthSession,
  AuthUser,
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

export async function logout() {
  return post<ApiResponse<null>>('/auth/logout', {})
}
