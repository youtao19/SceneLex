const fs = require('node:fs');
const path = require('node:path');

const JSON_PATH = path.resolve(__dirname, '..', 'data', 'cet6-word-list.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'import-cet6.sql');

function normalizePartOfSpeech(value) {
  const text = value.trim().toLowerCase().replace(/\.$/, '');
  const map = {
    n: 'n.', v: 'v.', vi: 'vi.', vt: 'vt.', adj: 'adj.', a: 'adj.', adv: 'adv.',
    prep: 'prep.', pron: 'pron.', conj: 'conj.', num: 'num.',
  };
  return map[text] || (text ? `${text}.` : '词性');
}

function splitMeaningLine(line, fallbackPartOfSpeech) {
  const text = line.trim();
  if (!text) return null;
  const match = text.match(/^([a-zA-Z]{1,6}\.)\s*(.+)$/);
  if (!match) {
    const bracketMatch = text.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (bracketMatch && fallbackPartOfSpeech === '词性') {
      return { partOfSpeech: `[${bracketMatch[1]}]`, meaning: bracketMatch[2].trim() };
    }
    return { partOfSpeech: fallbackPartOfSpeech, meaning: text };
  }
  return { partOfSpeech: normalizePartOfSpeech(match[1]), meaning: match[2].trim() };
}

function parseExamMeanings(translation, fallbackPos) {
  if (!translation) return [];
  const lines = translation.split(/\\n|\n/);
  const meanings = [];
  const fallbackPartOfSpeech = normalizePartOfSpeech((fallbackPos || '').split('/')[0] || '');
  for (const line of lines) {
    const meaning = splitMeaningLine(line, fallbackPartOfSpeech);
    if (!meaning || meanings.some(item => item.meaning === meaning.meaning)) continue;
    meanings.push({ ...meaning, priority: meanings.length + 1 });
    if (meanings.length >= 3) break;
  }
  return meanings;
}

function escapeSqlString(str) {
  if (str == null) return 'NULL';
  return "'" + String(str).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`缺少六级单词表 JSON：${JSON_PATH}`);
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.wordList)) {
    throw new Error('JSON 格式错误：缺少 wordList 数组');
  }

  const words = data.wordList;
  const lines = [];

  lines.push('-- 六级词书替换脚本');
  lines.push('-- 单词数量：' + words.length);
  lines.push('BEGIN;');
  lines.push('');

  // 1. 确保表结构
  lines.push(`ALTER TABLE system_word_book_items ADD COLUMN IF NOT EXISTS exam_meanings JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  lines.push('');

  // 2. 插入/更新词书
  lines.push(`INSERT INTO system_word_books (code, name, description, sort_order)`);
  lines.push(`VALUES ('cet6', '六级核心词', '大学英语六级核心词汇，共 ${words.length} 词，从用户上传词表导入。', 20)`);
  lines.push(`ON CONFLICT (code)`);
  lines.push(`DO UPDATE SET`);
  lines.push(`  name = EXCLUDED.name,`);
  lines.push(`  description = EXCLUDED.description,`);
  lines.push(`  sort_order = EXCLUDED.sort_order,`);
  lines.push(`  updated_at = NOW()`);
  lines.push(`RETURNING id;`);
  lines.push('');

  // 3. 删除旧数据（用子查询获取 book_id）
  lines.push(`DELETE FROM system_word_book_items WHERE book_id = (SELECT id FROM system_word_books WHERE code = 'cet6');`);
  lines.push('');

  // 4. 批量插入新数据
  lines.push(`INSERT INTO system_word_book_items (book_id, word, order_index, unit, difficulty, exam_meanings)`);
  lines.push(`SELECT`);
  lines.push(`  (SELECT id FROM system_word_books WHERE code = 'cet6') AS book_id,`);
  lines.push(`  word, order_index, unit, difficulty, exam_meanings::jsonb`);
  lines.push(`FROM (VALUES`);

  const values = [];
  for (const [index, item] of words.entries()) {
    const word = (item.value || '').trim().toLowerCase();
    if (!word) continue;

    const meanings = parseExamMeanings(item.translation || '', item.pos || '');
    const unit = `Unit ${Math.floor(index / 50) + 1}`;
    const json = JSON.stringify(meanings);

    values.push(`  (${escapeSqlString(word)}, ${index + 1}, ${escapeSqlString(unit)}, 'cet6', ${escapeSqlString(json)})`);
  }

  lines.push(values.join(',\n'));
  lines.push(`) AS t(word, order_index, unit, difficulty, exam_meanings)`);
  lines.push(`ON CONFLICT (book_id, word)`);
  lines.push(`DO UPDATE SET`);
  lines.push(`  order_index = EXCLUDED.order_index,`);
  lines.push(`  unit = EXCLUDED.unit,`);
  lines.push(`  difficulty = EXCLUDED.difficulty,`);
  lines.push(`  exam_meanings = EXCLUDED.exam_meanings,`);
  lines.push(`  updated_at = NOW();`);
  lines.push('');
  lines.push('COMMIT;');

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');
  console.log(`SQL 文件生成完成：${OUTPUT_PATH}`);
  console.log(`单词数量：${values.length}`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
