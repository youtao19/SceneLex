export type AiProvider = 'ollama' | 'kimi' | 'deepseek';
export type UserApiKeyProvider = 'kimi' | 'deepseek';

export interface AiProviderSettings {
  id: AiProvider;
  name: string;
  model: string;
  baseURL: string;
  timeout: number;
  hasApiKey: boolean;
}

export interface AiSettings {
  provider: AiProvider;
  providers: AiProviderSettings[];
}

export interface UpdateAiSettingsPayload {
  provider: AiProvider;
  model: string;
}

export interface UserApiKeyProviderSettings {
  id: UserApiKeyProvider;
  name: string;
  hasUserApiKey: boolean;
  hasServerApiKey: boolean;
}

export interface UserApiKeySettings {
  activeProvider: AiProvider;
  providers: UserApiKeyProviderSettings[];
}

export interface UpdateUserApiKeyPayload {
  provider: UserApiKeyProvider;
  apiKey: string;
}

export interface LearningSettings {
  dailyReviewLimitEnabled: boolean;
  dailyReviewLimit: number;
}

export interface UpdateLearningSettingsPayload {
  dailyReviewLimitEnabled: boolean;
  dailyReviewLimit: number;
}
