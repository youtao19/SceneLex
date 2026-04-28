import { request } from './http';
import type { ApiResponse } from '../types/api';
import type { HistoryArchive } from '../types/history';

export function fetchHistoryList() {
  return request<ApiResponse<HistoryArchive>>('/history');
}
