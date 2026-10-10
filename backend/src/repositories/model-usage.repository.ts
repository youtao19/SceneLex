import { query } from '../config/database';
import type {
  AdminUserUsage,
  ModelUsageSource,
  ModelUsageTokens,
} from '../types/model-usage';

interface SystemUsageRow {
  today_calls: string;
  month_calls: string;
}

interface UsageOverviewRow {
  user_id: string;
  email: string;
  nickname: string;
  today_calls: string;
  today_tokens: string;
  month_system_calls: string;
  month_system_tokens: string;
}

/**
 * PostgreSQL 的 SUM 返回 bigint，驱动给的是字符串；这里统一收口成数字。
 */
function readCount(value: string | number | null) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 同一天同一来源只有一行，所以用 upsert 累加而不是先查后写：
 * 两个请求同时回来时，先查后写会丢掉其中一次计数。
 */
export async function incrementModelUsage(
  userId: number,
  usageDate: string,
  source: ModelUsageSource,
  tokens: ModelUsageTokens,
): Promise<void> {
  await query(
    `
      INSERT INTO model_usage_daily (user_id, usage_date, source, calls, prompt_tokens, completion_tokens)
      VALUES ($1, $2, $3, 1, $4, $5)
      ON CONFLICT (user_id, usage_date, source)
      DO UPDATE SET
        calls = model_usage_daily.calls + 1,
        prompt_tokens = model_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
        completion_tokens = model_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
        updated_at = NOW()
    `,
    [userId, usageDate, source, tokens.promptTokens, tokens.completionTokens],
  );
}

/**
 * 配额判定只关心系统端点的调用次数。
 * 一天一行，所以「本月」是扫这个用户本月的几十行，不是扫调用日志。
 */
export async function findSystemUsageCalls(
  userId: number,
  usageDate: string,
  monthStart: string,
): Promise<{ todayCalls: number; monthCalls: number }> {
  const result = await query<SystemUsageRow>(
    `
      SELECT
        COALESCE(SUM(calls) FILTER (WHERE usage_date = $2), 0) AS today_calls,
        COALESCE(SUM(calls), 0) AS month_calls
      FROM model_usage_daily
      WHERE user_id = $1 AND source = 'system' AND usage_date >= $3
    `,
    [userId, usageDate, monthStart],
  );

  const row = result.rows[0];

  return {
    todayCalls: readCount(row?.today_calls),
    monthCalls: readCount(row?.month_calls),
  };
}

/**
 * 管理页要看的是「谁在花我的钱」，所以按本月系统调用倒序，
 * 一次都没用过的人排在后面。
 *
 * 连接条件里就写死 usage_date >= 月初：这样 SELECT 里两个 FILTER
 * 分别取「今天」和「本月系统」，不需要为两种口径扫两遍表。
 */
export async function listUserUsageOverview(
  usageDate: string,
  monthStart: string,
): Promise<AdminUserUsage[]> {
  const result = await query<UsageOverviewRow>(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.nickname,
        COALESCE(SUM(m.calls) FILTER (WHERE m.usage_date = $1), 0) AS today_calls,
        COALESCE(SUM(m.prompt_tokens + m.completion_tokens) FILTER (WHERE m.usage_date = $1), 0) AS today_tokens,
        COALESCE(SUM(m.calls) FILTER (WHERE m.source = 'system'), 0) AS month_system_calls,
        COALESCE(SUM(m.prompt_tokens + m.completion_tokens) FILTER (WHERE m.source = 'system'), 0) AS month_system_tokens
      FROM users u
      LEFT JOIN model_usage_daily m
        ON m.user_id = u.id AND m.usage_date >= $2
      GROUP BY u.id, u.email, u.nickname
      ORDER BY month_system_calls DESC, today_calls DESC, u.id ASC
    `,
    [usageDate, monthStart],
  );

  return result.rows.map((row) => ({
    userId: readCount(row.user_id),
    email: row.email,
    nickname: row.nickname,
    todayCalls: readCount(row.today_calls),
    todayTokens: readCount(row.today_tokens),
    monthSystemCalls: readCount(row.month_system_calls),
    monthSystemTokens: readCount(row.month_system_tokens),
  }));
}
