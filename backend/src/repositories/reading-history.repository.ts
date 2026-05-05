import { createHash } from 'node:crypto'
import { query } from '../config/database'
import type { ReadingArticle } from '../types/reading-history'

interface ReadingArticleRow {
  id: string
  title: string
  content: string
  char_count: number
  created_at: string | Date
  updated_at: string | Date
}

function mapArticleRow(row: ReadingArticleRow): ReadingArticle {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    charCount: Number(row.char_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

function normalizeContent(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function buildContentHash(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function buildTitle(content: string) {
  const firstLine = content
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) ?? 'Untitled article'

  if (firstLine.length <= 80) {
    return firstLine
  }

  return `${firstLine.slice(0, 80)}...`
}

/**
 * 同一篇文章重复打开时只更新最近阅读时间，避免历史列表被刷屏。
 */
export async function upsertReadingArticle(userId: number, content: string) {
  const normalizedContent = normalizeContent(content)
  const contentHash = buildContentHash(normalizedContent)
  const title = buildTitle(normalizedContent)
  const result = await query<ReadingArticleRow>(
    `
      INSERT INTO reading_articles (
        user_id,
        title,
        content,
        content_hash,
        char_count
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, content_hash)
      DO UPDATE SET
        updated_at = NOW()
      RETURNING
        id,
        title,
        content,
        char_count,
        created_at,
        updated_at
    `,
    [userId, title, normalizedContent, contentHash, normalizedContent.length],
  )

  return mapArticleRow(result.rows[0])
}

/**
 * 阅读历史只展示当前用户最近打开的文章，正文一并返回便于直接恢复阅读。
 */
export async function listReadingArticles(userId: number, limit = 20) {
  const result = await query<ReadingArticleRow>(
    `
      SELECT
        id,
        title,
        content,
        char_count,
        created_at,
        updated_at
      FROM reading_articles
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    [userId, limit],
  )

  return result.rows.map(mapArticleRow)
}

/**
 * 删除时带上 user_id，避免用户通过猜 id 删除别人的阅读历史。
 */
export async function deleteReadingArticle(userId: number, articleId: number) {
  const result = await query<{ id: string }>(
    `
      DELETE FROM reading_articles
      WHERE user_id = $1
        AND id = $2
      RETURNING id
    `,
    [userId, articleId],
  )

  return result.rows.length > 0
}

/**
 * 更新用户自己文章的标题。
 */
export async function updateReadingArticleTitle(userId: number, articleId: number, title: string) {
  const result = await query<{ id: string }>(
    `
      UPDATE reading_articles
      SET title = $1
      WHERE user_id = $2
        AND id = $3
      RETURNING id
    `,
    [title.trim(), userId, articleId],
  )

  return result.rows.length > 0
}
