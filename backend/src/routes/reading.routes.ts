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

const router = Router()

router.get('/articles', listReadingArticles)
router.post('/articles', saveReadingArticle)
router.delete('/articles/:articleId', deleteReadingArticle)
router.patch('/articles/:articleId/title', updateReadingArticleTitle)
router.get('/assistant-chats', listAssistantChats)
router.post('/assistant-chats', createAssistantChat)
router.get('/assistant-chats/:chatId/messages', listAssistantMessages)
router.post('/assistant-chats/:chatId/messages', sendAssistantMessage)
router.post('/assistant-chats/:chatId/messages/stream', streamAssistantMessage)
router.post('/word', lookupReadingWord)
router.post('/sentence', translateReadingSentence)
router.post('/chat', chatWithAssistant)

export default router
