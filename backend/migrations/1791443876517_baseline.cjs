/**
 * 基线迁移：把 backend/src/config/database.ts 里 initializeDatabase() 累积出来的
 * 全部 DDL 固化成版本 1，之后所有 schema 变更都新增迁移文件，不再改这个文件。
 *
 * 这里刻意保留 IF NOT EXISTS：线上库和本地库已经存在这些表，基线必须对它们
 * no-op 才能安全地把 pgmigrations 表建起来，否则服务启动会直接失败。
 *
 * 对应的 sql 全部是从 database.ts 原样搬过来的，保证新库与老库 schema 一致。
 */

const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_vip BOOLEAN NOT NULL DEFAULT FALSE,
      access_status TEXT NOT NULL DEFAULT 'active',
      access_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active'`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS access_keys (
      id BIGSERIAL PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      granted_days INTEGER NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      bound_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_access_keys_status
    ON access_keys (status)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash
    ON user_sessions (token_hash)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
    ON user_sessions (user_id)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_learning_settings (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_review_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      daily_review_limit INTEGER NOT NULL DEFAULT 20,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_learning_settings_daily_review_limit_check
        CHECK (daily_review_limit BETWEEN 1 AND 200)
    )
  `);

  pgm.sql(`
    ALTER TABLE user_learning_settings
    ADD COLUMN IF NOT EXISTS daily_review_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_ai_api_keys (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider)
    )
  `);

  /**
   * omlx 曾经是可选 provider，已经下线；老库里可能还留着对应密钥行。
   * 列等会加上只允许 kimi/deepseek 的约束，所以必须先清掉违规数据。
   */
  pgm.sql(`DELETE FROM user_ai_api_keys WHERE provider = 'omlx'`);

  pgm.sql(`ALTER TABLE user_ai_api_keys DROP CONSTRAINT IF EXISTS user_ai_api_keys_provider_check`);

  pgm.sql(`
    DO $$
    BEGIN
      ALTER TABLE user_ai_api_keys
      ADD CONSTRAINT user_ai_api_keys_provider_check
      CHECK (provider IN ('kimi', 'deepseek'));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS words (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL DEFAULT '',
      primary_meaning TEXT NOT NULL,
      meanings JSONB NOT NULL,
      ease DOUBLE PRECISION NOT NULL DEFAULT 2.5,
      interval INTEGER NOT NULL DEFAULT 1,
      next_review DATE NOT NULL DEFAULT CURRENT_DATE + 1,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`ALTER TABLE words ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`);
  pgm.sql(`ALTER TABLE words ADD COLUMN IF NOT EXISTS phonetic TEXT NOT NULL DEFAULT ''`);

  /** words 早期是全局唯一（word_key），改成按用户唯一，所以旧约束要拆掉。 */
  pgm.sql(`ALTER TABLE words DROP CONSTRAINT IF EXISTS words_word_key`);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_words_user_word
    ON words (user_id, word)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_words_next_review
    ON words (next_review)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_words_user_next_review
    ON words (user_id, next_review)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS word_books (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_word_books_user_name
    ON word_books (user_id, name)
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_word_books_default
    ON word_books (user_id)
    WHERE is_default = TRUE
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS word_book_items (
      book_id BIGINT NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
      word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (book_id, word_id)
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_word_book_items_word_id
    ON word_book_items (word_id)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_word_books (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_word_book_items (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT NOT NULL REFERENCES system_word_books(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '',
      exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    ALTER TABLE system_word_book_items
    ADD COLUMN IF NOT EXISTS exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_system_word_book_items_book_word
    ON system_word_book_items (book_id, word)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_system_word_book_items_book_order
    ON system_word_book_items (book_id, order_index)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_word_card_previews (
      id BIGSERIAL PRIMARY KEY,
      book_item_id BIGINT NOT NULL UNIQUE REFERENCES system_word_book_items(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL DEFAULT '',
      meanings JSONB NOT NULL,
      content_source TEXT NOT NULL DEFAULT 'agent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_system_word_card_previews_word
    ON system_word_card_previews (word)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_word_cards (
      id BIGSERIAL PRIMARY KEY,
      word TEXT NOT NULL UNIQUE,
      phonetic TEXT NOT NULL DEFAULT '',
      meanings JSONB NOT NULL,
      content_source TEXT NOT NULL DEFAULT 'agent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      word TEXT PRIMARY KEY,
      phonetic TEXT NOT NULL DEFAULT '',
      definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
      meanings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reading_articles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_articles_user_hash
    ON reading_articles (user_id, content_hash)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_reading_articles_user_updated
    ON reading_articles (user_id, updated_at DESC)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reading_assistant_chats (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reading_article_id BIGINT REFERENCES reading_articles(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      article_content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    ALTER TABLE reading_assistant_chats
    ADD COLUMN IF NOT EXISTS reading_article_id BIGINT REFERENCES reading_articles(id) ON DELETE SET NULL
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_reading_assistant_chats_user_updated
    ON reading_assistant_chats (user_id, updated_at DESC)
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reading_assistant_messages (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL REFERENCES reading_assistant_chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_reading_assistant_messages_chat_created
    ON reading_assistant_messages (chat_id, created_at ASC, id ASC)
  `);
};

/**
 * 回滚基线等于清空整个库，只应该在一次性丢弃的测试库上执行。
 */
const down = (pgm) => {
  const tables = [
    'reading_assistant_messages',
    'reading_assistant_chats',
    'reading_articles',
    'dictionary_entries',
    'system_word_cards',
    'system_word_card_previews',
    'system_word_book_items',
    'system_word_books',
    'word_book_items',
    'word_books',
    'words',
    'user_ai_api_keys',
    'user_learning_settings',
    'user_sessions',
    'access_keys',
    'users',
  ];

  for (const table of tables) {
    pgm.sql(`DROP TABLE IF EXISTS ${table}`);
  }
};

module.exports = { up, down };
