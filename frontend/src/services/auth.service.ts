import { get, patch, post } from './http'
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

export async function logout() {
  return post<ApiResponse<null>>('/auth/logout', {})
}
