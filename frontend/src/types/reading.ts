export interface ReadingWordLookupData {
  text: string
}

export interface ReadingSentenceTranslateData {
  text: string
}

export interface ReadingArticle {
  id: number
  title: string
  content: string
  charCount: number
  createdAt: string
  updatedAt: string
}

export interface ReadingAssistantChat {
  id: number
  title: string
  articleContent: string
  createdAt: string
  updatedAt: string
}

export interface ReadingAssistantMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
