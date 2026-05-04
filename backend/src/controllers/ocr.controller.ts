import type { Request, Response, NextFunction } from 'express';
import { extractArticleTextFromImage } from '../services/ocr.service';
import { ok } from '../utils/response';

/**
 * 接收阅读页上传的文章图片，并返回可直接放进 textarea 的英文原文。
 */
export async function recognizeArticleText(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const text = await extractArticleTextFromImage(req.file, req.body.method);
    res.json(ok({ text }, 'Article OCR completed'));
  } catch (error) {
    next(error);
  }
}
