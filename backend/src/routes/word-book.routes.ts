import { Router } from 'express';
import {
  createWordBook,
  deleteWordBook,
  getWordBook,
  listWordBooks,
  removeWordFromBook,
  renameWordBook,
} from '../controllers/word-book.controller';

const router = Router();

router.get('/', listWordBooks);
router.post('/', createWordBook);
router.get('/:bookId', getWordBook);
router.patch('/:bookId', renameWordBook);
router.delete('/:bookId', deleteWordBook);
router.delete('/:bookId/words/:wordId', removeWordFromBook);

export default router;
