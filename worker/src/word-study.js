import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { mapWordRow, buildPrimaryMeaning } from './word-utils.js';

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

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}

function readMeaningItems(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') continue;

    const data = item;
    const partOfSpeech = typeof data.partOfSpeech === 'string' ? data.partOfSpeech.trim() : '';
    const meaning = typeof data.meaning === 'string' ? data.meaning.trim() : '';
    const sceneTitle = typeof data.sceneTitle === 'string' ? data.sceneTitle.trim() : meaning;
    const examples = readStringList(data.examples);
    const example = typeof data.example === 'string' ? data.example.trim() : '';
    const finalExamples = examples.length > 0 ? examples : [example].filter(Boolean);
    const explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
    const imageQueries = readStringList(data.imageQueries);
    const tip = typeof data.tip === 'string' ? data.tip.trim() : '';

    if (!partOfSpeech || !meaning || finalExamples.length === 0 || !tip) continue;

    result.push({ partOfSpeech, meaning, sceneTitle, examples: finalExamples, explanation: explanation || tip, imageQueries, example: example || finalExamples[0], tip });
  }
  return result;
}

function readStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim());
}

// ── Anki SM-2 scheduling ─────────────────────────────────────────────

const MIN_ANKI_EASE = 1.3;
const DEFAULT_ANKI_EASE = 2.5;
const ANKI_HARD_INTERVAL = 1.2;
const ANKI_EASY_BONUS = 1.3;
const ANKI_INTERVAL_MODIFIER = 1;
const ANKI_MAX_INTERVAL = 36500;

function clampAnkiEase(ease) {
  return Math.max(MIN_ANKI_EASE, Number(ease.toFixed(2)));
}

function clampAnkiInterval(interval) {
  return Math.min(ANKI_MAX_INTERVAL, Math.max(1, interval));
}

function growAnkiInterval(currentInterval, nextInterval) {
  const rounded = Math.round(nextInterval * ANKI_INTERVAL_MODIFIER);
  return clampAnkiInterval(Math.max(currentInterval + 1, rounded));
}

function getNextAnkiSchedule(word, rating) {
  const currentInterval = Math.max(1, word.interval);
  const currentEase = word.ease > 0 ? word.ease : DEFAULT_ANKI_EASE;

  if (rating === 'again') {
    return { interval: 1, ease: clampAnkiEase(currentEase - 0.2) };
  }

  if (rating === 'hard') {
    return {
      interval: growAnkiInterval(currentInterval, currentInterval * ANKI_HARD_INTERVAL),
      ease: clampAnkiEase(currentEase - 0.15),
    };
  }

  const goodInterval = word.reviewCount === 0 ? 1 : currentInterval * currentEase;

  if (rating === 'easy') {
    return {
      interval: growAnkiInterval(currentInterval, goodInterval * ANKI_EASY_BONUS),
      ease: clampAnkiEase(currentEase + 0.2),
    };
  }

  return {
    interval: growAnkiInterval(currentInterval, goodInterval),
    ease: clampAnkiEase(currentEase),
  };
}

// ── Default book ─────────────────────────────────────────────────────

async function ensureDefaultBook(sql, userId) {
  await sql`
    INSERT INTO word_books (user_id, name, is_default)
    SELECT ${userId}, '默认单词本', TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM word_books WHERE user_id = ${userId} AND is_default = TRUE
    )
  `;

  const rows = await sql`
    SELECT id FROM word_books
    WHERE user_id = ${userId} AND is_default = TRUE LIMIT 1
  `;

  return Number(rows[0].id);
}

// ── Handlers ─────────────────────────────────────────────────────────

async function handleAddWord(sql, userId, body) {
  const word = normalizeWord(body.word);
  if (!word) return errorJson(400, 'word 不能为空');

  const meanings = readMeaningItems(body.meanings);
  if (meanings.length === 0) return errorJson(400, 'meanings 不能为空，且必须包含合法义项');

  const phonetic = typeof body.phonetic === 'string' ? body.phonetic.trim() : '';
  const primaryMeaning = buildPrimaryMeaning(meanings);
  const bookIds = Array.isArray(body.bookIds)
    ? body.bookIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map(Number)
    : [];

  // Ensure default book exists
  const defaultBookId = await ensureDefaultBook(sql, userId);

  // Check existing
  const existing = await sql`
    SELECT id FROM words WHERE user_id = ${userId} AND word = ${word}
  `;

  // Upsert word
  const saved = await sql`
    INSERT INTO words (user_id, word, phonetic, primary_meaning, meanings)
    VALUES (${userId}, ${word}, ${phonetic}, ${primaryMeaning}, ${sql.json(meanings)})
    ON CONFLICT (user_id, word) DO UPDATE SET
      phonetic = EXCLUDED.phonetic,
      primary_meaning = EXCLUDED.primary_meaning,
      meanings = EXCLUDED.meanings,
      updated_at = NOW()
    RETURNING id, word, phonetic, primary_meaning, meanings, ease, interval, next_review, review_count, created_at, updated_at
  `;

  const card = mapWordRow(saved[0]);

  // Link to books
  const targetBookIds = bookIds.length > 0 ? bookIds : [defaultBookId];

  // Validate book IDs
  const validBooks = await sql`
    SELECT id FROM word_books
    WHERE user_id = ${userId} AND id = ANY(${targetBookIds}::bigint[])
  `;
  const validIds = validBooks.map((r) => Number(r.id));

  if (bookIds.length > 0 && validIds.length !== bookIds.length) {
    return errorJson(404, '单词本不存在');
  }

  for (const bookId of validIds) {
    await sql`
      INSERT INTO word_book_items (book_id, word_id)
      VALUES (${bookId}, ${card.id})
      ON CONFLICT DO NOTHING
    `;
  }

  // Link orphans to default
  await sql`
    INSERT INTO word_book_items (book_id, word_id)
    SELECT ${defaultBookId}, w.id
    FROM words w
    WHERE w.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM word_book_items item WHERE item.word_id = w.id
      )
    ON CONFLICT DO NOTHING
  `;

  const wasUpdated = existing.length > 0;
  return json(ok(card, wasUpdated ? 'Word updated' : 'Word added'));
}

async function handleGetToday(sql, userId, searchParams, env) {
  // Read user learning settings for daily limit
  const settingsRows = await sql`
    SELECT daily_review_limit_enabled, daily_review_limit
    FROM user_learning_settings
    WHERE user_id = ${userId}
  `;

  let limit = undefined;
  if (settingsRows.length > 0 && settingsRows[0].daily_review_limit_enabled) {
    limit = Number(settingsRows[0].daily_review_limit);
  }

  const limitClause = limit ? `LIMIT ${limit}` : '';

  const rows = await sql.unsafe(`
    SELECT
      id, word, phonetic, primary_meaning, meanings,
      ease, interval, next_review, review_count,
      created_at, updated_at
    FROM words
    WHERE user_id = ${userId}
      AND next_review <= CURRENT_DATE
    ORDER BY
      GREATEST(CURRENT_DATE - next_review, 0)::double precision / GREATEST(interval, 1) DESC,
      next_review ASC,
      updated_at ASC,
      word ASC
    ${limitClause}
  `);

  return json(ok(rows.map(mapWordRow), 'Today words fetched'));
}

async function handleReview(sql, userId, body) {
  const wordId = Number(body.wordId);
  if (!Number.isInteger(wordId) || wordId <= 0) return errorJson(400, 'wordId 非法');

  const rating = body.rating;
  const allowed = ['again', 'hard', 'good', 'easy'];
  if (!allowed.includes(rating)) return errorJson(400, 'rating 非法');

  // Find the word
  const wordRows = await sql`
    SELECT id, word, phonetic, primary_meaning, meanings, ease, interval, next_review, review_count, created_at, updated_at
    FROM words
    WHERE user_id = ${userId} AND id = ${wordId}
  `;

  if (wordRows.length === 0) return errorJson(404, '单词不存在');

  const current = mapWordRow(wordRows[0]);
  const nextSchedule = getNextAnkiSchedule(current, rating);

  const updated = await sql`
    UPDATE words
    SET interval = ${nextSchedule.interval},
        ease = ${nextSchedule.ease},
        next_review = CURRENT_DATE + ${nextSchedule.interval}::integer,
        review_count = review_count + 1,
        updated_at = NOW()
    WHERE user_id = ${userId} AND id = ${wordId}
    RETURNING id, word, phonetic, primary_meaning, meanings, ease, interval, next_review, review_count, created_at, updated_at
  `;

  return json(ok(mapWordRow(updated[0]), 'Word review updated'));
}

async function handleRollback(sql, userId, body) {
  const wordId = Number(body.wordId);
  const ease = Number(body.ease);
  const interval = Number(body.interval);
  const reviewCount = Number(body.reviewCount);
  const nextReviewInput = body.nextReview;

  if (!Number.isInteger(wordId) || wordId <= 0) return errorJson(400, 'wordId 非法');
  if (!Number.isFinite(ease) || ease <= 0) return errorJson(400, 'ease 非法');
  if (!Number.isInteger(interval) || interval <= 0) return errorJson(400, 'interval 非法');
  if (!Number.isInteger(reviewCount) || reviewCount < 0) return errorJson(400, 'reviewCount 非法');

  const nextReviewDate = new Date(nextReviewInput);
  if (Number.isNaN(nextReviewDate.getTime())) return errorJson(400, 'nextReview 非法');
  const nextReview = nextReviewDate.toISOString().slice(0, 10);

  // Verify ownership
  const existing = await sql`
    SELECT id FROM words WHERE user_id = ${userId} AND id = ${wordId}
  `;
  if (existing.length === 0) return errorJson(404, '单词不存在');

  const updated = await sql`
    UPDATE words
    SET interval = ${interval},
        ease = ${ease},
        next_review = ${nextReview}::date,
        review_count = ${reviewCount},
        updated_at = NOW()
    WHERE user_id = ${userId} AND id = ${wordId}
    RETURNING id, word, phonetic, primary_meaning, meanings, ease, interval, next_review, review_count, created_at, updated_at
  `;

  return json(ok(mapWordRow(updated[0]), 'Word review rolled back'));
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleWordStudy(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const sql = getSql(env);
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/word', '');
    const method = request.method;

    if (path === '/add' && method === 'POST') {
      return handleAddWord(sql, user.id, await readJsonBody(request));
    }

    if (path === '/today' && method === 'GET') {
      return handleGetToday(sql, user.id, url.searchParams, env);
    }

    if (path === '/review' && method === 'POST') {
      return handleReview(sql, user.id, await readJsonBody(request));
    }

    if (path === '/review/rollback' && method === 'POST') {
      return handleRollback(sql, user.id, await readJsonBody(request));
    }

    return errorJson(404, '路由不存在');
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) return errorJson(error.statusCode, error.message);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    return errorJson(500, error.message || '操作失败');
  }
}
