const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readArgValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);

  if (index === -1) {
    return '';
  }

  return args[index + 1] ?? '';
}

/**
 * 生成给人看的注册码时去掉易混字符，管理员手动复制和口述时更不容易出错。
 */
function generateAccessKey() {
  const bytes = crypto.randomBytes(16);
  let raw = '';

  for (let i = 0; i < bytes.length; i += 1) {
    raw += ALPHABET[bytes[i] % ALPHABET.length];
  }

  const segments = [];

  for (let i = 0; i < raw.length; i += 4) {
    segments.push(raw.slice(i, i + 4));
  }

  return `SLX-${segments.join('-')}`;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function readGrantedDays() {
  const raw = readArgValue('--days');
  const days = Number.parseInt(raw, 10);

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('请通过 --days 传入大于 0 的整数，例如 --days 30');
  }

  return days;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? '';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法创建访问密钥');
  }

  const grantedDays = readGrantedDays();
  const note = readArgValue('--note');
  const accessKey = generateAccessKey();
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    const schemaCheck = await pool.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'access_keys'
        LIMIT 1
      `,
    );

    if ((schemaCheck.rowCount ?? 0) === 0) {
      throw new Error('access_keys 表不存在，请先启动一次后端完成数据库初始化');
    }

    const result = await pool.query(
      `
        INSERT INTO access_keys (
          key_hash,
          status,
          granted_days,
          max_uses,
          used_count,
          note
        )
        VALUES ($1, 'active', $2, 1, 0, $3)
        RETURNING id, created_at
      `,
      [hashKey(accessKey), grantedDays, note],
    );

    const createdAt = new Date(result.rows[0].created_at).toISOString();

    console.log(`Access key created: ${accessKey}`);
    console.log(`Granted days: ${grantedDays}`);
    console.log(`Created at: ${createdAt}`);

    if (note) {
      console.log(`Note: ${note}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${message}\n`);
  process.exit(1);
});
