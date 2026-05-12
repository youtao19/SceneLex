function json(data, init) {
  return Response.json(data, init);
}

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function errorJson(statusCode, message) {
  return json({ code: statusCode, message, data: null }, { status: statusCode });
}

async function handleDatabaseHealth(env) {
  const { getSql } = await import('./db.js');
  const rows = await getSql(env)`SELECT 1 AS ok`;

  return json({
    success: true,
    message: 'database is reachable',
    data: { ok: rows[0]?.ok === 1 },
  });
}

function normalizeWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}

function normalizeMeanings(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const partOfSpeech = typeof item.partOfSpeech === 'string' ? item.partOfSpeech.trim() : '';
      const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : '';

      return partOfSpeech && meaning
        ? { partOfSpeech, meaning, priority: index + 1 }
        : null;
    })
    .filter(Boolean)
    .slice(0, 6)
    .map((meaning, index) => ({ ...meaning, priority: index + 1 }));
}

async function readJsonBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function handleWordLookup(request, env) {
  const { getSql } = await import('./db.js');
  const { authenticate, authorize } = await import('./auth.js');
  const body = await readJsonBody(request);
  const word = normalizeWord(body.word);

  if (!word) {
    return json({ message: 'word 不能为空' }, { status: 400 });
  }

  const user = await authenticate(request, env);
  authorize(user);

  const rows = await getSql(env)`
    SELECT word, phonetic, meanings
    FROM dictionary_entries
    WHERE word = ${word}
  `;
  const row = rows[0];

  if (!row) {
    return json({ message: '词库中暂未找到该单词' }, { status: 404 });
  }

  const meanings = normalizeMeanings(row.meanings);

  if (meanings.length === 0) {
    return json({ message: '词库中暂未找到该单词' }, { status: 404 });
  }

  return json(ok({
    word: row.word,
    phonetic: row.phonetic || '',
    meanings,
  }, 'Word meanings fetched'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Health (no auth)
    if (url.pathname === '/api/health') {
      return json({
        success: true,
        message: 'worker is running',
        data: { service: 'scenelex-worker' },
      });
    }

    if (url.pathname === '/api/health/db') {
      try {
        return await handleDatabaseHealth(env);
      } catch (error) {
        console.error(error);
        return json(
          { success: false, message: error instanceof Error ? error.message : 'Database health check failed' },
          { status: 500 },
        );
      }
    }

    // Words (specific paths first)
    if (url.pathname === '/api/words/lookup' && request.method === 'POST') {
      try {
        return await handleWordLookup(request, env);
      } catch (error) {
        console.error(error);
        if (error?.statusCode) return errorJson(error.statusCode, error.message);
        return json(
          { success: false, message: error instanceof Error ? error.message : 'Word lookup failed' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/words/generate' && request.method === 'POST') {
      const { handleWordGenerate } = await import('./generate.js');
      return handleWordGenerate(request, env);
    }

    // History
    if (url.pathname === '/api/history' && request.method === 'GET') {
      const { handleHistory } = await import('./history.js');
      return handleHistory(request, env);
    }

    // System word books
    if (url.pathname.startsWith('/api/system-word-books')) {
      const { handleSystemWordBooks } = await import('./system-word-books.js');
      return handleSystemWordBooks(request, env);
    }

    // Word books (must be before /api/word/*)
    if (url.pathname.startsWith('/api/word-books')) {
      const { handleWordBooks } = await import('./word-books.js');
      return handleWordBooks(request, env);
    }

    // Settings
    if (url.pathname.startsWith('/api/settings')) {
      const { handleSettings } = await import('./settings.js');
      return handleSettings(request, env);
    }

    // Image article parsing
    if (url.pathname === '/api/ocr') {
      const { handleOcr } = await import('./ocr.js');
      return handleOcr(request, env);
    }

    // Reading
    if (url.pathname.startsWith('/api/reading')) {
      const { handleReading } = await import('./reading.js');
      return handleReading(request, env);
    }

    // Word study (review)
    if (url.pathname.startsWith('/api/word/')) {
      const { handleWordStudy } = await import('./word-study.js');
      return handleWordStudy(request, env);
    }

    // Auth
    if (url.pathname.startsWith('/api/auth')) {
      const { handleAuth } = await import('./auth-routes.js');
      return handleAuth(request, env);
    }

    // Proxy unmigrated routes to old Express
    const expressOrigin = env.EXPRESS_ORIGIN;
    if (expressOrigin) {
      const proxyUrl = `${expressOrigin}${url.pathname}${url.search}`;
      return fetch(proxyUrl, {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });
    }

    return json(
      { success: false, message: 'API route not migrated to Cloudflare Worker yet' },
      { status: 501 },
    );
  },
};
