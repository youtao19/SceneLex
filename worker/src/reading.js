import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { decryptApiKey } from './decrypt.js';

function json(data, init) {
  return Response.json(data, init);
}

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function errorJson(statusCode, message) {
  return json({ code: statusCode, message, data: null }, { status: statusCode });
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readJsonBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function normalizeInput(value, fieldName, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text) {
    throw new HttpError(400, `${fieldName} 不能为空`);
  }

  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} 太长，请缩短后重试`);
  }

  return text;
}

function cleanPlainText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:text)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function buildWordPrompt(word, sentence) {
  return `你是中英双语英语阅读老师。请根据上下文解释英文单词。

单词：${word}
上下文句子：${sentence}

要求：
- 输出中文，最多 2 行
- 如果能判断词性，格式为 "[词性] 中文释义"
- 可以补一个很短的语境说明
- 不要输出 Markdown、引号或多余解释`;
}

function buildSentencePrompt(sentence) {
  return `请把下面英文句子翻译成自然、流畅的中文。

要求：
- 只输出最终中文译文
- 不要解释
- 不要加引号

英文句子：${sentence}`;
}

function buildChatPrompt(content, question) {
  return `你是一个英语阅读助手。用户正在阅读下面的英语文章。请根据文章内容回答用户的问题。

文章内容：
"""
${content}
"""

用户问题：${question}

要求：
- 使用中文回答
- 回答要简练、准确，针对文章内容
- 可以解释文章里的难句、生词或背景知识
- 不要输出 Markdown 标记或多余的客套话`;
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeArticleContent(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function buildArticleTitle(content) {
  const firstLine = content
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || 'Untitled article';

  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 80)}...`;
}

function mapArticleRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    content: row.content,
    charCount: Number(row.char_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function chooseApiKey(userApiKey, serverApiKey, allowServerApiKey) {
  if (userApiKey) return userApiKey;
  return allowServerApiKey === false ? '' : (serverApiKey || '');
}

function readTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000;
}

async function readUserAiSecrets(sql, userId, canUseServerApiKey, secret) {
  const rows = await sql`
    SELECT provider, api_key_ciphertext
    FROM user_ai_api_keys
    WHERE user_id = ${userId}
  `;

  const keys = {};
  for (const row of rows) {
    try {
      const decrypted = await decryptApiKey(row.api_key_ciphertext, secret);
      if (decrypted) keys[row.provider] = decrypted;
    } catch {
      console.warn(`User ${row.provider} API key cannot be decrypted; skipping personal key.`);
    }
  }

  return { ...keys, allowServerApiKey: canUseServerApiKey };
}

async function generatePlainWithKimi(prompt, secrets, env) {
  const apiKey = chooseApiKey(
    secrets.kimi,
    env.KIMI_API_KEY || env.MOONSHOT_API_KEY,
    secrets.allowServerApiKey !== false,
  );

  if (!apiKey) {
    throw new Error('Kimi 调用失败：请先在更多页面配置自己的 Kimi API Key');
  }

  const response = await fetch(`${env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.KIMI_MODEL || 'kimi-k2.6',
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.6,
      max_tokens: 1600,
      stream: false,
    }),
    signal: AbortSignal.timeout(readTimeout(env.KIMI_TIMEOUT || env.OLLAMA_TIMEOUT)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Kimi reading call failed:', response.status, errorText);
    throw new Error(`Kimi 调用失败：${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (content && content.trim()) return cleanPlainText(content);
  throw new Error('Kimi 未返回 message.content');
}

async function generatePlainWithDeepseek(prompt, secrets, env) {
  const apiKey = chooseApiKey(
    secrets.deepseek,
    env.DEEPSEEK_API_KEY,
    secrets.allowServerApiKey !== false,
  );

  if (!apiKey) {
    throw new Error('DeepSeek 调用失败：请先在更多页面配置自己的 DeepSeek API Key');
  }

  const response = await fetch(`${env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1600,
      stream: false,
    }),
    signal: AbortSignal.timeout(readTimeout(env.DEEPSEEK_TIMEOUT)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('DeepSeek reading call failed:', response.status, errorText);
    throw new Error(`DeepSeek 调用失败：${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (content && content.trim()) return cleanPlainText(content);
  throw new Error('DeepSeek 未返回 message.content');
}

async function generatePlain(prompt, secrets, env) {
  const provider = typeof env.AI_PROVIDER === 'string' ? env.AI_PROVIDER.trim() : 'kimi';

  if (provider === 'kimi') return generatePlainWithKimi(prompt, secrets, env);
  if (provider === 'deepseek') return generatePlainWithDeepseek(prompt, secrets, env);

  throw new Error('Worker 阅读接口只支持 kimi 或 deepseek');
}

async function handleLookupWord(sql, user, body, env) {
  const word = normalizeInput(body.word, 'word', 80);
  const sentence = normalizeInput(body.sentence, 'sentence', 600);
  const canUseServerApiKey = user.role === 'admin' || user.isVip === true;
  const secrets = await readUserAiSecrets(sql, user.id, canUseServerApiKey, env.USER_API_KEY_SECRET || '');
  const text = await generatePlain(buildWordPrompt(word, sentence), secrets, env);

  return json(ok({ text }, 'Reading word looked up'));
}

async function handleTranslateSentence(sql, user, body, env) {
  const sentence = normalizeInput(body.sentence, 'sentence', 800);
  const canUseServerApiKey = user.role === 'admin' || user.isVip === true;
  const secrets = await readUserAiSecrets(sql, user.id, canUseServerApiKey, env.USER_API_KEY_SECRET || '');
  const text = await generatePlain(buildSentencePrompt(sentence), secrets, env);

  return json(ok({ text }, 'Reading sentence translated'));
}

async function handleChat(sql, user, body, env) {
  const content = normalizeInput(body.content, 'content', 10000);
  const question = normalizeInput(body.question, 'question', 3000);
  const canUseServerApiKey = user.role === 'admin' || user.isVip === true;
  const secrets = await readUserAiSecrets(sql, user.id, canUseServerApiKey, env.USER_API_KEY_SECRET || '');
  const text = await generatePlain(buildChatPrompt(content, question), secrets, env);

  return json(ok({ text }, 'Assistant replied'));
}

async function handleSaveArticle(sql, user, body) {
  const content = normalizeArticleContent(normalizeInput(body.content, '文章内容', 30_000));
  const title = buildArticleTitle(content);
  const contentHash = await sha256Hex(content);
  const rows = await sql`
    INSERT INTO reading_articles (user_id, title, content, content_hash, char_count)
    VALUES (${user.id}, ${title}, ${content}, ${contentHash}, ${content.length})
    ON CONFLICT (user_id, content_hash)
    DO UPDATE SET updated_at = NOW()
    RETURNING id, title, content, char_count, created_at, updated_at
  `;

  return json(ok(mapArticleRow(rows[0]), 'Reading article saved'));
}

async function handleListArticles(sql, user) {
  const rows = await sql`
    SELECT id, title, content, char_count, created_at, updated_at
    FROM reading_articles
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC
    LIMIT 20
  `;

  return json(ok(rows.map(mapArticleRow), 'Reading articles fetched'));
}

function readPositiveId(value, message) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, message);
  return id;
}

async function handleDeleteArticle(sql, user, articleIdText) {
  const articleId = readPositiveId(articleIdText, '文章历史 id 非法');
  const rows = await sql`
    DELETE FROM reading_articles
    WHERE user_id = ${user.id}
      AND id = ${articleId}
    RETURNING id
  `;

  if (rows.length === 0) throw new HttpError(404, '阅读历史不存在');
  return json(ok(null, 'Reading article deleted'));
}

async function handleUpdateArticleTitle(sql, user, articleIdText, body) {
  const articleId = readPositiveId(articleIdText, '文章历史 id 非法');
  const title = normalizeInput(body.title, '标题', 200);
  const rows = await sql`
    UPDATE reading_articles
    SET title = ${title}
    WHERE user_id = ${user.id}
      AND id = ${articleId}
    RETURNING id
  `;

  if (rows.length === 0) throw new HttpError(404, '阅读历史不存在');
  return json(ok(null, 'Reading article title updated'));
}

export async function handleReading(request, env) {
  try {
    const user = await authenticate(request, env);
    authorize(user);

    const sql = getSql(env);
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/reading', '');
    const method = request.method;

    if (path === '/word' && method === 'POST') {
      return await handleLookupWord(sql, user, await readJsonBody(request), env);
    }

    if (path === '/sentence' && method === 'POST') {
      return await handleTranslateSentence(sql, user, await readJsonBody(request), env);
    }

    if (path === '/chat' && method === 'POST') {
      return await handleChat(sql, user, await readJsonBody(request), env);
    }

    if (path === '/articles') {
      if (method === 'GET') return await handleListArticles(sql, user);
      if (method === 'POST') return await handleSaveArticle(sql, user, await readJsonBody(request));
    }

    const articleMatch = path.match(/^\/articles\/(\d+)(?:\/title)?$/);
    if (articleMatch) {
      if (method === 'DELETE' && !path.endsWith('/title')) {
        return await handleDeleteArticle(sql, user, articleMatch[1]);
      }
      if (method === 'PATCH' && path.endsWith('/title')) {
        return await handleUpdateArticleTitle(sql, user, articleMatch[1], await readJsonBody(request));
      }
    }

    if (path.startsWith('/assistant-chats')) {
      return errorJson(501, '阅读助手聊天暂未迁移到 Cloudflare Worker');
    }

    return errorJson(404, '路由不存在');
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) return errorJson(error.statusCode, error.message);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return errorJson(504, '阅读接口调用超时，请稍后重试');
    }
    return errorJson(500, error.message || '阅读接口调用失败');
  }
}
