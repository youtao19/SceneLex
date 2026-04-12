import { request } from './http';
import type { ApiResponse } from '../types/api';
import type { HistoryItem } from '../types/history';

export function fetchHistoryList() {
  return request<ApiResponse<HistoryItem[]>>('/history');
}

