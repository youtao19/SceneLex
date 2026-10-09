export type OcrPageStatus = 'pending' | 'success' | 'failed' | 'skipped';

export type OcrBatchStatus = 'pending' | 'completed' | 'cancelled';

export interface OcrPage {
  pageIndex: number;
  status: OcrPageStatus;
  text: string;
  error: string;
  byteSize: number;
  hasImage: boolean;
}

export interface OcrBatch {
  id: number;
  status: OcrBatchStatus;
  articleId: number | null;
  createdAt: string;
  expiresAt: string;
  pageCount: number;
  byteSize: number;
  pages: OcrPage[];
}

export interface OcrBatchCreated {
  batchId: number;
  expiresAt: string;
}

export interface OcrPageResult {
  pageIndex: number;
  status: OcrPageStatus;
  text: string;
  error: string;
}

export interface OcrArticleResult {
  articleId: number;
  text: string;
}
