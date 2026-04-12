import type { Request, Response, NextFunction } from 'express';
import { detectWordFromImage } from '../services/ocr.service';
import { ok } from '../utils/response';

export async function recognizeWord(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const text = await detectWordFromImage(req.body.fileName ?? '');
    res.json(ok({ text }, 'OCR completed'));
  } catch (error) {
    next(error);
  }
}

