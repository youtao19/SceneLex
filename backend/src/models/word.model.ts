export interface WordMeaningItem {
  partOfSpeech: string;
  meaning: string;
  example: string;
  tip: string;
}

export interface WordModel {
  word: string;
  scene: string;
  meanings: WordMeaningItem[];
}
