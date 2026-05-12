import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import type { AuthenticatedRequest } from '../types/auth';
import { env } from '../config/env';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  prefix: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface ModelQueueItem {
  res: Response;
  next: NextFunction;
  userKey: string;
  timeout: NodeJS.Timeout;
  started: boolean;
}

const buckets = new Map<string, RateLimitBucket>();
const modelQueue: ModelQueueItem[] = [];
const activeModelRequestsByUser = new Map<string, number>();
let activeModelRequests = 0;

/**
 * 并发配置宁可回落到保守值，也不要因为环境变量写错导致保护失效。
 */
function readPositiveInteger(value: number, fallback: number) {
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

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
 * 模型并发按用户隔离，避免同一个账号连点时占满全站 DeepSeek 名额。
 */
function readModelUserKey(req: Request) {
  return readClientKey(req);
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

/**
 * 同时满足全站名额和单用户名额时，请求才真正进入模型调用。
 */
function canStartModelRequest(userKey: string) {
  const globalLimit = readPositiveInteger(env.modelGlobalConcurrency, 3);
  const userLimit = readPositiveInteger(env.modelUserConcurrency, 1);
  const userActiveCount = activeModelRequestsByUser.get(userKey) ?? 0;

  return activeModelRequests < globalLimit && userActiveCount < userLimit;
}

/**
 * 响应完成后释放名额，再从队列里补上下一批可执行请求。
 */
function releaseModelRequest(userKey: string) {
  activeModelRequests = Math.max(0, activeModelRequests - 1);

  const userActiveCount = activeModelRequestsByUser.get(userKey) ?? 0;
  if (userActiveCount <= 1) {
    activeModelRequestsByUser.delete(userKey);
  } else {
    activeModelRequestsByUser.set(userKey, userActiveCount - 1);
  }

  drainModelQueue();
}

/**
 * 队列按可执行请求扫描，避免某个用户自己的排队请求挡住其他用户。
 */
function drainModelQueue() {
  for (let index = 0; index < modelQueue.length; index += 1) {
    const item = modelQueue[index];

    if (!canStartModelRequest(item.userKey)) {
      continue;
    }

    modelQueue.splice(index, 1);
    startModelRequest(item);
    index -= 1;
  }
}

/**
 * 将请求交给后续业务路由，并把名额生命周期绑定到 HTTP 响应结束。
 */
function startModelRequest(item: ModelQueueItem) {
  item.started = true;
  clearTimeout(item.timeout);

  activeModelRequests += 1;
  activeModelRequestsByUser.set(
    item.userKey,
    (activeModelRequestsByUser.get(item.userKey) ?? 0) + 1,
  );

  let released = false;
  const releaseOnce = () => {
    if (released) {
      return;
    }

    released = true;
    releaseModelRequest(item.userKey);
  };

  item.res.once('finish', releaseOnce);
  item.res.once('close', releaseOnce);
  item.next();
}

/**
 * DeepSeek 等模型入口先排队，超过等待时间再拒绝，避免请求无限挂起。
 */
export function modelConcurrencyLimit(req: Request, res: Response, next: NextFunction) {
  const userKey = readModelUserKey(req);
  const queueTimeoutMs = readPositiveInteger(env.modelQueueTimeoutMs, 30_000);
  const item: ModelQueueItem = {
    res,
    next,
    userKey,
    started: false,
    timeout: setTimeout(() => {
      if (item.started) {
        return;
      }

      const index = modelQueue.indexOf(item);
      if (index >= 0) {
        modelQueue.splice(index, 1);
      }

      next(new HttpError(429, '当前使用人数较多，请稍后再试'));
    }, queueTimeoutMs),
  };

  if (canStartModelRequest(userKey)) {
    startModelRequest(item);
    return;
  }

  modelQueue.push(item);
}

export const authRateLimit = createRateLimit({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const modelRateLimit = createRateLimit({
  prefix: 'model',
  windowMs: 60 * 1000,
  max: readPositiveInteger(env.modelRateLimitMax, 10),
});
