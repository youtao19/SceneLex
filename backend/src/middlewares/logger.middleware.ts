import type { NextFunction, Request, Response } from 'express';

export function loggerMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  console.log(`[${req.method}] ${req.path}`);
  next();
}

