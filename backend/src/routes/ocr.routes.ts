import { Router } from 'express';
import { recognizeArticleText } from '../controllers/ocr.controller';
import { uploadOcrImageMiddleware } from '../middlewares/upload.middleware';
import ocrBatchRoutes from './ocr-batch.routes';

const router = Router();

/**
 * 单图接口保持原样，网页还在用；移动端走 /batches 的批次流程。
 */
router.post('/', uploadOcrImageMiddleware.single('image'), recognizeArticleText);

router.use('/batches', ocrBatchRoutes);

export default router;
