import { Router } from 'express';
import { recognizeArticleText } from '../controllers/ocr.controller';
import { uploadOcrImageMiddleware } from '../middlewares/upload.middleware';

const router = Router();

router.post('/', uploadOcrImageMiddleware.single('image'), recognizeArticleText);

export default router;
