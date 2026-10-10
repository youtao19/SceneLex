import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptsDir = path.resolve(__dirname, '..', 'scripts');

/**
 * 所有 CLI 脚本都必须经 load-env 读配置。
 *
 * 这条约定曾经在 6 个脚本里漂成 3 种写法：签密钥的两个脚本读的是 backend/.env，
 * 导入词书的读 .env.dev.local，导入词典的又内联了一份后端规则。结果是照 README
 * 建好 .env.dev.local 的新部署者，"服务跑得起来、签密钥的命令却报未配置"。
 *
 * 用文件内容断言钉住它，新增脚本再想自己 dotenv.config 就会在这里失败。
 */
function loadsDotenvDirectly(source: string) {
  return (
    source.includes("require('dotenv')") ||
    source.includes('require("dotenv")') ||
    source.includes('dotenv.config(')
  );
}

describe('CLI 脚本的配置加载', () => {
  it('没有脚本绕过 load-env 自行调用 dotenv', () => {
    const offenders = readdirSync(scriptsDir)
      .filter((name) => /\.(c|m)?(j|t)s$/.test(name) && name !== 'load-env.js')
      .filter((name) => loadsDotenvDirectly(readFileSync(path.join(scriptsDir, name), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('load-env 把 .env.dev.local 排在最前，与后端的读取顺序一致', () => {
    const { ENV_FILES } = require('../scripts/load-env') as { ENV_FILES: string[] };

    expect(path.basename(ENV_FILES[0])).toBe('.env.dev.local');
    expect(path.basename(path.dirname(ENV_FILES[0]))).toBe('backend');
  });
});
