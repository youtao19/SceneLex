import type { Request, Response, NextFunction } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { endpointService } from '../services/endpoint.service';
import { ocrBatchService } from '../services/ocr-batch.service';
import { ok } from '../utils/response';

/**
 * 开一个识别批次：客户端带操作 ID，重试不会开出第二个批次。
 */
export async function createOcrBatch(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const result = await ocrBatchService.createBatch(
      authUser.id,
      (req.body as { operationId?: unknown }).operationId,
    );

    return res.json(ok(result, 'OCR batch created'));
  } catch (error) {
    next(error);
  }
}

/**
 * 查批次状态：断线重连后客户端靠它看已保存的结果，而不是重新识别。
 */
export async function getOcrBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    const result = await ocrBatchService.getBatch(authUser.id, req.params.batchId);

    return res.json(ok(result, 'OCR batch fetched'));
  } catch (error) {
    next(error);
  }
}

/**
 * 逐页上传并识别。移动端只走多模态模型，所以这里固定解析视觉端点。
 */
export async function uploadOcrPage(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    const visionEndpoint = await endpointService.resolveVisionEndpointForUser(authUser);
    const result = await ocrBatchService.recognizePage(
      authUser.id,
      req.params.batchId,
      req.params.pageIndex,
      req.file,
      visionEndpoint,
    );

    return res.json(ok(result, 'OCR page recognized'));
  } catch (error) {
    next(error);
  }
}

/**
 * 只重试失败页，已成功的页不再调用模型。
 */
export async function retryOcrPage(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    const visionEndpoint = await endpointService.resolveVisionEndpointForUser(authUser);
    const result = await ocrBatchService.retryPage(
      authUser.id,
      req.params.batchId,
      req.params.pageIndex,
      visionEndpoint,
    );

    return res.json(ok(result, 'OCR page retried'));
  } catch (error) {
    next(error);
  }
}

/**
 * 明确跳过某一页：跳过后按剩余页序合并，不静默丢页。
 */
export async function skipOcrPage(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    const result = await ocrBatchService.skipPage(
      authUser.id,
      req.params.batchId,
      req.params.pageIndex,
    );

    return res.json(ok(result, 'OCR page skipped'));
  } catch (error) {
    next(error);
  }
}

/**
 * 保存文章：成功后删除本批原图，重试保存返回同一篇。
 */
export async function saveOcrArticle(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    const result = await ocrBatchService.saveArticle(
      authUser.id,
      req.params.batchId,
      (req.body as { title?: unknown }).title,
    );

    return res.json(ok(result, 'OCR article saved'));
  } catch (error) {
    next(error);
  }
}

/**
 * 用户主动放弃：立刻删原图，不等 24 小时。
 */
export async function cancelOcrBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req);
    await ocrBatchService.cancelBatch(authUser.id, req.params.batchId);

    return res.json(ok(null, 'OCR batch cancelled'));
  } catch (error) {
    next(error);
  }
}
