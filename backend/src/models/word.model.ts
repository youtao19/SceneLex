export interface WordMeaningItem {
  meaning: string;
  example: string;
  tip: string;
}

export interface WordModel {
  word: string;
  scene: string;
  meanings: WordMeaningItem[];
}
