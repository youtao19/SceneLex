/**
 * 模型用量相关的类型。
 *
 * 记账只记两件事：调用了几次、上游报了多少 token。配额按次数判定，
 * 因为 token 数取决于上游愿不愿意回传（流式响应尤其不一定），
 * 而次数是每次调用都确定知道的。
 */

/** user = 用户自己配的端点；system = 管理员出钱的系统端点。 */
export type ModelUsageSource = 'user' | 'system';

export interface ModelUsageTokens {
  promptTokens: number;
  completionTokens: number;
}

/** 0 表示不限。两项都只约束系统端点的调用。 */
export interface ModelUsageLimits {
  dailyCalls: number;
  monthlyCalls: number;
}

export interface AdminUserUsage {
  userId: number;
  email: string;
  nickname: string;
  /** 当天全部端点（含用户自己的）的调用次数。 */
  todayCalls: number;
  todayTokens: number;
  /** 本月系统端点的调用——这是要盯的那个数，它决定管理员这个月掏多少钱。 */
  monthSystemCalls: number;
  monthSystemTokens: number;
}

export interface AdminUsageOverview {
  /** 统计口径是学习日（北京时间 04:00 换日），把这个日期回传给页面显示。 */
  usageDate: string;
  limits: ModelUsageLimits;
  users: AdminUserUsage[];
}
