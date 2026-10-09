/**
 * 学习日固定按北京时间 04:00 划分，不跟随服务器或手机所在时区。
 *
 * 北京时间 = UTC+8，所以学习日 = (UTC 时刻 + 4 小时) 的日期。
 * SQL 侧用 LEARNING_DAY_SQL，两边算的是同一件事，改一个必须改另一个。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const LEARNING_DAY_START_HOUR = 4;

export const LEARNING_DAY_SQL = `((NOW() AT TIME ZONE 'Asia/Shanghai') - INTERVAL '${LEARNING_DAY_START_HOUR} hours')::date`;

/**
 * 只用 UTC 取值：先把时刻偏移到学习日边界，再取日期，
 * 用本地时区取值会按服务器时区二次偏移。
 */
export function getLearningDay(now: Date): string {
  const shifted = new Date(
    now.getTime() + BEIJING_OFFSET_MS - LEARNING_DAY_START_HOUR * 60 * 60 * 1000,
  );

  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
