/**
 * 操作 ID 用于服务端重试去重：同一次点击必须复用同一个值，重试才不会重复写。
 * crypto.randomUUID 只在安全上下文（https / localhost）可用，内网 http 下退回随机串。
 */
export function createOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `op-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
