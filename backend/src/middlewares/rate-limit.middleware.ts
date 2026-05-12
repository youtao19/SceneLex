import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import type { AuthenticatedRequest } from '../types/auth';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  prefix: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

/**
 * 登录前按 IP 限制，登录后按用户限制，避免多人共用出口时互相影响太大。
 */
function readClientKey(req: Request) {
  const authUser = (req as AuthenticatedRequest).authUser;

  if (authUser) {
    return `user:${authUser.id}`;
  }

  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

/**
 * 过期桶只做抽样清理，避免每个请求都遍历全表。
 */
function cleanupExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * 简单内存限流足够保护单进程部署；多实例时应换成 Redis 等共享存储。
 */
function createRateLimit(options: RateLimitOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.prefix}:${readClientKey(req)}`;
    const bucket = buckets.get(key);

    if (Math.random() < 0.01) {
      cleanupExpiredBuckets(now);
    }

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > options.max) {
      next(new HttpError(429, '请求太频繁，请稍后再试'));
      return;
    }

    next();
  };
}

export const authRateLimit = createRateLimit({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const modelRateLimit = createRateLimit({
  prefix: 'model',
  windowMs: 60 * 1000,
  max: 20,
});
