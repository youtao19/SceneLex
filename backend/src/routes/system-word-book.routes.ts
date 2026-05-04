import { Router } from 'express';
import {
  getSystemWordBook,
  listSystemWordBooks,
} from '../controllers/system-word-book.controller';

const router = Router();

router.get('/', listSystemWordBooks);
router.get('/:bookId', getSystemWordBook);

export default router;
