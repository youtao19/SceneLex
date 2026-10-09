import { createHash } from 'node:crypto';
import { HttpError } from './http-error';

export const NEW_WORD_TARGET_MIN = 0;
export const NEW_WORD_TARGET_MAX = 200;
export const DEFAULT_NEW_WORD_TARGET = 20;

/**
 * 新词目标允许 0（表示只复习），上限 200；超范围直接拒绝，不悄悄截断。
 */
export function normalizeNewWordTarget(value: unknown): number {
  const target = Number(value);

  if (
    !Number.isInteger(target) ||
    target < NEW_WORD_TARGET_MIN ||
    target > NEW_WORD_TARGET_MAX
  ) {
    throw new HttpError(400, '每日新词目标必须是 0 到 200 之间的整数');
  }

  return target;
}

/**
 * 客户端操作 ID 是重试去重的唯一依据：同 ID 同内容返回原结果，同 ID 不同内容拒绝。
 * 长度下限用来挡住“随手传个空串当幂等键”的用法；返回 null 表示旧客户端没传。
 */
export function normalizeOperationId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'operationId 非法');
  }

  const operationId = value.trim();

  if (operationId.length < 8 || operationId.length > 128) {
    throw new HttpError(400, 'operationId 非法');
  }

  return operationId;
}

/**
 * 指纹必须和字段顺序无关，否则同一请求换个键顺序就会被当成不同操作而重复执行。
 */
export function buildOperationFingerprint(
  kind: string,
  payload: Record<string, unknown>,
): string {
  return createHash('sha256')
    .update(`${kind}:${stableStringify(payload)}`)
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/**
 * 双端冲突检测：客户端带上它看到的版本，版本不一致说明另一端已经改过这条记录。
 * 不传版本时按旧客户端处理、跳过校验 —— 这是兼容窗口，不是长期行为。
 */
export function assertExpectedVersion(
  currentVersion: number,
  expectedVersion: unknown,
): void {
  if (expectedVersion === undefined || expectedVersion === null) {
    return;
  }

  const expected = Number(expectedVersion);

  if (!Number.isInteger(expected) || expected < 0) {
    throw new HttpError(400, 'expectedVersion 非法');
  }

  if (expected !== currentVersion) {
    throw new HttpError(409, '这条记录已在其他端更新，请刷新后重试');
  }
}

/**
 * 到期总数不受队列限制影响：前端判断“今天还有没有复习”必须看总数，
 * 否则分页或数量限制会被误判成“无到期词”。
 */
export function applyDailyReviewLimit(
  dueTotal: number,
  limitEnabled: boolean,
  limit: number,
): number {
  if (!limitEnabled) {
    return dueTotal;
  }

  return Math.min(dueTotal, Math.max(0, limit));
}
