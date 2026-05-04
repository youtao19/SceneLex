import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { systemWordBookService } from '../services/system-word-book.service';
import { ok } from '../utils/response';

export async function listSystemWordBooks(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await systemWordBookService.list(authUser.id);

    return res.json(ok(result, 'System word books fetched'));
  } catch (error) {
    next(error);
  }
}

export async function getSystemWordBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await systemWordBookService.detail(
      authUser.id,
      req.params.bookId,
      req.query.limit,
      req.query.offset,
    );

    return res.json(ok(result, 'System word book fetched'));
  } catch (error) {
    next(error);
  }
}
