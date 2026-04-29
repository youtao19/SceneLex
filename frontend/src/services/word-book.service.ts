import { del, get, patch, post } from './http'
import type { ApiResponse } from '../types/api'
import type { WordBook, WordBookDetail } from '../types/word-book'

export function fetchWordBooks() {
  return get<ApiResponse<WordBook[]>>('/word-books')
}

export function fetchWordBookDetail(bookId: number) {
  return get<ApiResponse<WordBookDetail>>(`/word-books/${bookId}`)
}

export function createWordBook(name: string) {
  return post<ApiResponse<WordBook>>('/word-books', { name })
}

export function renameWordBook(bookId: number, name: string) {
  return patch<ApiResponse<WordBook>>(`/word-books/${bookId}`, { name })
}

export function deleteWordBook(bookId: number) {
  return del<ApiResponse<null>>(`/word-books/${bookId}`)
}

export function removeWordFromBook(bookId: number, wordId: number) {
  return del<ApiResponse<null>>(`/word-books/${bookId}/words/${wordId}`)
}
