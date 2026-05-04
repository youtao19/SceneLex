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
