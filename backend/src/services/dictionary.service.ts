import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import type { DictionaryEntry, DictionaryMeaning } from '../types/dictionary';

interface EcdictRow {
  word: string;
  phonetic: string;
  translation: string;
  pos: string;
}

let dictionaryCache: Map<string, DictionaryEntry> | null = null;

/**
 * 词库默认放在 backend/data 下，方便本地替换而不把大 CSV 提交进仓库。
 */
function getDictionaryCsvPath() {
  if (env.dictionaryCsvPath) {
    return path.resolve(env.dictionaryCsvPath);
  }

  return path.resolve(process.cwd(), 'data', 'ecdict.csv');
}

/**
 * CSV 里会有带换行的 quoted field，不能按行 split。
 */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * ECDICT 的 pos 可能是 n/vt/vi，这里统一成前端现有的短标签。
 */
function normalizePartOfSpeech(value: string) {
  const text = value.trim().toLowerCase().replace(/\.$/, '');

  if (!text) {
    return '';
  }
  const map: Record<string, string> = {
    n: 'n.',
    noun: 'n.',
    v: 'v.',
    vi: 'v.',
    vt: 'v.',
    verb: 'v.',
    adj: 'adj.',
    a: 'adj.',
    adv: 'adv.',
    prep: 'prep.',
    pron: 'pron.',
    conj: 'conj.',
    interj: 'interj.',
    num: 'num.',
  };

  return map[text] ?? `${text}.`;
}

/**
 * 中文释义里常带词性前缀，拆出来后才能稳定覆盖模型返回。
 */
function splitMeaningLine(line: string, fallbackPartOfSpeech: string): DictionaryMeaning | null {
  const text = line.trim();

  if (!text) {
    return null;
  }

  const match = text.match(/^([a-zA-Z]{1,6}\.)\s*(.+)$/);

  if (!match) {
    return {
      partOfSpeech: fallbackPartOfSpeech,
      meaning: text,
    };
  }

  return {
    partOfSpeech: normalizePartOfSpeech(match[1]),
    meaning: match[2].trim(),
  };
}

/**
 * ECDICT 的 translation 一行一个义项，保留顺序能让常见释义排在前面。
 */
function buildMeanings(row: EcdictRow) {
  const posItems = row.pos
    .split('/')
    .map(normalizePartOfSpeech)
    .filter(Boolean);
  const fallbackPartOfSpeech = posItems[0] ?? '词性';
  const result: DictionaryMeaning[] = [];
  let currentPartOfSpeech = fallbackPartOfSpeech;

  for (const line of row.translation.split(/\\n|\n/)) {
    if (line.trim().startsWith(`${row.word}的`)) {
      continue;
    }

    const item = splitMeaningLine(line, currentPartOfSpeech);

    if (!item) {
      continue;
    }

    currentPartOfSpeech = item.partOfSpeech;
    const duplicate = result.some(
      (current) =>
        current.partOfSpeech === item.partOfSpeech && current.meaning === item.meaning,
    );

    if (!duplicate) {
      result.push(item);
    }
  }

  return result;
}

/**
 * 只读取业务需要的列，避免把 ECDICT 的扩展字段泄漏到生成流程。
 */
function mapEcdictRow(headers: string[], values: string[]): EcdictRow | null {
  const getValue = (name: string) => {
    const index = headers.indexOf(name);

    return index >= 0 ? values[index]?.trim() ?? '' : '';
  };
  const word = getValue('word').toLowerCase();
  const translation = getValue('translation');

  if (!word || !translation) {
    return null;
  }

  return {
    word,
    phonetic: getValue('phonetic'),
    translation,
    pos: getValue('pos'),
  };
}

/**
 * 词库按需加载一次，后续查询走内存 Map，避免每次查词都解析大 CSV。
 */
function loadDictionary() {
  if (dictionaryCache) {
    return dictionaryCache;
  }

  const csvPath = getDictionaryCsvPath();
  const dictionary = new Map<string, DictionaryEntry>();

  if (!fs.existsSync(csvPath)) {
    dictionaryCache = dictionary;
    return dictionary;
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const headers = rows[0] ?? [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = mapEcdictRow(headers, rows[i]);

    if (!row) {
      continue;
    }

    const meanings = buildMeanings(row);

    if (meanings.length === 0) {
      continue;
    }

    dictionary.set(row.word, {
      word: row.word,
      phonetic: row.phonetic,
      meanings,
    });
  }

  dictionaryCache = dictionary;
  return dictionary;
}

export const dictionaryService = {
  /**
   * 只做精确查词；词形还原后续单独加，避免第一版把错误映射带进来。
   */
  findByWord(word: string) {
    const dictionary = loadDictionary();

    return dictionary.get(word.toLowerCase()) ?? null;
  },
};
