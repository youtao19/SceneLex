import type { NextFunction, Request, Response } from 'express';

/**
 * 本地数据库查询都是亚毫秒级，单个请求超过 1 秒基本不是数据库的问题；
 * 单独打标才能在日志里一眼看出"慢"发生在哪个接口上。
 */
const SLOW_REQUEST_MS = 1000;

/**
 * 记录每个请求的状态码和耗时，慢请求额外标注。
 * 耗时在响应结束时才算得出，所以不能像原来那样在进入中间件时就打印。
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = `[${req.method}] ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`;

    if (durationMs >= SLOW_REQUEST_MS) {
      console.warn(`[slow] ${entry}`);
      return;
    }

    console.log(entry);
  });

  next();
}
