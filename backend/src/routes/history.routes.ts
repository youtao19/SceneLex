import { Router } from 'express';
import { getHistoryList } from '../controllers/history.controller';

const router = Router();

router.get('/', getHistoryList);

export default router;

