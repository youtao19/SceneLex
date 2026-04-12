import { Router } from 'express';
import { addWord, getTodayWords, reviewWord } from '../controllers/word.controller';

const router = Router();

router.post('/add', addWord);
router.get('/today', getTodayWords);
router.post('/review', reviewWord);

export default router;
