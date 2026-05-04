export type AiProvider = 'ollama' | 'omlx' | 'deepseek';

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
