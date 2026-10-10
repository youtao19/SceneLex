import { env } from '../config/env'
import { HttpError } from '../utils/http-error'
import { getLearningDay } from '../utils/learning-day'
import {
  findSystemUsageCalls,
  incrementModelUsage,
  listUserUsageOverview,
} from '../repositories/model-usage.repository'
import type { AiEndpoint } from '../types/endpoint'
import type {
  AdminUsageOverview,
  ModelUsageLimits,
  ModelUsageSource,
  ModelUsageTokens,
} from '../types/model-usage'

/**
 * 配额和「今天的单词」用同一个学习日，否则一天会有两个重置时刻，
 * 用户看到的「今天用了多少」和真正生效的限制会对不上。
 * 「本月」同样从学习日推出来，月初的第一秒不会和多出来的那 4 小时打架。
 */
export function readUsagePeriod(now: Date) {
  const usageDate = getLearningDay(now)

  return { usageDate, monthStart: `${usageDate.slice(0, 8)}01` }
}

/**
 * 配额判定的全部规则都在这个纯函数里：上限是「允许的次数」，
 * 所以刚好用完最后一次就算超额，第 N+1 次会被挡住。
 * 返回 null 表示还能继续调用。
 */
export function buildQuotaMessage(
  counts: { todayCalls: number; monthCalls: number },
  limits: ModelUsageLimits,
): string | null {
  // 0 表示不限，是管理员明确的开关，不是漏配。
  if (limits.dailyCalls > 0 && counts.todayCalls >= limits.dailyCalls) {
    return `今天的系统端点额度已用完（每天 ${limits.dailyCalls} 次）。可以在设置里添加自己的模型端点，或明天再试。`
  }

  if (limits.monthlyCalls > 0 && counts.monthCalls >= limits.monthlyCalls) {
    return `本月的系统端点额度已用完（每月 ${limits.monthlyCalls} 次）。可以在设置里添加自己的模型端点，或联系管理员。`
  }

  return null
}

/**
 * 系统端点的调用由管理员出钱，所以单独计数并受配额约束；
 * 用户自己配的端点花的是他自己的钱，只记账、不限制。
 */
export function readUsageSource(endpoint: AiEndpoint): ModelUsageSource {
  // trusted 是系统端点唯一的标志，见 system-endpoint.repository.ts。
  return endpoint.trusted ? 'system' : 'user'
}

export function readModelUsageLimits(): ModelUsageLimits {
  return {
    dailyCalls: env.systemEndpointDailyCallLimit,
    monthlyCalls: env.systemEndpointMonthlyCallLimit,
  }
}

/**
 * 模型调用前的最后一道闸。放在真正发起请求的前一刻，而不是解析端点时：
 * 词卡命中系统缓存根本不会调模型，那种请求不该被配额拦住。
 */
export async function assertModelCallAllowed(
  userId: number,
  endpoint: AiEndpoint,
  now = new Date(),
) {
  if (readUsageSource(endpoint) !== 'system') {
    return
  }

  const { usageDate, monthStart } = readUsagePeriod(now)
  const counts = await findSystemUsageCalls(userId, usageDate, monthStart)
  const message = buildQuotaMessage(counts, readModelUsageLimits())

  if (message) {
    throw new HttpError(429, message)
  }
}

/**
 * 调用成功后记账。记账失败不能把已经拿到的回答变成错误——用户看到的是
 * 「模型回答失败」，实际只是我们少记了一笔，所以这里只记日志。
 */
export async function recordModelCall(
  userId: number,
  endpoint: AiEndpoint,
  tokens: ModelUsageTokens,
  now = new Date(),
) {
  try {
    const { usageDate } = readUsagePeriod(now)

    await incrementModelUsage(userId, usageDate, readUsageSource(endpoint), tokens)
  } catch (error) {
    console.error('[usage] 记录模型用量失败：', error)
  }
}

export async function readUsageOverview(): Promise<AdminUsageOverview> {
  const { usageDate, monthStart } = readUsagePeriod(new Date())

  return {
    usageDate,
    limits: readModelUsageLimits(),
    users: await listUserUsageOverview(usageDate, monthStart),
  }
}
