import { query } from '../config/database';

/**
 * 导出走一套自己的查询，而不是复用各页面的 repository。
 *
 * 页面查询是为展示裁剪过的——归档页只给日期部分、词书接口不带 id、消息接口只取
 * 当前会话。导出要的是「这个人在这里存过什么」，所以这里按表直取，列名和数据库
 * 一一对应，日后再加字段也不会悄悄从导出里消失。
 *
 * 只有两类列被排除，理由都写在下面各自的查询里：能直接拿去登录的东西
 * （会话 token、口令哈希），以及离开这台服务器就没用的密文（端点 API Key）。
 */

interface Row {
  [column: string]: unknown;
}

export interface UserExportRows {
  profile: Row[];
  words: Row[];
  wordBooks: Row[];
  wordBookItems: Row[];
  readingArticles: Row[];
  assistantChats: Row[];
  assistantMessages: Row[];
  learningSettings: Row[];
  endpoints: Row[];
  ocrBatches: Row[];
  ocrPages: Row[];
}

/**
 * 各表查询互不依赖，并发发出；导出是低频操作，多几条连接不会给线上带来压力。
 */
export async function collectUserExportRows(userId: number): Promise<UserExportRows> {
  const [
    profile,
    words,
    wordBooks,
    wordBookItems,
    readingArticles,
    assistantChats,
    assistantMessages,
    learningSettings,
    endpoints,
    ocrBatches,
    ocrPages,
  ] = await Promise.all([
    query<Row>(
      `
        SELECT
          id, email, nickname, avatar_url, role, is_vip,
          access_status, access_expires_at, created_at, updated_at
        FROM users
        WHERE id = $1
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT
          id, word, phonetic, primary_meaning, meanings, ease, interval,
          next_review, review_count, study_version, first_learned_at,
          created_at, updated_at
        FROM words
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT id, name, is_default, created_at, updated_at
        FROM word_books
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    // 词书条目没有 user_id，靠 book_id 归属到人；JOIN 同时挡住越权取到别人的词书。
    query<Row>(
      `
        SELECT i.book_id, i.word_id, i.added_at
        FROM word_book_items i
        INNER JOIN word_books b ON b.id = i.book_id
        WHERE b.user_id = $1
        ORDER BY i.book_id, i.word_id
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT id, title, content, char_count, created_at, updated_at
        FROM reading_articles
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    // content_hash 是去重用的内部指纹，对用户没有意义，不带出去。
    query<Row>(
      `
        SELECT id, reading_article_id, title, article_content, created_at, updated_at
        FROM reading_assistant_chats
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT m.chat_id, m.role, m.content, m.created_at
        FROM reading_assistant_messages m
        INNER JOIN reading_assistant_chats c ON c.id = m.chat_id
        WHERE c.user_id = $1
        ORDER BY m.chat_id, m.id
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT
          user_id, daily_review_limit_enabled, daily_review_limit,
          daily_new_word_target, current_system_book_id, updated_at
        FROM user_learning_settings
        WHERE user_id = $1
      `,
      [userId],
    ),

    // api_key_ciphertext 用服务端密钥加密，原样导出用户也解不开，反而多一份密钥副本在外漂。
    // 只给"配没配"，用户凭这个知道自己要重新填哪些端点。
    query<Row>(
      `
        SELECT
          id, label, base_url, model, vision_model, is_default,
          (api_key_ciphertext IS NOT NULL AND api_key_ciphertext <> '') AS has_api_key,
          created_at, updated_at
        FROM user_ai_endpoints
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    query<Row>(
      `
        SELECT id, operation_id, status, article_id, created_at, expires_at
        FROM ocr_batches
        WHERE user_id = $1
        ORDER BY id
      `,
      [userId],
    ),

    // stored_path 是这台机器上的临时文件路径，导出后指向一个不存在的地方，去掉。
    query<Row>(
      `
        SELECT p.id, p.batch_id, p.page_index, p.status, p.text, p.error,
               p.byte_size, p.created_at, p.updated_at
        FROM ocr_pages p
        INNER JOIN ocr_batches b ON b.id = p.batch_id
        WHERE b.user_id = $1
        ORDER BY p.batch_id, p.page_index
      `,
      [userId],
    ),
  ]);

  return {
    profile: profile.rows,
    words: words.rows,
    wordBooks: wordBooks.rows,
    wordBookItems: wordBookItems.rows,
    readingArticles: readingArticles.rows,
    assistantChats: assistantChats.rows,
    assistantMessages: assistantMessages.rows,
    learningSettings: learningSettings.rows,
    endpoints: endpoints.rows,
    ocrBatches: ocrBatches.rows,
    ocrPages: ocrPages.rows,
  };
}
