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
  articleId: number | null;
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
  articleId?: number | null;
}

export interface SendReadingAssistantMessagePayload {
  question: string;
  questionMode?: 'article' | 'sentence';
}

export interface ReadingWordLookupResult {
  text: string;
}

export interface ReadingSentenceTranslateResult {
  text: string;
}
