export interface ReadingWordLookupPayload {
  word: string;
  sentence: string;
}

export interface ReadingSentenceTranslatePayload {
  sentence: string;
}

export interface ReadingWordLookupResult {
  text: string;
}

export interface ReadingSentenceTranslateResult {
  text: string;
}
