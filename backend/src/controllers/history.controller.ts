import type { Request, Response, NextFunction } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { getHistory } from '../services/history.service';
import { ok } from '../utils/response';

export async function getHistoryList(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    res.json(ok(await getHistory(authUser.id), 'History fetched'));
  } catch (error) {
    next(error);
  }
}
