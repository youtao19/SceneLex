import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { decryptApiKey, encryptApiKey } from './decrypt.js';

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

const userApiKeyProviders = ['kimi', 'deepseek'];
const providerNames = { kimi: 'Kimi', deepseek: 'DeepSeek' };

function isUserApiKeyProvider(value) {
  return value === 'kimi' || value === 'deepseek';
}

// ── API key verification ─────────────────────────────────────────────

async function verifyUserApiKey(provider, apiKey, env) {
  const baseURL = provider === 'kimi'
    ? (env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1')
    : (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
  const model = provider === 'kimi'
    ? (env.KIMI_MODEL || 'kimi-k2.6')
    : (env.DEEPSEEK_MODEL || 'deepseek-v4-flash');
  const timeout = 15000;

  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a connectivity test. Reply with OK only.' },
      { role: 'user', content: 'OK' },
    ],
    max_tokens: 8,
    temperature: provider === 'kimi' ? 0.6 : 0,
    stream: false,
    ...(provider === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
  };

  let response;
  try {
    response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new HttpError(400, `${providerNames[provider]} API Key 测试失败：网络请求失败`);
  }

  if (!response.ok) {
    throw new HttpError(400, `${providerNames[provider]} API Key 测试失败：${response.status}`);
  }
}

// ── Learning settings ────────────────────────────────────────────────

async function handleGetLearning(sql, userId) {
  const rows = await sql`
    INSERT INTO user_learning_settings (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING daily_review_limit_enabled, daily_review_limit
  `;

  const row = rows[0];
  return json(ok({
    dailyReviewLimitEnabled: row.daily_review_limit_enabled,
    dailyReviewLimit: Number(row.daily_review_limit),
  }, 'Learning settings fetched'));
}

async function handleUpdateLearning(sql, userId, body) {
  const enabled = body.dailyReviewLimitEnabled === true;
  const limit = Number(body.dailyReviewLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return errorJson(400, '每日复习数量必须是 1 到 200 之间的整数');
  }

  const rows = await sql`
    INSERT INTO user_learning_settings (user_id, daily_review_limit_enabled, daily_review_limit, updated_at)
    VALUES (${userId}, ${enabled}, ${limit}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      daily_review_limit_enabled = EXCLUDED.daily_review_limit_enabled,
      daily_review_limit = EXCLUDED.daily_review_limit,
      updated_at = NOW()
    RETURNING daily_review_limit_enabled, daily_review_limit
  `;

  const row = rows[0];
  return json(ok({
    dailyReviewLimitEnabled: row.daily_review_limit_enabled,
    dailyReviewLimit: Number(row.daily_review_limit),
  }, 'Learning settings updated'));
}

// ── API key settings ─────────────────────────────────────────────────

async function handleGetApiKeys(sql, userId, canUseServerApiKey, env) {
  const rows = await sql`
    SELECT provider, api_key_ciphertext
    FROM user_ai_api_keys
    WHERE user_id = ${userId}
  `;

  const activeProvider = env.AI_PROVIDER || 'kimi';

  const providers = userApiKeyProviders.map((provider) => {
    const hasUserApiKey = rows.some((r) => r.provider === provider);
    const providerConfig = (provider === 'kimi' && env.KIMI_API_KEY) || (provider === 'deepseek' && env.DEEPSEEK_API_KEY);
    return {
      id: provider,
      name: providerNames[provider],
      hasUserApiKey,
      hasServerApiKey: canUseServerApiKey && Boolean(providerConfig),
    };
  });

  return json(ok({ activeProvider, providers }, 'User API key settings fetched'));
}

async function handleUpdateApiKeys(sql, userId, canUseServerApiKey, body, env) {
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';

  if (!isUserApiKeyProvider(provider)) {
    return errorJson(400, 'API Key 目前只支持 kimi 或 deepseek');
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const secret = env.USER_API_KEY_SECRET || '';

  if (apiKey) {
    if (apiKey.length > 300) {
      return errorJson(400, 'API Key 太长，请检查是否粘贴了错误内容');
    }

    // Verify the key works
    try {
      await verifyUserApiKey(provider, apiKey, env);
    } catch (error) {
      if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
      return errorJson(400, error.message);
    }

    // Encrypt and save
    const ciphertext = await encryptApiKey(apiKey, secret);
    await sql`
      INSERT INTO user_ai_api_keys (user_id, provider, api_key_ciphertext, updated_at)
      VALUES (${userId}, ${provider}, ${ciphertext}, NOW())
      ON CONFLICT (user_id, provider) DO UPDATE SET
        api_key_ciphertext = EXCLUDED.api_key_ciphertext,
        updated_at = NOW()
    `;
  } else {
    // Empty apiKey = delete
    await sql`
      DELETE FROM user_ai_api_keys
      WHERE user_id = ${userId} AND provider = ${provider}
    `;
  }

  // Return updated settings
  return handleGetApiKeys(sql, userId, canUseServerApiKey, env);
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleSettings(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const sql = getSql(env);
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/settings', '');
    const method = request.method;
    const canUseServerApiKey = user.role === 'admin' || user.isVip;

    if (path === '/learning') {
      if (method === 'GET') return handleGetLearning(sql, user.id);
      if (method === 'PATCH') return handleUpdateLearning(sql, user.id, await readJsonBody(request));
    }

    if (path === '/api-keys') {
      if (method === 'GET') return handleGetApiKeys(sql, user.id, canUseServerApiKey, env);
      if (method === 'PATCH') return handleUpdateApiKeys(sql, user.id, canUseServerApiKey, await readJsonBody(request), env);
    }

    return errorJson(404, '路由不存在');
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) return errorJson(error.statusCode, error.message);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    return errorJson(500, error.message || '操作失败');
  }
}
