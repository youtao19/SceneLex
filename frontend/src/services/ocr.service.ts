import { request } from './http';
import type { ApiResponse } from '../types/api';

export function recognizeWordFromImage(fileName: string) {
  return request<ApiResponse<{ text: string }>>('/ocr', {
    method: 'POST',
    body: JSON.stringify({ fileName }),
  });
}

