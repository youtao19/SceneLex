import { getDatabasePool, initializeDatabase, query } from '../src/config/database';
import { aiConfig } from '../src/config/ai';
import { wordService } from '../src/services/word.service';
import type { WordRequiredMeaning } from '../src/types/word';

interface CandidateRow {
  id: string;
  word: string;
  order_index: number;
  exam_meanings: WordRequiredMeaning[];
}

function readArgValue(name: string) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] ?? '' : '';
}

function readPositiveArg(name: string, fallback: number) {
  const value = Number(readArgValue(name));

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readBookCode() {
  return readArgValue('--book') || 'cet6';
}

/**
 * 离线预热只取未缓存词，避免每次启动脚本都从同一批词重复生成。
 */
async function listCandidates(bookCode: string, startOrder: number, limit: number) {
  const result = await query<CandidateRow>(
    `
      SELECT
        item.id,
        item.word,
        item.order_index,
        item.exam_meanings
      FROM system_word_book_items item
      JOIN system_word_books book
        ON book.id = item.book_id
      LEFT JOIN system_word_card_previews preview
        ON preview.book_item_id = item.id
      WHERE book.code = $1
        AND item.order_index >= $2
        AND jsonb_array_length(item.exam_meanings) > 0
        AND preview.id IS NULL
      ORDER BY item.order_index ASC, item.id ASC
      LIMIT $3
    `,
    [bookCode, startOrder, limit],
  );

  return result.rows;
}

async function main() {
  const bookCode = readBookCode();
  const startOrder = readPositiveArg('--start-order', 1);
  const limit = readPositiveArg('--limit', 10);

  await initializeDatabase();

  const candidates = await listCandidates(bookCode, startOrder, limit);

  console.log(
    `系统词卡预热：book=${bookCode}, startOrder=${startOrder}, limit=${limit}, queued=${candidates.length}`,
  );
  console.log(`ai provider: ${aiConfig.provider}, model: ${aiConfig[aiConfig.provider].model}`);

  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const bookItemId = Number(item.id);

    console.log(`[${i + 1}/${candidates.length}] generating #${item.order_index} ${item.word}`);

    try {
      const result = await wordService.generateWordContent(
        0,
        item.word,
        false,
        item.exam_meanings,
        bookItemId,
      );

      console.log(`  ok: ${result.source}, meanings=${result.meanings.length}`);
    } catch (error) {
      console.error(`  failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabasePool().end();
  });
