import { env } from './env';

export function getAiConfig() {
  return {
    provider: env.aiProvider,
  };
}

