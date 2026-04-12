import { listReviewRecords } from '../repositories/review.repository';

export async function getReviewItems() {
  return Promise.resolve(listReviewRecords());
}

