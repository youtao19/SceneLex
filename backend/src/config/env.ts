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

/**
 * 生产环境的配置错误必须在启动时就炸掉，不能等第一个请求进来才发现。
 * 缺 USER_API_KEY_SECRET 尤其危险：加密函数会退化成仓库里公开的兜底字符串，
 * 等于所有用户的模型 Key 都用一个公开常量加密，而且从外面完全看不出来。
 *
 * 写成接收参数的纯函数而不是直接读 env，是为了能在测试里构造各种取值。
 */
export function assertProductionConfig(config: {
  nodeEnv: string;
  userApiKeySecret: string;
}) {
  if (config.nodeEnv !== 'production') {
    return;
  }

  if (!config.userApiKeySecret) {
    throw new Error(
      [
        'USER_API_KEY_SECRET 未配置，拒绝启动。',
        '它用于加密用户保存的模型 API Key；缺失时会退化成仓库里公开的兜底值。',
        '',
        '在 ecosystem.config.cjs 的 env 块里加一行 USER_API_KEY_SECRET（够长的随机串），然后：',
        '  pm2 restart ecosystem.config.cjs --only scenelex --update-env',
        '',
        '注意：一旦有用户保存过端点就不能再改这个值，改了旧密文全部解不开。',
      ].join('\n'),
    );
  }
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
