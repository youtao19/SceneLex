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
/**
 * 本进程前面有几层代理。默认 2 = Cloudflare → Nginx，即本项目的线上链路。
 *
 * 这个数字决定 req.ip 从 X-Forwarded-For 的右端往回数几跳：
 * 数少了（比如 0）所有人共用 Cloudflare 出口 IP，按 IP 计数的登录限流会退化成
 * 几个大桶；数多了会把攻击者自己伪造的那部分头部当成真实客户端，限流形同虚设。
 *
 * 数几跳的前提是进程只能经由这些代理访问到。源站若可直连，攻击者绕过
 * Cloudflare 直接打过来就能随便编 X-Forwarded-For，所以防火墙要只放行
 * Cloudflare 的出口网段 —— 这条在代码里保证不了，见 README。
 *
 * 写成可配是因为部署形态会不同：不套 Cloudflare 的部署应该设 1。
 */
export function readTrustProxyHops(value: string | undefined) {
  const text = (value ?? '').trim();

  // 用 Number 而不是 parseInt：parseInt('1.5') 会悄悄截断成 1，
  // 而 '1.5' 显然是写错了，应该回落到默认值让人发现。
  const parsed = Number(text);

  // 0 是合法值（不信任任何代理），所以只排除负数和非整数。
  if (!text || !Number.isInteger(parsed) || parsed < 0) {
    return 2;
  }

  return parsed;
}

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
  trustProxyHops: readTrustProxyHops(process.env.TRUST_PROXY_HOPS),
  modelRateLimitMax: Number(process.env.MODEL_RATE_LIMIT_MAX ?? 10),
  modelGlobalConcurrency: Number(process.env.MODEL_GLOBAL_CONCURRENCY ?? 3),
  modelUserConcurrency: Number(process.env.MODEL_USER_CONCURRENCY ?? 1),
  modelQueueTimeoutMs: Number(process.env.MODEL_QUEUE_TIMEOUT_MS ?? 30_000),
  r2AvatarPublicBaseUrl: process.env.R2_AVATAR_PUBLIC_BASE_URL ?? '',
  r2AvatarUploadUrl: process.env.R2_AVATAR_UPLOAD_URL ?? '',
  r2AvatarUploadToken: process.env.R2_AVATAR_UPLOAD_TOKEN ?? '',
};
