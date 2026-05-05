const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.resolve(__dirname, '..', 'data');
const sourcePath = process.env.DICTIONARY_CSV_PATH
  ? path.resolve(process.env.DICTIONARY_CSV_PATH)
  : path.join(dataDir, 'ecdict.csv');
const targetPath = process.env.DICTIONARY_JSON_PATH
  ? path.resolve(process.env.DICTIONARY_JSON_PATH)
  : path.join(dataDir, 'ecdict.compact.json');

/**
 * CSV 里会有带换行的 quoted field，不能按行 split。
 */
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

/**
 * ECDICT 的 pos 可能是 n/vt/vi，这里保留及物/不及物区别，避免义项来源失真。
 */
function normalizePartOfSpeech(value) {
  const text = value.trim().toLowerCase().replace(/\.$/, '');

  if (!text) {
    return '';
  }

  const map = {
    n: 'n.',
    noun: 'n.',
    v: 'v.',
    vi: 'vi.',
    vt: 'vt.',
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

/**
 * ECDICT 的 translation 一行一个义项，保留顺序能让常见释义排在前面。
 */
function buildMeanings(row) {
  const posItems = row.pos
    .split('/')
    .map(normalizePartOfSpeech)
    .filter(Boolean);
  const fallbackPartOfSpeech = posItems[0] ?? '词性';
  const result = [];
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
 * 只读取业务需要的列，避免把 ECDICT 的扩展字段带进运行时缓存。
 */
function mapEcdictRow(headers, values) {
  const getValue = (name) => {
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
    definition: getValue('definition'),
    translation,
    pos: getValue('pos'),
  };
}

/**
 * 英文释义只作为模型上下文，不参与用户可见释义排序。
 */
function buildDefinitions(row) {
  return row.definition
    .split(/\\n|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 生成运行时只需要的精简词典，减少启动时 CSV 解析成本。
 */
function buildDictionaryCache() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`ECDICT CSV 不存在：${sourcePath}`);
    process.exit(1);
  }

  const startedAt = Date.now();
  const rows = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
  const headers = rows[0] ?? [];
  const entries = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = mapEcdictRow(headers, rows[i]);

    if (!row) {
      continue;
    }

    const meanings = buildMeanings(row);

    if (meanings.length === 0) {
      continue;
    }

    entries.push([
      row.word,
      row.phonetic,
      buildDefinitions(row),
      meanings.map((item) => [item.partOfSpeech, item.meaning]),
    ]);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    JSON.stringify({
      version: 1,
      source: sourcePath,
      generatedAt: new Date().toISOString(),
      entries,
    }),
  );

  console.log(
    `词典缓存已生成：${targetPath}，${entries.length} entries，${Date.now() - startedAt}ms`,
  );
}

buildDictionaryCache();
