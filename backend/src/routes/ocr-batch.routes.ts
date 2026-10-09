import { Router } from 'express';
import {
  cancelOcrBatch,
  createOcrBatch,
  getOcrBatch,
  retryOcrPage,
  saveOcrArticle,
  skipOcrPage,
  uploadOcrPage,
} from '../controllers/ocr-batch.controller';
import { uploadOcrPageMiddleware } from '../middlewares/upload.middleware';

const router = Router();

router.post('/', createOcrBatch);
router.get('/:batchId', getOcrBatch);
router.delete('/:batchId', cancelOcrBatch);

/**
 * 页身份由用户确认的 pageIndex 决定，所以路径里带页序而不是上传顺序。
 */
router.post(
  '/:batchId/pages/:pageIndex',
  uploadOcrPageMiddleware.single('image'),
  uploadOcrPage,
);
router.post('/:batchId/pages/:pageIndex/retry', retryOcrPage);
router.post('/:batchId/pages/:pageIndex/skip', skipOcrPage);
router.post('/:batchId/article', saveOcrArticle);

export default router;
