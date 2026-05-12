/**
 * Shared word mapping utilities ported from Express.
 * Used by history, word-books, and word-study modules.
 */

export function buildPrimaryMeaning(meanings) {
  const items = [];
  for (const item of meanings) {
    const text = `${item.partOfSpeech} ${item.meaning}`.trim();
    if (text) items.push(text);
  }
  return items.join('；');
}

export function toDateString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mapWordRow(row) {
  return {
    id: Number(row.id),
    word: row.word,
    phonetic: row.phonetic,
    primaryMeaning: buildPrimaryMeaning(row.meanings),
    meanings: row.meanings,
    ease: Number(row.ease),
    interval: Number(row.interval),
    nextReview: toDateString(row.next_review),
    reviewCount: Number(row.review_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
