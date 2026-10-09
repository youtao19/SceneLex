import { describe, expect, it } from 'vitest';
import { createOperationId } from './operation-id';

/**
 * 操作 ID 太短会被后端当成非法值拒掉（要求 8~128 字符），这里钉住格式和唯一性。
 */
describe('createOperationId', () => {
  it('长度落在后端接受的范围内', () => {
    const operationId = createOperationId();

    expect(operationId.length).toBeGreaterThanOrEqual(8);
    expect(operationId.length).toBeLessThanOrEqual(128);
  });

  it('每次生成都不同，否则不同操作会互相顶替', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createOperationId()));

    expect(ids.size).toBe(50);
  });
});
