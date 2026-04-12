export interface WordMeaningItem {
  partOfSpeech: string;
  meaning: string;
  example: string;
  tip: string;
}

export interface WordPayload {
  word: string;
}

export interface WordRecord {
  word: string;
  scene: string;
  meanings: WordMeaningItem[];
}
