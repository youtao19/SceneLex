import postgres from 'postgres';

let sql;

export function getSql(env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('HYPERDRIVE binding is not configured');
  }

  if (!sql) {
    sql = postgres(env.HYPERDRIVE.connectionString, { prepare: false });
  }

  return sql;
}
