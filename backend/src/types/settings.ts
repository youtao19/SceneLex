export interface LearningSettings {
  dailyReviewLimitEnabled: boolean
  dailyReviewLimit: number
  /** 每日新词目标，0 表示只复习；与复习数量限制是两个独立设置。 */
  dailyNewWordTarget: number
  /** 当前学习的系统词书；未选择时为 null，不默认帮用户选一本。 */
  currentSystemBookId: number | null
}

export type UserApiKeyProvider = 'kimi' | 'deepseek'

export interface UserApiKeyProviderSettings {
  id: UserApiKeyProvider
  name: string
  hasUserApiKey: boolean
  hasServerApiKey: boolean
}

export interface UserApiKeySettings {
  activeProvider: string
  providers: UserApiKeyProviderSettings[]
}
