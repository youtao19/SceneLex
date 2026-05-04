export interface ReadingArticle {
  id: number;
  title: string;
  content: string;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReadingArticlePayload {
  content: string;
}
