import type { Request, Response, NextFunction } from 'express';
import { extractArticleTextFromImage } from '../services/ocr.service';
import { endpointService } from '../services/endpoint.service';
import { readAuthUser } from '../middlewares/auth.middleware';
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
    const authUser = readAuthUser(req);
    // 只有选 vision 时才需要端点，tesseract 和 paddle 都在本地跑。
    const visionEndpoint = req.body.method === 'vision'
      ? await endpointService.resolveVisionEndpointForUser(authUser)
      : null;
    const text = await extractArticleTextFromImage(
      authUser.id,
      req.file,
      req.body.method,
      visionEndpoint,
    );
    res.json(ok({ text }, 'Article OCR completed'));
  } catch (error) {
    next(error);
  }
}
