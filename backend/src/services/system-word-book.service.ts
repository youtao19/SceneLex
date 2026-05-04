import {
  getSystemWordBookDetail,
  listSystemWordBooks,
} from '../repositories/system-word-book.repository';
import { HttpError } from '../utils/http-error';

function normalizeBookId(value: unknown) {
  const bookId = Number(value);

  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw new HttpError(400, '系统词书 id 非法');
  }

  return bookId;
}

export const systemWordBookService = {
  /**
   * 系统词书是全局模板，列表里的 learnedWords 只按当前用户动态计算。
   */
  async list(userId: number) {
    return listSystemWordBooks(userId);
  },

  /**
   * 详情默认返回一小批候选词，避免用户一进词书就拉完整大纲。
   */
  async detail(userId: number, bookIdInput: unknown, limitInput?: unknown, offsetInput?: unknown) {
    const bookId = normalizeBookId(bookIdInput);
    const limit = Math.min(Math.max(Number(limitInput) || 100, 1), 500);
    const offset = Math.max(Number(offsetInput) || 0, 0);
    const detail = await getSystemWordBookDetail(userId, bookId, limit, offset);

    if (!detail) {
      throw new HttpError(404, '系统词书不存在');
    }

    return detail;
  },
};
