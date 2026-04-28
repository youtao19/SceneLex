import type { PoolClient } from 'pg';
import type { AccessKeyGrant } from '../types/auth';

interface AccessKeyRow {
  id: string;
  granted_days: number;
  max_uses: number;
  used_count: number;
}

function mapAccessKeyRow(row: AccessKeyRow): AccessKeyGrant {
  return {
    id: Number(row.id),
    grantedDays: Number(row.granted_days),
    maxUses: Number(row.max_uses),
    usedCount: Number(row.used_count),
  };
}

/**
 * 注册时要锁住注册码行，避免同一个 key 被并发注册消费两次。
 */
export async function findAccessKeyForUpdate(
  client: PoolClient,
  keyHash: string,
) {
  const result = await client.query<AccessKeyRow>(
    `
      SELECT
        id,
        granted_days,
        max_uses,
        used_count
      FROM access_keys
      WHERE key_hash = $1
        AND status = 'active'
      FOR UPDATE
    `,
    [keyHash],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAccessKeyRow(result.rows[0]);
}

/**
 * 一人一码默认消费后即失效，但保留计数和绑定关系，后面查审计时不会丢上下文。
 */
export async function consumeAccessKey(
  client: PoolClient,
  accessKeyId: number,
  userId: number,
) {
  await client.query(
    `
      UPDATE access_keys
      SET
        used_count = used_count + 1,
        status = CASE
          WHEN used_count + 1 >= max_uses THEN 'used'
          ELSE status
        END,
        bound_user_id = $2,
        used_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [accessKeyId, userId],
  );
}
