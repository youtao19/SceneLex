const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.resolve(__dirname, '..', '.env.dev.local'),
  });
}

const databaseUrl = process.env.DATABASE_URL;
const sourcePath = process.env.DICTIONARY_JSON_PATH
  ? path.resolve(process.env.DICTIONARY_JSON_PATH)
  : path.resolve(__dirname, '..', 'data', 'ecdict.compact.json');
const batchSize = Number(process.env.DICTIONARY_IMPORT_BATCH_SIZE ?? 500);

function readEntries() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`词典缓存不存在：${sourcePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

  if (!Array.isArray(raw.entries)) {
    throw new Error(`词典缓存格式不正确：${sourcePath}`);
  }

  return raw.entries;
}

function mapEntry(entry) {
  if (!Array.isArray(entry)) {
    return null;
  }

  const [word, phonetic, definitions, rawMeanings] = entry;

  if (typeof word !== 'string' || !word) return null;
  if (!Array.isArray(definitions) || !Array.isArray(rawMeanings)) return null;

  const meanings = rawMeanings
    .map((item) => {
      if (!Array.isArray(item)) return null;

      const [partOfSpeech, meaning] = item;

      return typeof partOfSpeech === 'string' && typeof meaning === 'string'
        ? { partOfSpeech, meaning }
        : null;
    })
    .filter(Boolean);

  if (meanings.length === 0) {
    return null;
  }

  return {
    word: word.toLowerCase(),
    phonetic: typeof phonetic === 'string' ? phonetic : '',
    definitions: definitions.filter((item) => typeof item === 'string'),
    meanings,
  };
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      word TEXT PRIMARY KEY,
      phonetic TEXT NOT NULL DEFAULT '',
      definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
      meanings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function insertBatch(client, rows) {
  const placeholders = [];
  const values = [];

  rows.forEach((row, index) => {
    const start = index * 4;
    placeholders.push(
      `($${start + 1}, $${start + 2}, $${start + 3}::jsonb, $${start + 4}::jsonb)`,
    );
    values.push(
      row.word,
      row.phonetic,
      JSON.stringify(row.definitions),
      JSON.stringify(row.meanings),
    );
  });

  await client.query(
    `
      INSERT INTO dictionary_entries (word, phonetic, definitions, meanings)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (word)
      DO UPDATE SET
        phonetic = EXCLUDED.phonetic,
        definitions = EXCLUDED.definitions,
        meanings = EXCLUDED.meanings,
        updated_at = NOW()
    `,
    values,
  );
}

async function importDictionary() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法导入词典');
  }

  const startedAt = Date.now();
  const entries = readEntries();
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  let imported = 0;
  let batch = [];

  try {
    await ensureTable(client);

    for (const entry of entries) {
      const row = mapEntry(entry);

      if (!row) {
        continue;
      }

      batch.push(row);

      if (batch.length >= batchSize) {
        await insertBatch(client, batch);
        imported += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await insertBatch(client, batch);
      imported += batch.length;
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`词典已导入数据库：${imported} entries，${Date.now() - startedAt}ms`);
}

importDictionary().catch((error) => {
  console.error(error);
  process.exit(1);
});
