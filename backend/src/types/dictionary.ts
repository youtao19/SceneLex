export interface DictionaryMeaning {
  partOfSpeech: string;
  meaning: string;
}

export interface DictionaryEntry {
  word: string;
  phonetic: string;
  meanings: DictionaryMeaning[];
}
