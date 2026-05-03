import type { WordMeaningItem } from '../types/word';

/**
 * 列表里的“主要释义”要展示词典义项，不能展示记忆画面或场景解释。
 */
export function buildPrimaryMeaning(meanings: WordMeaningItem[]) {
  const items: string[] = [];

  for (const item of meanings) {
    const text = `${item.partOfSpeech} ${item.meaning}`.trim();

    if (text) {
      items.push(text);
    }
  }

  return items.join('；');
}
