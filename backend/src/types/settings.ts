export interface LearningSettings {
  dailyReviewLimitEnabled: boolean
  dailyReviewLimit: number
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
