import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import type { DictionaryEntry, DictionaryMeaning } from '../types/dictionary';

type CompactDictionaryEntry = [
  word: string,
  phonetic: string,
  definitions: string[],
  meanings: [partOfSpeech: string, meaning: string][],
];

let dictionaryCache: Map<string, DictionaryEntry> | null = null;
let dictionarySource = 'none';

/**
 * 预编译 JSON 只保留业务字段，避免启动后第一次查词再解析完整 CSV。
 */
function getDictionaryJsonPath() {
  if (env.dictionaryJsonPath) {
    return path.resolve(env.dictionaryJsonPath);
  }

  return path.resolve(__dirname, '..', '..', 'data', 'ecdict.compact.json');
}

/**
 * 读取脚本生成的紧凑缓存，运行时只接受 JSON 词库，避免重新走 CSV 解析路径。
 */
function loadCompactDictionary(jsonPath: string) {
  const dictionary = new Map<string, DictionaryEntry>();
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { entries?: unknown };
  const entries = Array.isArray(raw.entries) ? raw.entries : [];

  for (const entry of entries) {
    if (!Array.isArray(entry)) {
      continue;
    }

    const [word, phonetic, definitions, rawMeanings] = entry as CompactDictionaryEntry;

    if (typeof word !== 'string' || typeof phonetic !== 'string') continue;
    if (!Array.isArray(definitions) || !Array.isArray(rawMeanings)) continue;

    const meanings = rawMeanings
      .map((item): DictionaryMeaning | null => {
        const [partOfSpeech, meaning] = item;

        return typeof partOfSpeech === 'string' && typeof meaning === 'string'
          ? { partOfSpeech, meaning }
          : null;
      })
      .filter((item): item is DictionaryMeaning => item !== null);

    if (meanings.length === 0) {
      continue;
    }

    dictionary.set(word.toLowerCase(), {
      word: word.toLowerCase(),
      phonetic,
      definitions: definitions.filter((item): item is string => typeof item === 'string'),
      meanings,
    });
  }

  return dictionary;
}

/**
 * 词库按需加载一次，后续查询走内存 Map，避免每次查词都解析大 CSV。
 */
function loadDictionary() {
  if (dictionaryCache) {
    return dictionaryCache;
  }

  const jsonPath = getDictionaryJsonPath();

  if (!fs.existsSync(jsonPath)) {
    throw new Error(
      `词典 JSON 缓存不存在，请先运行 npm --prefix backend run dict:build-cache：${jsonPath}`,
    );
  }

  dictionaryCache = loadCompactDictionary(jsonPath);
  dictionarySource = jsonPath;
  return dictionaryCache;
}

export const dictionaryService = {
  /**
   * 启动后主动预热，避免第一个真实查词请求承担词库加载成本。
   */
  warmup() {
    const startedAt = Date.now();
    const dictionary = loadDictionary();

    return {
      entries: dictionary.size,
      source: dictionarySource,
      durationMs: Date.now() - startedAt,
    };
  },

  /**
   * 只做精确查词；词形还原后续单独加，避免第一版把错误映射带进来。
   */
  findByWord(word: string) {
    const dictionary = loadDictionary();

    return dictionary.get(word.toLowerCase()) ?? null;
  },
};
