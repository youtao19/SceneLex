const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { loadEnv, readDatabaseUrl } = require('./load-env');

loadEnv();

/**
 * 三本考试词书的元数据必须与 src/config/database.ts 的种子逐字一致。
 * 两边都 upsert system_word_books，字段只要有一处不同，每次重启就会互相改回去。
 *
 * 数据源是仓库里的 <code>-word-list.json，不是 data/import-*.sql：
 * 那些 SQL 是同一个词表导出的产物，两处并存迟早对不上。
 */
const BOOKS = [
  {
    code: 'cet6',
    name: '六级核心词',
    description: '大学英语六级常见进阶词，适合在四级基础上继续扩展。',
    sortOrder: 20,
  },
  {
    code: 'tem4',
    name: '专四核心词',
    description: '英语专业四级基础核心词，兼顾语言学术表达和常用语义辨析。',
    sortOrder: 40,
  },
  {
    code: 'tem8',
    name: '专八核心词',
    description: '英语专业八级进阶词，适合高阶阅读、翻译和写作积累。',
    sortOrder: 50,
  },
];

/**
 * 一批一次往返。专八 12000 词逐行插要走 SSH 隧道十几分钟，
 * 而这条命令通常就是在开发机上对着线上库跑的。
 */
const BATCH_SIZE = 500;

/** 每 50 词一个单元，与 data/import-*.sql 的 Unit 划分保持一致。 */
const WORDS_PER_UNIT = 50;

function readArgValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] ?? '' : '';
}

/**
 * 不传 --book 就导全部三本——新环境一条命令装完词书走的是这条路径。
 */
function readBooks() {
  const requested = readArgValue('--book').trim().toLowerCase();

  if (!requested || requested === 'all') {
    return BOOKS;
  }

  const book = BOOKS.find((item) => item.code === requested);

  if (!book) {
    const available = BOOKS.map((item) => item.code).join(' / ');
    throw new Error(`未知词书: ${requested}。可选 ${available}，或不传 --book 导入全部`);
  }

  return [book];
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

/**
 * 释义只取前三条：词卡上放不下更多，后面那些 [计]/[医] 的专业义项
 * 在考试语境里基本用不上，留着反而稀释重点。
 */
function parseExamMeanings(translation, fallbackPos) {
  if (!translation) {
    return [];
  }

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

function loadWordList(book) {
  const jsonPath = path.resolve(__dirname, '..', 'data', `${book.code}-word-list.json`);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`缺少词表 JSON：${jsonPath}`);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (!Array.isArray(data.wordList)) {
    throw new Error(`JSON 格式错误，缺少 wordList 数组：${jsonPath}`);
  }

  return data.wordList;
}

function buildRows(book, words) {
  const rows = [];

  for (const [index, item] of words.entries()) {
    const word = (item.value || '').trim().toLowerCase();

    if (!word) {
      continue;
    }

    rows.push({
      word,
      orderIndex: index + 1,
      unit: `Unit ${Math.floor(index / WORDS_PER_UNIT) + 1}`,
      difficulty: book.code,
      meanings: parseExamMeanings(item.translation || '', item.pos || ''),
    });
  }

  return rows;
}

/**
 * 拼一条多行 INSERT：book_id 固定占 $1，其余按行顺序展开，
 * 省掉逐行往返而不用引入 COPY 那套流式接口。
 */
function buildBatchInsert(bookId, rows) {
  const params = [bookId];

  const tuples = rows.map((row) => {
    const at = params.length;
    params.push(row.word, row.orderIndex, row.unit, row.difficulty, JSON.stringify(row.meanings));

    return `($1, $${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}::jsonb)`;
  });

  return {
    text: `
      INSERT INTO system_word_book_items (
        book_id,
        word,
        order_index,
        unit,
        difficulty,
        exam_meanings
      )
      VALUES ${tuples.join(', ')}
      ON CONFLICT (book_id, word)
      DO UPDATE SET
        order_index = EXCLUDED.order_index,
        unit = EXCLUDED.unit,
        difficulty = EXCLUDED.difficulty,
        exam_meanings = EXCLUDED.exam_meanings,
        updated_at = NOW()
    `,
    params,
  };
}

async function importBook(client, book) {
  const rows = buildRows(book, loadWordList(book));

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
    [book.code, book.name, book.description, book.sortOrder],
  );
  const bookId = Number(bookResult.rows[0].id);

  // 先清空再写入：词表里被删掉的词必须跟着消失，否则旧词会一直留在书里。
  await client.query('DELETE FROM system_word_book_items WHERE book_id = $1', [bookId]);

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const statement = buildBatchInsert(bookId, batch);
    await client.query(statement.text, statement.params);
  }

  return rows.length;
}

async function main() {
  const books = readBooks();
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  const client = await pool.connect();

  try {
    // 一次事务覆盖全部词书：中途失败就整体回滚，不会留下半本书。
    await client.query('BEGIN');

    for (const book of books) {
      const count = await importBook(client, book);
      console.log(`${book.code} 导入完成：${count} 个词`);
    }

    await client.query('COMMIT');
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
