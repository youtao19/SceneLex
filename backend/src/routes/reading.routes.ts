import { Router } from 'express'
import {
  deleteReadingArticle,
  listReadingArticles,
  lookupReadingWord,
  saveReadingArticle,
  translateReadingSentence
} from '../controllers/reading.controller'

const router = Router()

router.get('/articles', listReadingArticles)
router.post('/articles', saveReadingArticle)
router.delete('/articles/:articleId', deleteReadingArticle)
router.post('/word', lookupReadingWord)
router.post('/sentence', translateReadingSentence)

export default router
