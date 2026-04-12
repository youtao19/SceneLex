import type { Request, Response, NextFunction } from 'express';
import { getHistory } from '../services/history.service';
import { ok } from '../utils/response';

export async function getHistoryList(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(ok(await getHistory(), 'History fetched'));
  } catch (error) {
    next(error);
  }
}

