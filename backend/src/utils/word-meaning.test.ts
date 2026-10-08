import { describe, expect, it } from 'vitest';
import { buildPrimaryMeaning } from './word-meaning';
import type { WordMeaningItem } from '../types/word';

function buildMeaning(overrides: Partial<WordMeaningItem> = {}): WordMeaningItem {
  return {
    partOfSpeech: 'n.',
    meaning: '容量',
    sceneTitle: '',
    examples: [],
    explanation: '',
    imageQueries: [],
    example: '',
    tip: '',
    ...overrides,
  };
}

describe('buildPrimaryMeaning', () => {
  it('词性和释义拼在一起，多个义项用分号分隔', () => {
    const result = buildPrimaryMeaning([
      buildMeaning({ partOfSpeech: 'n.', meaning: '容量' }),
      buildMeaning({ partOfSpeech: 'v.', meaning: '接近' }),
    ]);

    expect(result).toBe('n. 容量；v. 接近');
  });

  it('词性缺失时只保留释义，不留多余空格', () => {
    const result = buildPrimaryMeaning([buildMeaning({ partOfSpeech: '', meaning: '容量' })]);

    expect(result).toBe('容量');
  });

  it('词性和释义都是空白时跳过该义项', () => {
    const result = buildPrimaryMeaning([
      buildMeaning({ partOfSpeech: '  ', meaning: '  ' }),
      buildMeaning({ partOfSpeech: 'adj.', meaning: '大约的' }),
    ]);

    expect(result).toBe('adj. 大约的');
  });

  it('没有义项时返回空串', () => {
    expect(buildPrimaryMeaning([])).toBe('');
  });
});
