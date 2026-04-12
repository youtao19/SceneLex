import { listHistoryRecords } from '../repositories/history.repository';

export async function getHistory() {
  return Promise.resolve(listHistoryRecords());
}

