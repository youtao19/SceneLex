import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.resolve(__dirname, '../../.env.dev.local'),
  });
}

/**
 * 启动时是否自动迁移。默认开启：线上没有显式配置这个变量，
 * 所以必须是「显式 false 才关闭」，否则默认值一旦被改反，线上会静默地永远不再执行迁移。
 * 本地开发连线上库时需要设成 false，避免把本地未发布的迁移直接应用到线上。
 */
export function readMigrateOnStartup(value: string | undefined) {
  return value !== 'false';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3003),
  databaseUrl: process.env.DATABASE_URL ?? '',
  migrateOnStartup: readMigrateOnStartup(process.env.MIGRATE_ON_STARTUP),
  dictionaryJsonPath: process.env.DICTIONARY_JSON_PATH ?? '',
  userApiKeySecret: process.env.USER_API_KEY_SECRET ?? '',
  corsOrigins: process.env.CORS_ORIGINS ?? process.env.APP_ORIGIN ?? '',
  modelRateLimitMax: Number(process.env.MODEL_RATE_LIMIT_MAX ?? 10),
  modelGlobalConcurrency: Number(process.env.MODEL_GLOBAL_CONCURRENCY ?? 3),
  modelUserConcurrency: Number(process.env.MODEL_USER_CONCURRENCY ?? 1),
  modelQueueTimeoutMs: Number(process.env.MODEL_QUEUE_TIMEOUT_MS ?? 30_000),
  r2AvatarPublicBaseUrl: process.env.R2_AVATAR_PUBLIC_BASE_URL ?? '',
  r2AvatarUploadUrl: process.env.R2_AVATAR_UPLOAD_URL ?? '',
  r2AvatarUploadToken: process.env.R2_AVATAR_UPLOAD_TOKEN ?? '',
};
