import {
  deleteReadingArticle,
  listReadingArticles,
  upsertReadingArticle
} from '../repositories/reading-history.repository'
import { HttpError } from '../utils/http-error'

function normalizeArticleContent(content: string) {
  return content.trim()
}

export const readingHistoryService = {
  /**
   * 保存的是用户真正开始阅读的文本，避免 OCR 中间结果直接污染历史。
   */
  async save(userId: number, content: string) {
    const text = normalizeArticleContent(content)

    if (!text) {
      throw new HttpError(400, '文章内容不能为空')
    }

    if (text.length > 30_000) {
      throw new HttpError(400, '文章太长，请拆分后保存')
    }

    return upsertReadingArticle(userId, text)
  },

  /**
   * 历史入口只需要最近文章，先不做搜索和分页，保持交互轻。
   */
  async list(userId: number) {
    return listReadingArticles(userId)
  },

  /**
   * 删除只作用于当前用户自己的历史记录。
   */
  async remove(userId: number, articleId: number) {
    if (!Number.isInteger(articleId) || articleId <= 0) {
      throw new HttpError(400, '文章历史 id 非法')
    }

    const deleted = await deleteReadingArticle(userId, articleId)

    if (!deleted) {
      throw new HttpError(404, '阅读历史不存在')
    }
  }
}
