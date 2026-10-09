import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/http-error';

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  /**
   * multer 的超限错误不带 statusCode，不管的话会变成 500，
   * 客户端就分不清“图太大”和“服务器挂了”。
   */
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? '图片超过允许的大小限制'
      : '上传的文件不符合要求';

    res.status(400).json({ code: 400, message, data: null });
    return;
  }

  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Unknown error';

  res.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
  });
}
