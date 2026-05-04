import { get } from './http'
import type { ApiResponse } from '../types/api'
import type {
  SystemWordBook,
  SystemWordBookDetail,
} from '../types/system-word-book'

export function fetchSystemWordBooks() {
  return get<ApiResponse<SystemWordBook[]>>('/system-word-books')
}

export function fetchSystemWordBookDetail(bookId: number) {
  return get<ApiResponse<SystemWordBookDetail>>(`/system-word-books/${bookId}`)
}
