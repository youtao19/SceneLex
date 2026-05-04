import { request } from './http';
import type { ApiResponse } from '../types/api';

export type OcrMethod = 'tesseract' | 'paddle' | 'vision';

/**
 * 图片文章识别使用 FormData，让浏览器自动生成 multipart boundary。
 */
export function recognizeArticleFromImage(file: File, method: OcrMethod) {
  const formData = new FormData();

  formData.append('image', file);
  formData.append('method', method);

  return request<ApiResponse<{ text: string }>>('/ocr', {
    method: 'POST',
    body: formData,
  });
}
