import type { WordRecord } from '../types/word';

const wordRecords: WordRecord[] = [];

export function saveWordRecord(record: WordRecord) {
  wordRecords.unshift(record);
}

export function listWordRecords() {
  return wordRecords;
}

