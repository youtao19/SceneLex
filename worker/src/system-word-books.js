import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';

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

function mapBookRow(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    totalWords: Number(row.total_words),
    learnedWords: Number(row.learned_words),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapItemRow(row) {
  return {
    id: Number(row.id),
    bookId: Number(row.book_id),
    word: row.word,
    orderIndex: row.order_index,
    unit: row.unit,
    difficulty: row.difficulty,
    examMeanings: normalizeExamMeanings(row.exam_meanings),
    learned: row.learned,
  };
}

function normalizeExamMeanings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const partOfSpeech = typeof item.partOfSpeech === 'string' ? item.partOfSpeech : '';
      const meaning = typeof item.meaning === 'string' ? item.meaning : '';
      const priority = Number(item.priority);
      if (!partOfSpeech || !meaning || !Number.isInteger(priority)) return null;
      return { partOfSpeech, meaning, priority };
    })
    .filter(Boolean);
}

// ── Routes ───────────────────────────────────────────────────────────

async function handleList(user, env) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      b.id, b.code, b.name, b.description,
      COUNT(item.id)::text AS total_words,
      COUNT(w.id)::text AS learned_words,
      b.created_at, b.updated_at
    FROM system_word_books b
    LEFT JOIN system_word_book_items item ON item.book_id = b.id
    LEFT JOIN words w ON w.user_id = ${user.id} AND w.word = item.word
    GROUP BY b.id
    ORDER BY b.sort_order ASC, b.id ASC
  `;

  return json(ok(rows.map(mapBookRow), 'System word books fetched'));
}

async function handleDetail(user, bookId, searchParams, env) {
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  const sql = getSql(env);

  const bookRows = await sql`
    SELECT
      b.id, b.code, b.name, b.description,
      COUNT(item.id)::text AS total_words,
      COUNT(w.id)::text AS learned_words,
      b.created_at, b.updated_at
    FROM system_word_books b
    LEFT JOIN system_word_book_items item ON item.book_id = b.id
    LEFT JOIN words w ON w.user_id = ${user.id} AND w.word = item.word
    WHERE b.id = ${bookId}
    GROUP BY b.id
  `;

  if (bookRows.length === 0) {
    return errorJson(404, '系统词书不存在');
  }

  const itemRows = await sql`
    SELECT
      item.id, item.book_id, item.word, item.order_index,
      item.unit, item.difficulty, item.exam_meanings,
      (w.id IS NOT NULL) AS learned
    FROM system_word_book_items item
    LEFT JOIN words w ON w.user_id = ${user.id} AND w.word = item.word
    WHERE item.book_id = ${bookId}
    ORDER BY (w.id IS NOT NULL) ASC, item.order_index ASC, item.word ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return json(ok({
    ...mapBookRow(bookRows[0]),
    nextWords: itemRows.map(mapItemRow),
  }, 'System word book fetched'));
}

function parsePath(params) {
  // URL pattern: /api/system-word-books or /api/system-word-books/123
  const bookIdStr = params.split('/').filter(Boolean)[0];
  return bookIdStr ? Number(bookIdStr) : null;
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleSystemWordBooks(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const url = new URL(request.url);
    const path = url.pathname.replace('/api/system-word-books', '');

    if (path === '' || path === '/') {
      return handleList(user, env);
    }

    const bookId = Number(path.replace('/', ''));
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return errorJson(400, '系统词书 id 非法');
    }

    return handleDetail(user, bookId, url.searchParams, env);
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) {
      return errorJson(error.statusCode, error.message);
    }
    return errorJson(500, error.message || '获取系统词书失败');
  }
}
