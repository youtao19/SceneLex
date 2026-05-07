import { query } from '../config/database';
import type { DictionaryEntry, DictionaryMeaning } from '../types/dictionary';

interface DictionaryEntryRow {
  word: string;
  phonetic: string;
  definitions: unknown;
  meanings: unknown;
}

function normalizeDefinitions(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeMeanings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): DictionaryMeaning | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const meaning = item as {
        partOfSpeech?: unknown;
        meaning?: unknown;
      };

      return typeof meaning.partOfSpeech === 'string' && typeof meaning.meaning === 'string'
        ? { partOfSpeech: meaning.partOfSpeech, meaning: meaning.meaning }
        : null;
    })
    .filter((item): item is DictionaryMeaning => item !== null);
}

function mapDictionaryEntry(row: DictionaryEntryRow): DictionaryEntry | null {
  const meanings = normalizeMeanings(row.meanings);

  if (meanings.length === 0) {
    return null;
  }

  return {
    word: row.word,
    phonetic: row.phonetic,
    definitions: normalizeDefinitions(row.definitions),
    meanings,
  };
}

export const dictionaryService = {
  /**
   * 词典已经入库，启动时只记录来源，避免小内存服务器加载整本词典。
   */
  warmup() {
    return {
      entries: 0,
      source: 'postgres:dictionary_entries',
      durationMs: 0,
    };
  },

  /**
   * 查词只走 PostgreSQL 主键查询，内存占用稳定，适合 1G 服务器。
   */
  async findByWord(word: string) {
    const result = await query<DictionaryEntryRow>(
      `
        SELECT
          word,
          phonetic,
          definitions,
          meanings
        FROM dictionary_entries
        WHERE word = $1
      `,
      [word.toLowerCase()],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapDictionaryEntry(result.rows[0]);
  },
};
