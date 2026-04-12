import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Unknown error';

  res.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
  });
}
