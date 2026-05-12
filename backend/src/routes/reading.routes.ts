import { Router } from 'express'
import {
  createAssistantChat,
  listAssistantChats,
  listAssistantMessages,
  sendAssistantMessage,
  streamAssistantMessage
} from '../controllers/reading-assistant.controller'
import {
  deleteReadingArticle,
  listReadingArticles,
  lookupReadingWord,
  saveReadingArticle,
  translateReadingSentence,
  updateReadingArticleTitle,
  chatWithAssistant
} from '../controllers/reading.controller'
import { modelConcurrencyLimit, modelRateLimit } from '../middlewares/rate-limit.middleware'

const router = Router()

router.get('/articles', listReadingArticles)
router.post('/articles', saveReadingArticle)
router.delete('/articles/:articleId', deleteReadingArticle)
router.patch('/articles/:articleId/title', updateReadingArticleTitle)
router.get('/assistant-chats', listAssistantChats)
router.post('/assistant-chats', createAssistantChat)
router.get('/assistant-chats/:chatId/messages', listAssistantMessages)
router.post('/assistant-chats/:chatId/messages', modelRateLimit, modelConcurrencyLimit, sendAssistantMessage)
router.post('/assistant-chats/:chatId/messages/stream', modelRateLimit, modelConcurrencyLimit, streamAssistantMessage)
router.post('/word', modelRateLimit, modelConcurrencyLimit, lookupReadingWord)
router.post('/sentence', modelRateLimit, modelConcurrencyLimit, translateReadingSentence)
router.post('/chat', modelRateLimit, modelConcurrencyLimit, chatWithAssistant)

export default router
