import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { wordBookService } from '../services/word-book.service';
import { ok } from '../utils/response';

export async function listWordBooks(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await wordBookService.list(authUser.id);

    return res.json(ok(result, 'Word books fetched'));
  } catch (error) {
    next(error);
  }
}

export async function getWordBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await wordBookService.detail(authUser.id, req.params.bookId);

    return res.json(ok(result, 'Word book fetched'));
  } catch (error) {
    next(error);
  }
}

export async function createWordBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const body = req.body as { name?: string };
    const result = await wordBookService.create(authUser.id, body.name);

    return res.json(ok(result, 'Word book created'));
  } catch (error) {
    next(error);
  }
}

export async function renameWordBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const body = req.body as { name?: string };
    const result = await wordBookService.rename(authUser.id, req.params.bookId, body.name);

    return res.json(ok(result, 'Word book renamed'));
  } catch (error) {
    next(error);
  }
}

export async function deleteWordBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await wordBookService.remove(authUser.id, req.params.bookId);

    return res.json(ok(result, 'Word book deleted'));
  } catch (error) {
    next(error);
  }
}

export async function removeWordFromBook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await wordBookService.removeWord(
      authUser.id,
      req.params.bookId,
      req.params.wordId,
    );

    return res.json(ok(result, 'Word removed from book'));
  } catch (error) {
    next(error);
  }
}
