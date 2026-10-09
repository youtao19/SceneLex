import { Router } from 'express';
import {
  addWord,
  completeNewWord,
  getStudyOverview,
  getTodayWords,
  listNewWords,
  reviewWord,
  rollbackReviewWord,
} from '../controllers/word.controller';

const router = Router();

router.post('/add', addWord);
router.get('/today', getTodayWords);
router.get('/overview', getStudyOverview);
router.get('/new', listNewWords);
router.post('/complete-new', completeNewWord);
router.post('/review', reviewWord);
router.post('/review/rollback', rollbackReviewWord);

export default router;
