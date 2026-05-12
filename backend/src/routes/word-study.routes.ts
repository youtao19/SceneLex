import { Router } from 'express';
import { addWord, getTodayWords, reviewWord, rollbackReviewWord } from '../controllers/word.controller';

const router = Router();

router.post('/add', addWord);
router.get('/today', getTodayWords);
router.post('/review', reviewWord);
router.post('/review/rollback', rollbackReviewWord);

export default router;
