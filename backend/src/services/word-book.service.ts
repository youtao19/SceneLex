import {
  createWordBook,
  deleteWordBook,
  findWordBook,
  getWordBookDetail,
  listWordBooks,
  removeWordFromBook,
  renameWordBook,
} from '../repositories/word-book.repository';
import { HttpError } from '../utils/http-error';
import type { WordBook, WordBookDetail } from '../types/word-book';

function normalizeName(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeId(value: unknown, fieldName: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `${fieldName} 非法`);
  }

  return id;
}

function assertValidName(name: string) {
  if (!name) {
    throw new HttpError(400, '单词本名称不能为空');
  }

  if (name.length > 40) {
    throw new HttpError(400, '单词本名称不能超过 40 个字符');
  }
}

export const wordBookService = {
  async list(userId: number): Promise<WordBook[]> {
    return listWordBooks(userId);
  },

  async detail(userId: number, bookIdInput: unknown): Promise<WordBookDetail> {
    const bookId = normalizeId(bookIdInput, 'bookId');
    const detail = await getWordBookDetail(userId, bookId);

    if (!detail) {
      throw new HttpError(404, '单词本不存在');
    }

    return detail;
  },

  async create(userId: number, nameInput: unknown): Promise<WordBook> {
    const name = normalizeName(nameInput);
    assertValidName(name);

    return createWordBook(userId, name);
  },

  async rename(
    userId: number,
    bookIdInput: unknown,
    nameInput: unknown,
  ): Promise<WordBook> {
    const bookId = normalizeId(bookIdInput, 'bookId');
    const name = normalizeName(nameInput);
    assertValidName(name);

    const updated = await renameWordBook(userId, bookId, name);

    if (!updated) {
      throw new HttpError(404, '单词本不存在');
    }

    return updated;
  },

  /**
   * 删除单词本只删除分组关系，不能删主词库里的词和复习进度。
   */
  async remove(userId: number, bookIdInput: unknown) {
    const bookId = normalizeId(bookIdInput, 'bookId');
    const book = await findWordBook(userId, bookId);

    if (!book) {
      throw new HttpError(404, '单词本不存在');
    }

    if (book.isDefault) {
      throw new HttpError(400, '默认单词本不能删除');
    }

    const removed = await deleteWordBook(userId, bookId);

    if (!removed) {
      throw new HttpError(404, '单词本不存在');
    }

    return null;
  },

  async removeWord(
    userId: number,
    bookIdInput: unknown,
    wordIdInput: unknown,
  ) {
    const bookId = normalizeId(bookIdInput, 'bookId');
    const wordId = normalizeId(wordIdInput, 'wordId');
    const removed = await removeWordFromBook(userId, bookId, wordId);

    if (!removed) {
      throw new HttpError(404, '单词或单词本不存在');
    }

    return null;
  },
};
