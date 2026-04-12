import { Router } from 'express';
import { getReviewQueue } from '../controllers/review.controller';

const router = Router();

router.get('/', getReviewQueue);

export default router;

