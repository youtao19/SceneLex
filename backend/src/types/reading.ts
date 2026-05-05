export interface ReadingWordLookupPayload {
  word: string;
  sentence: string;
}

export interface ReadingSentenceTranslatePayload {
  sentence: string;
}

export interface ReadingAssistantChat {
  id: number;
  title: string;
  articleContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingAssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CreateReadingAssistantChatPayload {
  content: string;
  title?: string;
}

export interface SendReadingAssistantMessagePayload {
  question: string;
}

export interface ReadingWordLookupResult {
  text: string;
}

export interface ReadingSentenceTranslateResult {
  text: string;
}
