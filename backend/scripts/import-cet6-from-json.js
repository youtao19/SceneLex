const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.dev.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const JSON_PATH = path.resolve(__dirname, '..', 'data', 'cet6-word-list.json');

function normalizePartOfSpeech(value) {
  const text = value.trim().toLowerCase().replace(/\.$/, '');
  const map = {
    n: 'n.',
    v: 'v.',
    vi: 'vi.',
    vt: 'vt.',
    adj: 'adj.',
    a: 'adj.',
    adv: 'adv.',
    prep: 'prep.',
    pron: 'pron.',
    conj: 'conj.',
    num: 'num.',
  };

  return map[text] || (text ? `${text}.` : '词性');
}

function splitMeaningLine(line, fallbackPartOfSpeech) {
  const text = line.trim();

  if (!text) {
    return null;
  }

  const match = text.match(/^([a-zA-Z]{1,6}\.)\s*(.+)$/);

  if (!match) {
    // 如果以方括号开头（如 [医]、[经]），提取方括号内容作为词性提示
    const bracketMatch = text.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (bracketMatch && fallbackPartOfSpeech === '词性') {
      return {
        partOfSpeech: `[${bracketMatch[1]}]`,
        meaning: bracketMatch[2].trim(),
      };
    }

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

function parseExamMeanings(translation, fallbackPos) {
  if (!translation) return [];

  const lines = translation.split(/\\n|\n/);
  const meanings = [];
  const fallbackPartOfSpeech = normalizePartOfSpeech((fallbackPos || '').split('/')[0] || '');

  for (const line of lines) {
    const meaning = splitMeaningLine(line, fallbackPartOfSpeech);

    if (!meaning || meanings.some((item) => item.meaning === meaning.meaning)) {
      continue;
    }

    meanings.push({
      ...meaning,
      priority: meanings.length + 1,
    });

    if (meanings.length >= 3) {
      break;
    }
  }

  return meanings;
}

function loadWordList() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`缺少六级单词表 JSON：${JSON_PATH}`);
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.wordList)) {
    throw new Error('JSON 格式错误：缺少 wordList 数组');
  }

  return data.wordList;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置');
  }

  const words = loadWordList();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE system_word_book_items
      ADD COLUMN IF NOT EXISTS exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    const bookResult = await client.query(
      `
        INSERT INTO system_word_books (code, name, description, sort_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
        RETURNING id
      `,
      [
        'cet6',
        '六级核心词',
        `大学英语六级核心词汇，共 ${words.length} 词，从用户上传词表导入。`,
        20,
      ],
    );
    const bookId = Number(bookResult.rows[0].id);

    // 先删除旧数据，避免残留
    await client.query(
      `DELETE FROM system_word_book_items WHERE book_id = $1`,
      [bookId],
    );

    for (const [index, item] of words.entries()) {
      const word = (item.value || '').trim().toLowerCase();
      if (!word) continue;

      const meanings = parseExamMeanings(item.translation || '', item.pos || '');

      await client.query(
        `
          INSERT INTO system_word_book_items (
            book_id,
            word,
            order_index,
            unit,
            difficulty,
            exam_meanings
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (book_id, word)
          DO UPDATE SET
            order_index = EXCLUDED.order_index,
            unit = EXCLUDED.unit,
            difficulty = EXCLUDED.difficulty,
            exam_meanings = EXCLUDED.exam_meanings,
            updated_at = NOW()
        `,
        [
          bookId,
          word,
          index + 1,
          `Unit ${Math.floor(index / 50) + 1}`,
          'cet6',
          JSON.stringify(meanings),
        ],
      );
    }

    await client.query('COMMIT');
    console.log(`六级词书导入完成：${words.length} 个词`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
