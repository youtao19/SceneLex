import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { mapWordRow } from './word-utils.js';

// ── Helpers ──────────────────────────────────────────────────────────

function json(data, init) {
  return Response.json(data, init);
}

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function errorJson(statusCode, message) {
  return json({ code: statusCode, message, data: null }, { status: statusCode });
}

async function readJsonBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function normalizeId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `${fieldName} 非法`);
  }
  return id;
}

function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertValidName(name) {
  if (!name) throw new HttpError(400, '单词本名称不能为空');
  if (name.length > 40) throw new HttpError(400, '单词本名称不能超过 40 个字符');
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function mapWordBookRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    isDefault: row.is_default,
    wordCount: Number(row.word_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ── Default book ─────────────────────────────────────────────────────

async function ensureDefaultBook(sql, userId) {
  await sql`
    INSERT INTO word_books (user_id, name, is_default)
    SELECT ${userId}, '默认单词本', TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM word_books
      WHERE user_id = ${userId} AND is_default = TRUE
    )
  `;

  const rows = await sql`
    SELECT id FROM word_books
    WHERE user_id = ${userId} AND is_default = TRUE
    LIMIT 1
  `;

  const defaultBookId = Number(rows[0].id);

  await sql`
    INSERT INTO word_book_items (book_id, word_id)
    SELECT ${defaultBookId}, w.id
    FROM words w
    WHERE w.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM word_book_items item
        WHERE item.word_id = w.id
      )
    ON CONFLICT DO NOTHING
  `;

  return defaultBookId;
}

// ── Handlers ─────────────────────────────────────────────────────────

async function handleList(sql, userId) {
  await ensureDefaultBook(sql, userId);

  const rows = await sql`
    SELECT
      b.id, b.name, b.is_default,
      COUNT(item.word_id)::text AS word_count,
      b.created_at, b.updated_at
    FROM word_books b
    LEFT JOIN word_book_items item ON item.book_id = b.id
    WHERE b.user_id = ${userId}
    GROUP BY b.id
    ORDER BY b.is_default DESC, b.updated_at DESC, b.name ASC
  `;

  return json(ok(rows.map(mapWordBookRow), 'Word books fetched'));
}

async function handleCreate(sql, userId, body) {
  const name = normalizeName(body.name);
  assertValidName(name);

  const rows = await sql`
    INSERT INTO word_books (user_id, name)
    VALUES (${userId}, ${name})
    RETURNING id, name, is_default, '0' AS word_count, created_at, updated_at
  `;

  return json(ok(mapWordBookRow(rows[0]), 'Word book created'));
}

async function handleDetail(sql, userId, bookId) {
  await ensureDefaultBook(sql, userId);

  const bookRows = await sql`
    SELECT
      b.id, b.name, b.is_default,
      COUNT(item.word_id)::text AS word_count,
      b.created_at, b.updated_at
    FROM word_books b
    LEFT JOIN word_book_items item ON item.book_id = b.id
    WHERE b.user_id = ${userId} AND b.id = ${bookId}
    GROUP BY b.id
  `;

  if (bookRows.length === 0) return errorJson(404, '单词本不存在');

  const wordRows = await sql`
    SELECT
      w.id, w.word, w.phonetic, w.primary_meaning, w.meanings,
      w.ease, w.interval, w.next_review, w.review_count,
      w.created_at, w.updated_at
    FROM word_book_items item
    INNER JOIN words w ON w.id = item.word_id
    WHERE item.book_id = ${bookId} AND w.user_id = ${userId}
    ORDER BY item.added_at DESC, w.word ASC
  `;

  return json(ok({
    ...mapWordBookRow(bookRows[0]),
    words: wordRows.map(mapWordRow),
  }, 'Word book fetched'));
}

async function handleRename(sql, userId, bookId, body) {
  const name = normalizeName(body.name);
  assertValidName(name);

  const rows = await sql`
    UPDATE word_books
    SET name = ${name}, updated_at = NOW()
    WHERE user_id = ${userId} AND id = ${bookId}
    RETURNING
      id, name, is_default,
      (SELECT COUNT(*)::text FROM word_book_items item WHERE item.book_id = word_books.id) AS word_count,
      created_at, updated_at
  `;

  if (rows.length === 0) return errorJson(404, '单词本不存在');

  return json(ok(mapWordBookRow(rows[0]), 'Word book renamed'));
}

async function handleDelete(sql, userId, bookId) {
  const existing = await sql`
    SELECT is_default FROM word_books
    WHERE user_id = ${userId} AND id = ${bookId}
  `;

  if (existing.length === 0) return errorJson(404, '单词本不存在');
  if (existing[0].is_default) return errorJson(400, '默认单词本不能删除');

  const result = await sql`
    DELETE FROM word_books
    WHERE user_id = ${userId} AND id = ${bookId} AND is_default = FALSE
    RETURNING id
  `;

  if (result.length === 0) return errorJson(404, '单词本不存在');

  return json(ok(null, 'Word book deleted'));
}

async function handleRemoveWord(sql, userId, bookId, wordId) {
  const result = await sql`
    DELETE FROM word_book_items item
    USING word_books b, words w
    WHERE item.book_id = b.id
      AND item.word_id = w.id
      AND b.user_id = ${userId}
      AND w.user_id = ${userId}
      AND item.book_id = ${bookId}
      AND item.word_id = ${wordId}
    RETURNING item.word_id
  `;

  if (result.length === 0) return errorJson(404, '单词或单词本不存在');

  return json(ok(null, 'Word removed from book'));
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleWordBooks(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const sql = getSql(env);
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/word-books', '').replace(/\/$/, '');
    const method = request.method;

    // GET / or POST /
    if (path === '') {
      if (method === 'GET') return handleList(sql, user.id);
      if (method === 'POST') return handleCreate(sql, user.id, await readJsonBody(request));
    }

    // /:bookId
    const bookMatch = path.match(/^\/(\d+)$/);
    if (bookMatch) {
      const bookId = Number(bookMatch[1]);
      if (method === 'GET') return handleDetail(sql, user.id, bookId);
      if (method === 'PATCH') return handleRename(sql, user.id, bookId, await readJsonBody(request));
      if (method === 'DELETE') return handleDelete(sql, user.id, bookId);
    }

    // /:bookId/words/:wordId
    const wordMatch = path.match(/^\/(\d+)\/words\/(\d+)$/);
    if (wordMatch && method === 'DELETE') {
      return handleRemoveWord(sql, user.id, Number(wordMatch[1]), Number(wordMatch[2]));
    }

    return errorJson(404, '路由不存在');
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) return errorJson(error.statusCode, error.message);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    return errorJson(500, error.message || '操作失败');
  }
}
