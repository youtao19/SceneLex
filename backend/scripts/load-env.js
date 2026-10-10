const path = require('path');
const dotenv = require('dotenv');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

/**
 * CLI 脚本必须和后端（src/config/env.ts）读同一份配置，否则会出现
 * "服务跑得起来、脚本却报 DATABASE_URL 未配置"——密钥是在界面里用的，
 * 出问题的偏偏是签密钥的那条命令。
 *
 * 后端非生产环境只读 backend/.env.dev.local；脚本这里不去按 NODE_ENV 分叉，
 * 因为脚本总是在操作者的交互式 shell 里跑，那里没有 PM2 注入的 NODE_ENV，
 * 一旦按它分叉就会在生产机器上静默读不到任何文件。
 *
 * dotenv 默认不覆盖已存在的变量，所以顺序即优先级：
 *   process.env（PM2/systemd 注入） > .env.dev.local > backend/.env > 根目录 .env
 * 后两项只为兼容既有部署，新配置一律写 .env.dev.local。
 */
const ENV_FILES = [
  path.resolve(BACKEND_ROOT, '.env.dev.local'),
  path.resolve(BACKEND_ROOT, '.env'),
  path.resolve(REPO_ROOT, '.env'),
];

/**
 * 按顺序加载配置文件，返回实际读到的文件路径，供调用方在出错时说明信息来源。
 */
function loadEnv() {
  const loaded = [];

  for (const file of ENV_FILES) {
    const result = dotenv.config({ path: file, quiet: true });

    if (!result.error) {
      loaded.push(file);
    }
  }

  return loaded;
}

/**
 * 取数据库连接串。缺失时把查找过的路径全部列出来——只说"未配置"的话，
 * 新部署者不知道该往哪个文件里写。
 */
function readDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? '';

  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error(
    [
      'DATABASE_URL 未配置，无法连接数据库。',
      '请把 DATABASE_URL 写进下面任一文件（按优先级排列）：',
      ...ENV_FILES.map((file) => `  - ${file}`),
      '推荐 backend/.env.dev.local，字段含义见 backend/.env 模板。',
    ].join('\n'),
  );
}

module.exports = { ENV_FILES, loadEnv, readDatabaseUrl };
