import { Router } from 'express'
import {
  deleteReadingArticle,
  listReadingArticles,
  lookupReadingWord,
  saveReadingArticle,
  translateReadingSentence,
  updateReadingArticleTitle,
  chatWithAssistant
} from '../controllers/reading.controller'

const router = Router()

router.get('/articles', listReadingArticles)
router.post('/articles', saveReadingArticle)
router.delete('/articles/:articleId', deleteReadingArticle)
router.patch('/articles/:articleId/title', updateReadingArticleTitle)
router.post('/word', lookupReadingWord)
router.post('/sentence', translateReadingSentence)
router.post('/chat', chatWithAssistant)

export default router
