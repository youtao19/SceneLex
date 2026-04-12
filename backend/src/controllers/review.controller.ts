import type { Request, Response, NextFunction } from 'express';
import { getReviewItems } from '../services/review.service';
import { ok } from '../utils/response';

export async function getReviewQueue(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(ok(await getReviewItems(), 'Review queue fetched'));
  } catch (error) {
    next(error);
  }
}

