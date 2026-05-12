import postgres from 'postgres';

/**
 * Cloudflare Worker 不能跨请求复用 socket-backed client，否则会触发 different request I/O。
 */
export function getSql(env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('HYPERDRIVE binding is not configured');
  }

  return postgres(env.HYPERDRIVE.connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 1,
  });
}
