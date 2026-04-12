import { describe, test, expect } from 'vitest';
import { selectParts } from './selectParts';

const idx = new Float64Array([0, 1, 2, 3, 4]);
const data = new Float64Array([10, 20, 30, 40, 50]);
const eval_ = new Float64Array([1, 5, 3, 7, 2]);

describe('selectParts', () => {
  test('gt selects values above threshold', () => {
    const r = selectParts(idx, data, eval_, 'gt', 3);
    // eval > 3 at indices 1 (5), 3 (7)
    expect(Array.from(r.index)).toEqual([1, 3]);
    expect(Array.from(r.values)).toEqual([20, 40]);
  });

  test('lt selects values below threshold', () => {
    const r = selectParts(idx, data, eval_, 'lt', 3);
    // eval < 3 at indices 0 (1), 4 (2)
    expect(Array.from(r.index)).toEqual([0, 4]);
    expect(Array.from(r.values)).toEqual([10, 50]);
  });

  test('gte includes equal', () => {
    const r = selectParts(idx, data, eval_, 'gte', 3);
    // eval >= 3 at indices 1 (5), 2 (3), 3 (7)
    expect(Array.from(r.index)).toEqual([1, 2, 3]);
  });

  test('lte includes equal', () => {
    const r = selectParts(idx, data, eval_, 'lte', 3);
    // eval <= 3 at indices 0 (1), 2 (3), 4 (2)
    expect(Array.from(r.index)).toEqual([0, 2, 4]);
  });

  test('eq selects exact matches', () => {
    const r = selectParts(idx, data, eval_, 'eq', 5);
    expect(Array.from(r.index)).toEqual([1]);
    expect(Array.from(r.values)).toEqual([20]);
  });

  test('neq excludes exact matches', () => {
    const r = selectParts(idx, data, eval_, 'neq', 5);
    expect(r.index.length).toBe(4);
  });

  test('no matches returns empty arrays', () => {
    const r = selectParts(idx, data, eval_, 'gt', 100);
    expect(r.index.length).toBe(0);
    expect(r.values.length).toBe(0);
  });

  test('all match returns full arrays', () => {
    const r = selectParts(idx, data, eval_, 'gt', 0);
    expect(r.index.length).toBe(5);
  });

  test('rejects mismatched lengths', () => {
    expect(() => selectParts(
      new Float64Array([0, 1]),
      new Float64Array([10, 20]),
      new Float64Array([1]),
      'gt', 0,
    )).toThrow();
  });
});
