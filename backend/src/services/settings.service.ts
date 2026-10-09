import {
  getLearningSettings,
  saveLearningSettings,
} from '../repositories/settings.repository'
import { findSystemWordBookSummary } from '../repositories/system-word-book.repository'
import { HttpError } from '../utils/http-error'
import { normalizeNewWordTarget } from '../utils/study-rules'
import type { LearningSettings } from '../types/settings'

function normalizeDailyReviewLimit(value: unknown) {
  const limit = Number(value)

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError(400, '每日复习数量必须是 1 到 200 之间的整数')
  }

  return limit
}

function normalizeDailyReviewLimitEnabled(value: unknown) {
  return value === true
}

/**
 * 提交体里没带的字段保持原值：老网页只提交复习限制，不会因此把新词目标清零。
 */
function pickSubmitted<T>(submitted: unknown, current: T, normalize: (value: unknown) => T): T {
  return submitted === undefined ? current : normalize(submitted)
}

/**
 * 词书必须是真实存在的系统词书；null 表示清空选择，不是“保持原值”。
 */
async function normalizeCurrentSystemBookId(
  userId: number,
  submitted: unknown,
): Promise<number | null> {
  if (submitted === null || submitted === '') {
    return null
  }

  const bookId = Number(submitted)

  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw new HttpError(400, '当前词书非法')
  }

  const book = await findSystemWordBookSummary(bookId)

  if (!book) {
    throw new HttpError(404, '系统词书不存在')
  }

  return book.id
}

export const settingsService = {
  /**
   * 复习舱、新词计划和新词队列共用同一份用户级学习设置。
   */
  async getLearningSettings(userId: number): Promise<LearningSettings> {
    return getLearningSettings(userId)
  },

  /**
   * 设置页保存的是每天最多进入队列的到期词数量和每日新词目标，
   * 不改每个单词的 next_review，也不改 SRS 算法。
   */
  async updateLearningSettings(
    userId: number,
    submitted: {
      dailyReviewLimitEnabled?: unknown
      dailyReviewLimit?: unknown
      dailyNewWordTarget?: unknown
      currentSystemBookId?: unknown
    },
  ): Promise<LearningSettings> {
    const current = await getLearningSettings(userId)

    const next: LearningSettings = {
      dailyReviewLimitEnabled: pickSubmitted(
        submitted.dailyReviewLimitEnabled,
        current.dailyReviewLimitEnabled,
        normalizeDailyReviewLimitEnabled,
      ),
      dailyReviewLimit: pickSubmitted(
        submitted.dailyReviewLimit,
        current.dailyReviewLimit,
        normalizeDailyReviewLimit,
      ),
      dailyNewWordTarget: pickSubmitted(
        submitted.dailyNewWordTarget,
        current.dailyNewWordTarget,
        normalizeNewWordTarget,
      ),
      currentSystemBookId: await normalizeCurrentSystemBookId(
        userId,
        submitted.currentSystemBookId === undefined
          ? current.currentSystemBookId
          : submitted.currentSystemBookId,
      ),
    }

    return saveLearningSettings(userId, next)
  },
}
