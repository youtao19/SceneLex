import type { HistoryRecord } from '../models/history.model';

const historyRecords: HistoryRecord[] = [
  {
    id: 'history-1',
    word: 'vivid',
    createdAt: new Date().toISOString(),
  },
];

export function listHistoryRecords() {
  return historyRecords;
}

