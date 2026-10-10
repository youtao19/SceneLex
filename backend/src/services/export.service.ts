import {
  collectUserExportRows,
  type UserExportRows,
} from '../repositories/export.repository';

/**
 * 版本号是给未来看的：改了导出结构就加一，拿到旧文件的人能据此判断
 * 是文件老还是自己记错了。结构只增不改，不删字段。
 */
const EXPORT_VERSION = 1;

/**
 * 导出文件里必须自带一句话说明它是什么。这个 JSON 会在用户的下载目录里放很久，
 * 到时没人记得它从哪来，也不知道里面为什么没有 API Key。
 */
const EXPORT_NOTICE = [
  'SceneLex 个人数据导出。',
  '不含登录凭据（密码、会话），也不含模型端点的 API Key 密文——那些离开服务器就没有意义。',
  '单词卡、词书、阅读文章、助手对话、学习设置与 OCR 记录均按原样给出，字段名与数据库一致。',
].join('');

export interface UserExportDocument {
  exportVersion: number;
  exportedAt: string;
  notice: string;
  account: unknown;
  words: unknown;
  wordBooks: unknown;
  wordBookItems: unknown;
  readingArticles: unknown;
  assistantChats: unknown;
  assistantMessages: unknown;
  learningSettings: unknown;
  endpoints: unknown;
  ocrBatches: unknown;
  ocrPages: unknown;
}

/**
 * 纯拼装，方便单测直接检查结构，不用连库。
 */
export function buildExportDocument(
  rows: UserExportRows,
  exportedAt: string,
): UserExportDocument {
  return {
    exportVersion: EXPORT_VERSION,
    exportedAt,
    notice: EXPORT_NOTICE,
    // 单行表取第一条；用户一定存在（会话刚验过），取不到就是空对象而不是崩。
    account: rows.profile[0] ?? {},
    words: rows.words,
    wordBooks: rows.wordBooks,
    wordBookItems: rows.wordBookItems,
    readingArticles: rows.readingArticles,
    assistantChats: rows.assistantChats,
    assistantMessages: rows.assistantMessages,
    learningSettings: rows.learningSettings,
    endpoints: rows.endpoints,
    ocrBatches: rows.ocrBatches,
    ocrPages: rows.ocrPages,
  };
}

/**
 * 文件名带日期，用户下载多次时不会互相覆盖（浏览器会自动加 (1)）。
 * 不含邮箱或昵称：下载文件名会出现在浏览器历史、同步目录和别人瞄一眼的屏幕上。
 */
export function buildExportFilename(exportedAt: string) {
  return `scenelex-export-${exportedAt.slice(0, 10)}.json`;
}

export const exportService = {
  async exportUserData(userId: number) {
    const rows = await collectUserExportRows(userId);
    const exportedAt = new Date().toISOString();

    return {
      filename: buildExportFilename(exportedAt),
      document: buildExportDocument(rows, exportedAt),
    };
  },
};
