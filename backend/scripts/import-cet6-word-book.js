const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.dev.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const WORD_LIST_URL = 'https://raw.githubusercontent.com/JavaProgrammerLB/cet-word-list/master/word-list.txt';
const ECDICT_PATH = path.resolve(__dirname, '..', 'data', 'ecdict.csv');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败：HTTP ${response.statusCode}`));
          response.resume();
          return;
        }

        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve(text));
      })
      .on('error', reject);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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

function buildDictionaryIndex() {
  if (!fs.existsSync(ECDICT_PATH)) {
    throw new Error(`缺少 ECDICT：${ECDICT_PATH}，请先运行 npm --prefix backend run dict:download`);
  }

  const rows = parseCsv(fs.readFileSync(ECDICT_PATH, 'utf8'));
  const headers = rows.shift();
  const wordIndex = headers.indexOf('word');
  const translationIndex = headers.indexOf('translation');
  const posIndex = headers.indexOf('pos');
  const result = new Map();

  for (const row of rows) {
    const word = (row[wordIndex] || '').trim().toLowerCase();
    const translation = row[translationIndex] || '';
    const fallbackPartOfSpeech = normalizePartOfSpeech((row[posIndex] || '').split('/')[0] || '');

    if (!word || !translation) {
      continue;
    }

    const meanings = [];

    for (const line of translation.split(/\\n|\n/)) {
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

    result.set(word, meanings);
  }

  return result;
}

function parseWordList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => /^[a-z][a-z/-]*$/.test(word))
    .filter((word) => !word.includes('/'));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置');
  }

  const dictionary = buildDictionaryIndex();
  const words = parseWordList(await fetchText(WORD_LIST_URL));
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
        '大学英语六级常见进阶词，按考试词表导入，并用 ECDICT 补充考试义项。',
        20,
      ],
    );
    const bookId = Number(bookResult.rows[0].id);

    for (const [index, word] of words.entries()) {
      const meanings = dictionary.get(word) || [];

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
