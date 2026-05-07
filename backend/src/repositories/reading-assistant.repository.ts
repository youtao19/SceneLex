import { query } from '../config/database'
import type {
  ReadingAssistantChat,
  ReadingAssistantMessage,
} from '../types/reading'

interface ChatRow {
  id: string
  title: string
  article_content: string
  reading_article_id: string | null
  created_at: string | Date
  updated_at: string | Date
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string | Date
}

/**
 * 聊天列表需要带 article_content，切换历史时前端能恢复对应文章上下文。
 */
function mapChatRow(row: ChatRow): ReadingAssistantChat {
  return {
    id: Number(row.id),
    title: row.title,
    articleContent: row.article_content,
    articleId: row.reading_article_id ? Number(row.reading_article_id) : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/**
 * 消息角色只允许 user/assistant，数据库行在仓储层收敛为前端直接可渲染结构。
 */
function mapMessageRow(row: MessageRow): ReadingAssistantMessage {
  return {
    id: Number(row.id),
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function listReadingAssistantChats(userId: number) {
  const result = await query<ChatRow>(
    `
      SELECT
        id,
        title,
        article_content,
        reading_article_id,
        created_at,
        updated_at
      FROM reading_assistant_chats
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 50
    `,
    [userId],
  )

  return result.rows.map(mapChatRow)
}

export async function createReadingAssistantChat(
  userId: number,
  title: string,
  articleContent: string,
  articleId: number | null = null,
) {
  const result = await query<ChatRow>(
    `
      INSERT INTO reading_assistant_chats (
        user_id,
        reading_article_id,
        title,
        article_content
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        title,
        article_content,
        reading_article_id,
        created_at,
        updated_at
    `,
    [userId, articleId, title, articleContent],
  )

  return mapChatRow(result.rows[0])
}

export async function findReadingAssistantChat(userId: number, chatId: number) {
  const result = await query<ChatRow>(
    `
      SELECT
        id,
        title,
        article_content,
        reading_article_id,
        created_at,
        updated_at
      FROM reading_assistant_chats
      WHERE user_id = $1
        AND id = $2
    `,
    [userId, chatId],
  )

  if (result.rowCount === 0) {
    return null
  }

  return mapChatRow(result.rows[0])
}

export async function listReadingAssistantMessages(chatId: number) {
  const result = await query<MessageRow>(
    `
      SELECT
        id,
        role,
        content,
        created_at
      FROM reading_assistant_messages
      WHERE chat_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [chatId],
  )

  return result.rows.map(mapMessageRow)
}

export async function createReadingAssistantMessage(
  chatId: number,
  role: 'user' | 'assistant',
  content: string,
) {
  const result = await query<MessageRow>(
    `
      INSERT INTO reading_assistant_messages (
        chat_id,
        role,
        content
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        role,
        content,
        created_at
    `,
    [chatId, role, content],
  )

  await query(
    `
      UPDATE reading_assistant_chats
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [chatId],
  )

  return mapMessageRow(result.rows[0])
}
