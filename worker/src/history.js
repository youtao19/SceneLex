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

function isDueToday(nextReview) {
  const today = new Date().toISOString().slice(0, 10);
  const reviewDate = new Date(nextReview).toISOString().slice(0, 10);
  return reviewDate <= today;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function handleHistory(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const sql = getSql(env);

    const summaryResult = await sql`
      SELECT
        COUNT(*)::text AS total_words,
        COUNT(*) FILTER (WHERE next_review <= CURRENT_DATE)::text AS due_today,
        COUNT(*) FILTER (WHERE review_count > 0)::text AS reviewed_words
      FROM words
      WHERE user_id = ${user.id}
    `;

    const wordsResult = await sql`
      SELECT
        id, word, phonetic, primary_meaning, meanings,
        ease, interval, next_review, review_count,
        created_at, updated_at
      FROM words
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC, word ASC
    `;

    const words = wordsResult.map(mapWordRow);
    const summaryRow = summaryResult[0];

    const summary = {
      totalWords: Number(summaryRow.total_words),
      dueToday: Number(summaryRow.due_today),
      reviewedWords: Number(summaryRow.reviewed_words),
    };

    const dueWords = words
      .filter((w) => isDueToday(w.nextReview))
      .sort((a, b) => a.nextReview.localeCompare(b.nextReview));

    return json(ok({
      summary,
      dueWords,
      recentWords: words.slice(0, 6),
      words,
    }, 'History fetched'));
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) {
      return errorJson(error.statusCode, error.message);
    }
    return errorJson(500, error.message || '获取历史失败');
  }
}
