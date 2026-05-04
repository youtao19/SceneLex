import { getLearningSettings, saveLearningSettings } from '../repositories/settings.repository'
import { HttpError } from '../utils/http-error'
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

export const settingsService = {
  /**
   * 复习舱和设置页共用同一份用户级学习设置。
   */
  async getLearningSettings(userId: number): Promise<LearningSettings> {
    return getLearningSettings(userId)
  },

  /**
   * 设置页保存的是每天最多进入队列的到期词数量，不改每个单词的 next_review。
   */
  async updateLearningSettings(
    userId: number,
    dailyReviewLimitEnabledInput: unknown,
    dailyReviewLimitInput: unknown,
  ): Promise<LearningSettings> {
    const dailyReviewLimitEnabled = normalizeDailyReviewLimitEnabled(dailyReviewLimitEnabledInput)
    const dailyReviewLimit = normalizeDailyReviewLimit(dailyReviewLimitInput)

    return saveLearningSettings(userId, dailyReviewLimitEnabled, dailyReviewLimit)
  },
}
