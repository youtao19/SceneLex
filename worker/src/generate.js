import { getSql } from './db.js';
import { authenticate, authorize, AuthError } from './auth.js';
import { decryptApiKey } from './decrypt.js';

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

function normalizeWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}

function readPositiveInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function readStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim());
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ── Fallback ─────────────────────────────────────────────────────────

function buildFallback(word) {
  return {
    word,
    phonetic: '',
    meanings: [
      {
        partOfSpeech: '词性',
        meaning: '常见意思',
        sceneTitle: '常见使用场景',
        examples: [`I met the word ${word} in a short scene.`],
        explanation: `这个场景先保底展示 ${word}，避免生成失败时页面没有内容。`,
        imageQueries: [`${word} word learning scene`, `${word} example scene`, `${word} visual memory`],
        example: `I met the word ${word} in a short sentence.`,
        tip: `${word} 的使用场景`,
      },
    ],
    source: 'generated',
    contentSource: 'agent',
    saved: false,
  };
}

// ── Dictionary ───────────────────────────────────────────────────────

async function findByWord(sql, word) {
  const rows = await sql`
    SELECT word, phonetic, definitions, meanings
    FROM dictionary_entries
    WHERE word = ${word.toLowerCase()}
  `;

  const row = rows[0];
  if (!row) return null;

  const meanings = normalizeDictionaryMeanings(row.meanings);
  if (meanings.length === 0) return null;

  return {
    word: row.word,
    phonetic: row.phonetic,
    definitions: Array.isArray(row.definitions) ? row.definitions.filter((d) => typeof d === 'string') : [],
    meanings,
  };
}

function normalizeDictionaryMeanings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      return typeof item.partOfSpeech === 'string' && typeof item.meaning === 'string'
        ? { partOfSpeech: item.partOfSpeech, meaning: item.meaning }
        : null;
    })
    .filter(Boolean);
}

// ── Cache ────────────────────────────────────────────────────────────

async function findCachedCard(sql, word, systemBookItemId, requiredMeanings) {
  if (systemBookItemId !== null && requiredMeanings.length > 0) {
    const rows = await sql`
      SELECT book_item_id, word, phonetic, meanings, content_source
      FROM system_word_card_previews
      WHERE book_item_id = ${systemBookItemId}
    `;
    if (rows.length > 0) {
      return mapCachedRow(rows[0]);
    }
    return null;
  }

  const rows = await sql`
    SELECT word, phonetic, meanings, content_source
    FROM system_word_cards
    WHERE word = ${word}
  `;
  if (rows.length > 0) {
    return mapCachedRow(rows[0]);
  }
  return null;
}

function mapCachedRow(row) {
  return {
    word: row.word,
    phonetic: row.phonetic,
    meanings: row.meanings,
    source: 'system-cache',
    contentSource: row.content_source,
    saved: false,
  };
}

async function saveSystemWordCard(sql, card) {
  await sql`
    INSERT INTO system_word_cards (word, phonetic, meanings, content_source)
    VALUES (${card.word}, ${card.phonetic}, ${sql.json(card.meanings)}, ${card.contentSource})
    ON CONFLICT (word) DO UPDATE SET
      phonetic = EXCLUDED.phonetic,
      meanings = EXCLUDED.meanings,
      content_source = EXCLUDED.content_source,
      updated_at = NOW()
  `;
}

async function saveSystemWordCardPreview(sql, bookItemId, card) {
  await sql`
    INSERT INTO system_word_card_previews (book_item_id, word, phonetic, meanings, content_source)
    VALUES (${bookItemId}, ${card.word}, ${card.phonetic}, ${sql.json(card.meanings)}, ${card.contentSource})
    ON CONFLICT (book_item_id) DO UPDATE SET
      word = EXCLUDED.word,
      phonetic = EXCLUDED.phonetic,
      meanings = EXCLUDED.meanings,
      content_source = EXCLUDED.content_source,
      updated_at = NOW()
  `;
}

// ── Prompt building ──────────────────────────────────────────────────

const wordJsonSystemPrompt = 'You are a JSON API. Return only valid JSON. Do not include reasoning, markdown, or explanations.';

function buildWordPrompt(word, dictionaryEntry, requiredMeanings) {
  return [
    buildWordInstructionPrompt(word, dictionaryEntry, requiredMeanings),
    buildWordOutputRequirement(word),
  ].join('\n\n');
}

function buildWordInstructionPrompt(word, dictionaryEntry, requiredMeanings) {
  const contextSections = [
    dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : '',
    requiredMeanings.length > 0 ? buildRequiredMeaningContext(requiredMeanings) : '',
  ].filter(Boolean);

  return `
# Role
You are an English vocabulary card writer for Chinese learners.

# Task
Create a memorable word card for "${word}".

# Context
${contextSections.length > 0 ? contextSections.join('\n\n') : 'No external dictionary context was provided.'}

# Meaning Selection
- If "考试要求义项" is provided, generate meanings only for those meanings and keep the same order.
- Otherwise, use common learner-relevant meanings, preferably grounded in "词库上下文" when it exists.
- Generate 1-5 meanings. Each meaning must represent a distinct part of speech or usage scene.
- Do not repeat the same Chinese meaning with small wording changes.

# Content Rules
- meaning: short dictionary-style Chinese gloss, 2-8 characters when possible.
- sceneTitle: short Chinese scene label, 2-6 characters.
- examples: exactly 2 understandable phrase fragments; each has 2-5 English words and uses the exact word "${word}" without inflection.
- explanation: one short Chinese sentence, no more than 30 Chinese characters.
- imageQueries: exactly 3 concrete English image-search phrases; each has no more than 6 words.
- tip: translate the English example phrases into Chinese in the same order, separated by "；". Do not write metaphors, analogies, or memory hooks.

# Example Style
- Verb: "${word} the data", "${word} a map"
- Adjective: "a ${word} cup", "the ${word} road"
- Adverb: "move ${word}", "speak ${word}"
- Noun: "a ${word} at home", "the ${word} in rain"

# Quality Bar
- Use simple, common words. Prefer concrete nouns such as data, map, road, cup, room, book, food, rain, work.
- Use phrase fragments, not complete sentences. Avoid subjects such as I, she, he, they, people.
- Avoid polite or classroom sentence frames such as "please", "I need to", "can you", and "every sentence".
- Avoid grammar-broken phrases just to force the target word into an example.
- Avoid filler such as "体现..." or "用于..." in meaning.
`.trim();
}

function buildRequiredMeaningContext(requiredMeanings) {
  const meanings = requiredMeanings
    .map((item) => `${item.priority}. ${item.partOfSpeech} ${item.meaning}`)
    .join('\n');
  return `考试要求义项：\n${meanings}`;
}

function buildDictionaryContext(entry) {
  const meanings = entry.meanings
    .map((item, index) => `${index + 1}. ${item.partOfSpeech} ${item.meaning}`)
    .join('\n');
  const definitions = entry.definitions.length > 0
    ? entry.definitions.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '词库未提供英文释义';

  return `
词库上下文：
单词：${entry.word}
音标：${entry.phonetic || '词库未提供'}
中文义项：
${meanings}
英文释义参考：
${definitions}
`.trim();
}

function buildWordOutputRequirement(word) {
  return `
# Output Contract
Return one valid JSON object only.
Do not return markdown, code fences, comments, reasoning, or extra text.

# JSON Shape

{
  "word": "${word}",
  "phonetic": "/美式IPA/",
  "meanings": [
    {
      "partOfSpeech": "adv./adj./v./n./prep.",
      "meaning": "极短中文释义，2-8字，不能和其他 meaning 重复",
      "sceneTitle": "2-6字中文场景",
      "imageQueries": ["3-4个短英文关键词", "像搜图用的短语", "不要长句"],
      "examples": ["2-5词英文短语", "必须用原词${word}", "不要完整句子"],
      "explanation": "一句话说明这个短语画面如何体现该义项",
      "tip": "按顺序翻译 examples，用中文分号分隔"
    }
  ]
}

# Hard Requirements
- word 必须是 "${word}"
- phonetic 写美式 IPA；不知道时输出空字符串
- meanings 数量 1-5 个
- examples 输出 2 条；每条 2-5 个英文词，必须包含原词 "${word}"，不要使用变形
- examples 只写能理解意思的短语，不写完整句子，不用 I/she/he/they/please 等句子框架
- imageQueries 输出 3 条；每条不超过 6 个英文单词
- explanation 不超过 30 个中文字符
- tip 只翻译 examples，不写联想、比喻或记忆钩子
`.trim();
}

// ── JSON extraction (ported from llm.service.ts findLastJsonObjectText) ──

function hasWordMeanings(value) {
  return 'word' in value && 'meanings' in value;
}

function findLastJsonObjectText(text) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const data = JSON.parse(candidates[i]);
      if (data && typeof data === 'object' && hasWordMeanings(data)) {
        return candidates[i];
      }
    } catch {
      // continue trying
    }
  }

  return '';
}

// ── Normalization ────────────────────────────────────────────────────

function readMeaningItems(value) {
  if (!Array.isArray(value)) return [];

  const result = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') continue;

    const partOfSpeech = typeof item.partOfSpeech === 'string' ? item.partOfSpeech.trim() : '';
    const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : '';
    const sceneTitle = typeof item.sceneTitle === 'string' ? item.sceneTitle.trim() : meaning;
    const examples = readStringList(item.examples);
    const example = typeof item.example === 'string' ? item.example.trim() : '';
    const finalExamples = examples.length > 0 ? examples : [example].filter(Boolean);
    const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
    const imageQueries = readStringList(item.imageQueries);
    const tip = typeof item.tip === 'string' ? item.tip.trim() : '';

    if (!partOfSpeech || !meaning || finalExamples.length === 0 || !tip) continue;

    result.push({
      partOfSpeech,
      meaning,
      sceneTitle,
      examples: finalExamples,
      explanation: explanation || tip,
      imageQueries,
      example: example || finalExamples[0],
      tip,
    });
  }

  return result;
}

function filterMeaningsByWord(meanings, word) {
  const normalizedWord = word.toLowerCase();
  const result = [];
  for (const meaning of meanings) {
    const examples = meaning.examples.filter((example) =>
      example.toLowerCase().includes(normalizedWord),
    );
    if (examples.length === 0) continue;
    result.push({ ...meaning, examples, example: examples[0] });
  }
  return result;
}

function normalizeGeneratedResult(raw, fallbackWord) {
  const fallback = buildFallback(fallbackWord);
  let word = fallbackWord;
  let phonetic = fallback.phonetic;
  let meanings = fallback.meanings;

  if (raw && typeof raw === 'object') {
    const data = raw;
    const rawWord = data.word;
    if (typeof rawWord === 'string' && rawWord.trim()) {
      word = normalizeWord(rawWord);
    }

    phonetic = typeof data.phonetic === 'string' ? data.phonetic.trim() : '';

    const meaningItems = readMeaningItems(data.meanings);
    const validMeanings = filterMeaningsByWord(meaningItems, fallbackWord);
    if (validMeanings.length > 0) {
      meanings = validMeanings;
    }
  }

  return { word, phonetic, meanings, source: 'generated', contentSource: 'agent', saved: false };
}

function applyDictionaryFacts(result, dictionaryEntry) {
  if (!dictionaryEntry) return result;

  const meanings = [];
  const usedDictionaryMeanings = [];

  for (let i = 0; i < result.meanings.length; i += 1) {
    const generated = result.meanings[i];
    const dictionaryMeaning = dictionaryEntry.meanings[i];

    if (!dictionaryMeaning || usedDictionaryMeanings.includes(dictionaryMeaning.meaning)) {
      meanings.push(generated);
      continue;
    }

    usedDictionaryMeanings.push(dictionaryMeaning.meaning);
    meanings.push({
      ...generated,
      partOfSpeech: dictionaryMeaning.partOfSpeech,
      meaning: dictionaryMeaning.meaning,
    });
  }

  return { ...result, word: dictionaryEntry.word, phonetic: dictionaryEntry.phonetic || result.phonetic, meanings };
}

function normalizeRequiredMeanings(value) {
  if (!Array.isArray(value)) return [];

  const result = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const partOfSpeech = typeof item.partOfSpeech === 'string' ? item.partOfSpeech.trim() : '';
    const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : '';
    const priority = Number(item.priority);
    if (!partOfSpeech || !meaning || !Number.isInteger(priority)) continue;
    result.push({ partOfSpeech, meaning, priority });
  }

  return result.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

function applyRequiredMeanings(result, requiredMeanings) {
  if (requiredMeanings.length === 0) return result;

  const fallbackMeaning = result.meanings[0] ?? buildFallback(result.word).meanings[0];
  const meanings = requiredMeanings.map((required, index) => {
    const generated = result.meanings[index] ?? fallbackMeaning;
    return { ...generated, partOfSpeech: required.partOfSpeech, meaning: required.meaning };
  });

  return { ...result, meanings };
}

// ── LLM calls ────────────────────────────────────────────────────────

function chooseApiKey(userApiKey, serverApiKey, allowServerApiKey) {
  if (userApiKey) return userApiKey;
  return allowServerApiKey === false ? '' : (serverApiKey ?? '');
}

function readTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 25000;
}

function logProviderError(provider, status, errorText) {
  console.error(`${provider} 调用失败：${status}`, errorText);
}

async function generateWithKimi(prompt, secrets, env) {
  const apiKey = chooseApiKey(secrets.kimi, env.KIMI_API_KEY, secrets.allowServerApiKey !== false);
  if (!apiKey) {
    throw new Error('Kimi 调用失败：请先在更多页面配置自己的 Kimi API Key');
  }

  const baseURL = env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
  const model = env.KIMI_MODEL || 'kimi-k2.6';
  const timeout = readTimeout(env.KIMI_TIMEOUT);

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: wordJsonSystemPrompt },
        { role: 'user', content: `/no_think\n${prompt}` },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      temperature: 0.6,
      max_tokens: 2400,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logProviderError('Kimi', response.status, errorText);
    throw new Error('AI 服务暂时不可用，请稍后再试');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (content && content.trim()) {
    const cleanContent = content.trim();
    const jsonText = findLastJsonObjectText(cleanContent);
    if (jsonText) return jsonText;
    if (cleanContent.startsWith('{')) {
      throw new Error('Kimi 未返回完整 JSON，请调大 max_tokens 或缩短提示词');
    }
    return cleanContent;
  }

  throw new Error('Kimi 未返回 message.content');
}

async function generateWithDeepseek(prompt, secrets, env) {
  const apiKey = chooseApiKey(secrets.deepseek, env.DEEPSEEK_API_KEY, secrets.allowServerApiKey !== false);
  if (!apiKey) {
    throw new Error('DeepSeek 调用失败：请先在更多页面配置自己的 DeepSeek API Key');
  }

  const baseURL = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const timeout = readTimeout(env.DEEPSEEK_TIMEOUT);

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: wordJsonSystemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 2400,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logProviderError('DeepSeek', response.status, errorText);
    throw new Error('AI 服务暂时不可用，请稍后再试');
  }

  const data = await response.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  const content = data.choices?.[0]?.message?.content;

  if (finishReason === 'length') {
    throw new Error('DeepSeek 输出被 max_tokens 截断，请调大 max_tokens 或缩短提示词');
  }

  if (content && content.trim()) {
    const cleanContent = content.trim();
    const jsonText = findLastJsonObjectText(cleanContent);
    return jsonText || cleanContent;
  }

  throw new Error('DeepSeek 未返回 message.content');
}

async function generateWithLocalModel(prompt, secrets, env) {
  const provider = typeof env.AI_PROVIDER === 'string' ? env.AI_PROVIDER.trim() : '';

  if (!provider) {
    throw new Error('AI_PROVIDER 未配置，请设置为 kimi 或 deepseek');
  }

  if (provider === 'kimi') {
    return generateWithKimi(prompt, secrets, env);
  }

  if (provider === 'deepseek') {
    return generateWithDeepseek(prompt, secrets, env);
  }

  throw new Error('AI_PROVIDER 只支持 kimi 或 deepseek');
}

// ── User secrets ─────────────────────────────────────────────────────

async function readUserApiKeys(sql, userId, userApiKeySecret) {
  const rows = await sql`
    SELECT provider, api_key_ciphertext
    FROM user_ai_api_keys
    WHERE user_id = ${userId}
  `;

  const keys = {};
  for (const row of rows) {
    const decrypted = await decryptApiKey(row.api_key_ciphertext, userApiKeySecret);
    if (decrypted) {
      keys[row.provider] = decrypted;
    }
  }

  return keys;
}

async function getUserAiSecrets(sql, userId, canUseServerApiKey, userApiKeySecret) {
  try {
    const keys = await readUserApiKeys(sql, userId, userApiKeySecret);
    return { ...keys, allowServerApiKey: canUseServerApiKey };
  } catch {
    throw new Error(
      '个人模型密钥无法解密。请在"更多 -> 个人模型密钥"里清除并重新保存，或让本地和 VPS 使用同一个 USER_API_KEY_SECRET。',
    );
  }
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleWordGenerate(request, env) {
  try {
    // Auth
    const user = await authenticate(request, env);
    authorize(user);

    // Parse body
    const body = await readJsonBody(request);
    const word = normalizeWord(body.word);
    if (!word) {
      return errorJson(400, 'word 不能为空');
    }

    const forceRegenerate = body.forceRegenerate === true;
    const requiredMeanings = normalizeRequiredMeanings(body.requiredMeanings);
    const systemBookItemId = readPositiveInteger(body.systemBookItemId);

    const sql = getSql(env);

    // Dictionary
    const dictionaryEntry = await findByWord(sql, word);

    // Cache
    if (!forceRegenerate) {
      const cached = await findCachedCard(sql, word, systemBookItemId, requiredMeanings);
      if (cached) {
        return json(ok(cached, 'Word meaning fetched from cache'));
      }
    }

    // Prompt
    const prompt = buildWordPrompt(word, dictionaryEntry ?? undefined, requiredMeanings);

    // User AI secrets
    const canUseServerApiKey = user.role === 'admin' || user.isVip;
    const userApiKeySecret = env.USER_API_KEY_SECRET || '';
    const userSecrets = await getUserAiSecrets(sql, user.id, canUseServerApiKey, userApiKeySecret);

    // LLM
    const rawText = await generateWithLocalModel(prompt, userSecrets, env);

    // Parse
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return errorJson(500, '模型输出解析失败');
    }

    // Normalize
    const contentSource = dictionaryEntry ? 'dictionary' : 'agent';
    const normalized = applyRequiredMeanings(
      applyDictionaryFacts(
        normalizeGeneratedResult(parsed, word),
        requiredMeanings.length > 0 ? null : dictionaryEntry,
      ),
      requiredMeanings,
    );
    const generated = { ...normalized, word, contentSource };

    // Save cache
    if (systemBookItemId !== null && requiredMeanings.length > 0) {
      await saveSystemWordCardPreview(sql, systemBookItemId, generated);
    } else {
      await saveSystemWordCard(sql, generated);
    }

    return json(ok(
      { word: generated.word, phonetic: generated.phonetic, meanings: generated.meanings, source: 'generated', contentSource, saved: false },
      'Word preview generated',
    ));
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) {
      return errorJson(error.statusCode, error.message);
    }
    return errorJson(500, error.message || '生成失败');
  }
}
