import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.resolve(__dirname, '../../.env.dev.local'),
  });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3003),
  aiProvider: process.env.AI_PROVIDER ?? 'ollama',
  databaseUrl: process.env.DATABASE_URL ?? '',
  dictionaryJsonPath: process.env.DICTIONARY_JSON_PATH ?? '',
  userApiKeySecret: process.env.USER_API_KEY_SECRET ?? '',
  corsOrigins: process.env.CORS_ORIGINS ?? process.env.APP_ORIGIN ?? '',
  modelRateLimitMax: Number(process.env.MODEL_RATE_LIMIT_MAX ?? 10),
  modelGlobalConcurrency: Number(process.env.MODEL_GLOBAL_CONCURRENCY ?? 3),
  modelUserConcurrency: Number(process.env.MODEL_USER_CONCURRENCY ?? 1),
  modelQueueTimeoutMs: Number(process.env.MODEL_QUEUE_TIMEOUT_MS ?? 30_000),
};
