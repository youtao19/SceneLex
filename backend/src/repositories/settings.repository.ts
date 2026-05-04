import { query } from '../config/database'
import type { LearningSettings } from '../types/settings'

interface LearningSettingsRow {
  daily_review_limit_enabled: boolean
  daily_review_limit: string
}

const defaultLearningSettings: LearningSettings = {
  dailyReviewLimitEnabled: false,
  dailyReviewLimit: 20
}

function mapLearningSettings(row: LearningSettingsRow): LearningSettings {
  return {
    dailyReviewLimitEnabled: row.daily_review_limit_enabled,
    dailyReviewLimit: Number(row.daily_review_limit)
  }
}

/**
 * 首次进入设置页时自动补一行，后续复习队列就能稳定读取用户偏好。
 */
export async function getLearningSettings(userId: number): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING daily_review_limit_enabled, daily_review_limit
    `,
    [userId],
  )

  if (result.rowCount === 0) {
    return defaultLearningSettings
  }

  return mapLearningSettings(result.rows[0])
}

/**
 * 只保存用户可调的学习节奏字段，避免设置页影响 SRS 算法本身。
 */
export async function saveLearningSettings(
  userId: number,
  dailyReviewLimitEnabled: boolean,
  dailyReviewLimit: number,
): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (
        user_id,
        daily_review_limit_enabled,
        daily_review_limit,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        daily_review_limit_enabled = EXCLUDED.daily_review_limit_enabled,
        daily_review_limit = EXCLUDED.daily_review_limit,
        updated_at = NOW()
      RETURNING daily_review_limit_enabled, daily_review_limit
    `,
    [userId, dailyReviewLimitEnabled, dailyReviewLimit],
  )

  return mapLearningSettings(result.rows[0])
}
