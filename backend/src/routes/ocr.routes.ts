import { Router } from 'express';
import { recognizeWord } from '../controllers/ocr.controller';

const router = Router();

router.post('/', recognizeWord);

export default router;

