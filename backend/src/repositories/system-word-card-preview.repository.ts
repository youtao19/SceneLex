import { query } from '../config/database';
import type { WordGenerateResult, WordMeaningItem } from '../types/word';

interface SystemWordCardPreviewRow {
  book_item_id: string;
  word: string;
  phonetic: string;
  meanings: WordMeaningItem[];
  content_source: WordGenerateResult['contentSource'];
}

function mapPreviewRow(row: SystemWordCardPreviewRow): WordGenerateResult {
  return {
    word: row.word,
    phonetic: row.phonetic,
    meanings: row.meanings,
    source: 'system-cache',
    contentSource: row.content_source,
    saved: false,
  };
}

function mapSystemWordCardRow(row: Omit<SystemWordCardPreviewRow, 'book_item_id'>): WordGenerateResult {
  return {
    word: row.word,
    phonetic: row.phonetic,
    meanings: row.meanings,
    source: 'system-cache',
    contentSource: row.content_source,
    saved: false,
  };
}

/**
 * 仪表盘查词使用全局缓存，避免词卡被某个用户的 words 表隔离。
 */
export async function findSystemWordCardByWord(
  word: string,
): Promise<WordGenerateResult | null> {
  const result = await query<Omit<SystemWordCardPreviewRow, 'book_item_id'>>(
    `
      SELECT
        word,
        phonetic,
        meanings,
        content_source
      FROM system_word_cards
      WHERE word = $1
    `,
    [word],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapSystemWordCardRow(result.rows[0]);
}

export async function findSystemWordCardPreview(
  bookItemId: number,
): Promise<WordGenerateResult | null> {
  const result = await query<SystemWordCardPreviewRow>(
    `
      SELECT
        book_item_id,
        word,
        phonetic,
        meanings,
        content_source
      FROM system_word_card_previews
      WHERE book_item_id = $1
    `,
    [bookItemId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapPreviewRow(result.rows[0]);
}

/**
 * 普通查词缓存按 word 覆盖，系统级内容不携带用户学习进度。
 */
export async function saveSystemWordCard(card: WordGenerateResult) {
  await query(
    `
      INSERT INTO system_word_cards (
        word,
        phonetic,
        meanings,
        content_source
      )
      VALUES ($1, $2, $3::jsonb, $4)
      ON CONFLICT (word)
      DO UPDATE SET
        phonetic = EXCLUDED.phonetic,
        meanings = EXCLUDED.meanings,
        content_source = EXCLUDED.content_source,
        updated_at = NOW()
    `,
    [card.word, card.phonetic, JSON.stringify(card.meanings), card.contentSource],
  );
}

/**
 * 系统词书缓存是全局模板内容，重复生成时覆盖旧版本即可。
 */
export async function saveSystemWordCardPreview(
  bookItemId: number,
  card: WordGenerateResult,
) {
  await query(
    `
      INSERT INTO system_word_card_previews (
        book_item_id,
        word,
        phonetic,
        meanings,
        content_source
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (book_item_id)
      DO UPDATE SET
        word = EXCLUDED.word,
        phonetic = EXCLUDED.phonetic,
        meanings = EXCLUDED.meanings,
        content_source = EXCLUDED.content_source,
        updated_at = NOW()
    `,
    [bookItemId, card.word, card.phonetic, JSON.stringify(card.meanings), card.contentSource],
  );
}
