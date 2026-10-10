const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function readArgValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);

  if (index === -1) {
    return '';
  }

  return args[index + 1] ?? '';
}

function readCommand() {
  return process.argv[2] ?? '';
}

function readEmail() {
  const email = readArgValue('--email').trim().toLowerCase();

  if (!email) {
    throw new Error('请通过 --email 传入用户邮箱，例如 --email user@example.com');
  }

  return email;
}

function readDays() {
  const days = Number.parseInt(readArgValue('--days'), 10);

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('请通过 --days 传入大于 0 的整数，例如 --days 30');
  }

  return days;
}

async function ensureUsersTable(pool) {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'users'
      LIMIT 1
    `,
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error('users 表不存在，请先启动一次后端完成数据库初始化');
  }
}

/**
 * 管理命令按邮箱改用户状态，先集中查一次，避免后续每个分支都重复判断用户是否存在。
 * 返回当前行，供需要看改前状态的分支（如降级前判断对方是否管理员）使用。
 */
async function ensureUserExists(pool, email) {
  const result = await pool.query(
    `
      SELECT
        id,
        email,
        role,
        access_status,
        access_expires_at
      FROM users
      WHERE email = $1
    `,
    [email],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`用户不存在: ${email}`);
  }

  return result.rows[0];
}

async function suspendUser(pool, email) {
  await ensureUserExists(pool, email);

  const result = await pool.query(
    `
      UPDATE users
      SET
        access_status = 'suspended',
        updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, access_status, access_expires_at
    `,
    [email],
  );

  return result.rows[0];
}

async function resumeUser(pool, email) {
  await ensureUserExists(pool, email);

  const result = await pool.query(
    `
      UPDATE users
      SET
        access_status = 'active',
        updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, access_status, access_expires_at
    `,
    [email],
  );

  return result.rows[0];
}

async function renewUser(pool, email, days) {
  await ensureUserExists(pool, email);

  const result = await pool.query(
    `
      UPDATE users
      SET
        access_expires_at = CASE
          WHEN access_expires_at > NOW()
            THEN access_expires_at + ($2::text || ' days')::interval
          ELSE NOW() + ($2::text || ' days')::interval
        END,
        access_status = 'active',
        updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, access_status, access_expires_at
    `,
    [email, days],
  );

  return result.rows[0];
}

/**
 * 提权为管理员。这是新库唯一的引导入口：改角色的管理接口本身要求调用者已经是管理员，
 * 所以第一个管理员只能从这里产生。重复执行是幂等的。
 */
async function promoteUser(pool, email) {
  await ensureUserExists(pool, email);

  const result = await pool.query(
    `
      UPDATE users
      SET
        role = 'admin',
        updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, access_status, access_expires_at
    `,
    [email],
  );

  return result.rows[0];
}

/**
 * 降回普通用户。必须留住至少一个管理员，否则没人再能进管理页签发访问密钥，
 * 只能回到这台机器用脚本救场。
 */
async function demoteUser(pool, email) {
  const target = await ensureUserExists(pool, email);

  if (target.role === 'admin') {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`,
    );

    if (result.rows[0].count <= 1) {
      throw new Error('这是最后一个管理员，降级后将没有人能再进入管理页');
    }
  }

  const result = await pool.query(
    `
      UPDATE users
      SET
        role = 'user',
        updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, access_status, access_expires_at
    `,
    [email],
  );

  return result.rows[0];
}

function printResult(action, row) {
  console.log(`Action: ${action}`);
  console.log(`Email: ${row.email}`);
  console.log(`Role: ${row.role}`);
  console.log(`Status: ${row.access_status}`);
  console.log(`Expires at: ${new Date(row.access_expires_at).toISOString()}`);
}

async function main() {
  const command = readCommand();
  const databaseUrl = process.env.DATABASE_URL ?? '';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法执行用户授权管理命令');
  }

  if (!['suspend', 'resume', 'renew', 'promote', 'demote'].includes(command)) {
    throw new Error('命令非法，只支持 suspend / resume / renew / promote / demote');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    await ensureUsersTable(pool);

    const email = readEmail();

    if (command === 'suspend') {
      printResult(command, await suspendUser(pool, email));
      return;
    }

    if (command === 'resume') {
      printResult(command, await resumeUser(pool, email));
      return;
    }

    if (command === 'promote') {
      printResult(command, await promoteUser(pool, email));
      return;
    }

    if (command === 'demote') {
      printResult(command, await demoteUser(pool, email));
      return;
    }

    printResult(command, await renewUser(pool, email, readDays()));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${message}\n`);
  process.exit(1);
});
