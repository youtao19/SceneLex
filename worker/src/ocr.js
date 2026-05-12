import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { decryptApiKey } from './decrypt.js';

const maxImageBytes = 5 * 1024 * 1024;
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

function readTimeout(env) {
  return Number(env.KIMI_OCR_TIMEOUT || env.OCR_TIMEOUT || 120_000);
}

function buildArticleImagePrompt() {
  return `Extract all English article text from this image exactly as it appears.

Rules:
- Output only the extracted English text.
- Preserve paragraph breaks when visible.
- Do not translate.
- Do not summarize.
- Do not add explanations.
- If there is no readable English article text, output an empty string.`;
}

function cleanExtractedText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:text)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function readImageFile(request) {
  const form = await request.formData();
  const file = form.get('image');

  if (!(file instanceof File)) {
    throw new HttpError(400, '请上传需要解析的图片');
  }

  if (!supportedImageTypes.has(file.type)) {
    throw new HttpError(400, '仅支持 JPG、PNG、WEBP 图片');
  }

  if (file.size <= 0) {
    throw new HttpError(400, '图片文件为空');
  }

  if (file.size > maxImageBytes) {
    throw new HttpError(400, '图片不能超过 5MB');
  }

  return file;
}

async function readUserKimiKey(sql, userId, secret) {
  const rows = await sql`
    SELECT api_key_ciphertext
    FROM user_ai_api_keys
    WHERE user_id = ${userId}
      AND provider = 'kimi'
  `;

  const encrypted = rows[0]?.api_key_ciphertext;
  if (!encrypted) return '';

  try {
    return await decryptApiKey(encrypted, secret);
  } catch {
    console.warn('User Kimi API key cannot be decrypted; skipping personal key.');
    return '';
  }
}

async function chooseKimiApiKey(sql, user, env) {
  const userKey = await readUserKimiKey(sql, user.id, env.USER_API_KEY_SECRET || '');
  if (userKey) return userKey;

  const canUseServerApiKey = user.role === 'admin' || user.isVip === true;
  if (canUseServerApiKey) {
    return env.KIMI_API_KEY || env.MOONSHOT_API_KEY || '';
  }

  return '';
}

async function callKimiVision(file, apiKey, env) {
  const imageBytes = new Uint8Array(await file.arrayBuffer());
  const baseURL = env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
  const model = env.KIMI_VISION_MODEL || env.KIMI_MODEL || 'kimi-k2.6';
  const timeout = readTimeout(env);

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You extract English article text from images. Return only extracted text.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${file.type};base64,${bytesToBase64(imageBytes)}`,
              },
            },
            {
              type: 'text',
              text: buildArticleImagePrompt(),
            },
          ],
        },
      ],
      max_tokens: 1800,
      thinking: { type: 'disabled' },
      stream: false,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Kimi image parsing failed:', response.status, errorText);
    throw new HttpError(502, `Kimi 图片解析失败：${response.status}`);
  }

  const data = await response.json();
  return cleanExtractedText(data.choices?.[0]?.message?.content);
}

export async function handleOcr(request, env) {
  try {
    if (request.method !== 'POST') {
      return errorJson(404, '路由不存在');
    }

    const user = await authenticate(request, env);
    authorize(user);

    const file = await readImageFile(request);
    const sql = getSql(env);
    const apiKey = await chooseKimiApiKey(sql, user, env);

    if (!apiKey) {
      return errorJson(400, 'Kimi 图片解析失败：请先在更多页面配置自己的 Kimi API Key');
    }

    const text = await callKimiVision(file, apiKey, env);
    return json(ok({ text }, 'Article image parsed'));
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) return errorJson(error.statusCode, error.message);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return errorJson(504, 'Kimi 图片解析超时，请换一张更清晰的图片或稍后再试');
    }
    return errorJson(500, error.message || '图片解析失败');
  }
}
