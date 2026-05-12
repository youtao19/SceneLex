import { request } from './http';
import type { ApiResponse } from '../types/api';

/**
 * 图片文章解析使用 Kimi 多模态；FormData 让浏览器自动生成 multipart boundary。
 */
export function recognizeArticleFromImage(file: File) {
  const formData = new FormData();

  formData.append('image', file);

  return request<ApiResponse<{ text: string }>>('/ocr', {
    method: 'POST',
    body: formData,
  });
}
