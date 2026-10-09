import { query } from '../config/database'
import type { LearningSettings } from '../types/settings'

interface LearningSettingsRow {
  daily_review_limit_enabled: boolean
  daily_review_limit: string
  daily_new_word_target: string
  current_system_book_id: string | null
}

const defaultLearningSettings: LearningSettings = {
  dailyReviewLimitEnabled: false,
  dailyReviewLimit: 20,
  dailyNewWordTarget: 20,
  currentSystemBookId: null
}

function mapLearningSettings(row: LearningSettingsRow): LearningSettings {
  return {
    dailyReviewLimitEnabled: row.daily_review_limit_enabled,
    dailyReviewLimit: Number(row.daily_review_limit),
    dailyNewWordTarget: Number(row.daily_new_word_target),
    currentSystemBookId:
      row.current_system_book_id === null ? null : Number(row.current_system_book_id)
  }
}

/**
 * 首次进入设置页时自动补一行，后续复习队列和新词计划都能稳定读取用户偏好。
 */
export async function getLearningSettings(userId: number): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING
        daily_review_limit_enabled,
        daily_review_limit,
        daily_new_word_target,
        current_system_book_id
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
 * 四个字段一起写：调用方已经读出当前值，未提交的字段保持原样。
 */
export async function saveLearningSettings(
  userId: number,
  settings: LearningSettings,
): Promise<LearningSettings> {
  const result = await query<LearningSettingsRow>(
    `
      INSERT INTO user_learning_settings (
        user_id,
        daily_review_limit_enabled,
        daily_review_limit,
        daily_new_word_target,
        current_system_book_id,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        daily_review_limit_enabled = EXCLUDED.daily_review_limit_enabled,
        daily_review_limit = EXCLUDED.daily_review_limit,
        daily_new_word_target = EXCLUDED.daily_new_word_target,
        current_system_book_id = EXCLUDED.current_system_book_id,
        updated_at = NOW()
      RETURNING
        daily_review_limit_enabled,
        daily_review_limit,
        daily_new_word_target,
        current_system_book_id
    `,
    [
      userId,
      settings.dailyReviewLimitEnabled,
      settings.dailyReviewLimit,
      settings.dailyNewWordTarget,
      settings.currentSystemBookId
    ],
  )

  return mapLearningSettings(result.rows[0])
}
