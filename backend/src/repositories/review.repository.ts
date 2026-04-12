import type { ReviewRecord } from '../models/review.model';

const reviewRecords: ReviewRecord[] = [
  {
    id: 'review-1',
    word: 'curious',
    level: 'new',
  },
];

export function listReviewRecords() {
  return reviewRecords;
}

