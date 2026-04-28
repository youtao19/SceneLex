import { getHistoryArchive } from '../repositories/history.repository';

/**
 * service 层保留用户参数，避免 controller 之外的调用绕过用户隔离。
 */
export async function getHistory(userId: number) {
  return getHistoryArchive(userId);
}
