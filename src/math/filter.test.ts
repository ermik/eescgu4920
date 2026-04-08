import { describe, test, expect } from 'vitest';
import { movingAverage } from './filter';
import { expectArrayClose } from '../test-helpers';

describe('Moving average', () => {
  test('window=3 on [1,2,3,4,5]', () => {
    const { index, values } = movingAverage(
      new Float64Array([0, 1, 2, 3, 4]),
      new Float64Array([1, 2, 3, 4, 5]),
      3,
    );
    expectArrayClose(index, [1, 2, 3], 1e-12, 'index');
    expectArrayClose(values, [2, 3, 4], 1e-12, 'values');
  });

  test('window=5 on constant series', () => {
    const { index, values } = movingAverage(
      new Float64Array([0, 1, 2, 3, 4]),
      new Float64Array([10, 10, 10, 10, 10]),
      5,
    );
    expectArrayClose(index, [2], 1e-12, 'index');
    expectArrayClose(values, [10], 1e-12, 'values');
  });

  test('window=1 is identity', () => {
    const idx = new Float64Array([0, 1, 2, 3]);
    const vals = new Float64Array([5, 3, 8, 1]);
    const { index, values } = movingAverage(idx, vals, 1);
    expectArrayClose(index, Array.from(idx), 1e-12, 'index identity');
    expectArrayClose(values, Array.from(vals), 1e-12, 'values identity');
  });

  test('output length = N - W + 1', () => {
    const cases = [[10, 3], [7, 5], [5, 1], [3, 3]];
    for (const [n, w] of cases) {
      const { values } = movingAverage(
        new Float64Array(n).map((_, i) => i),
        new Float64Array(n).fill(1),
        w,
      );
      expect(values.length, `n=${n} w=${w}`).toBe(n - w + 1);
    }
  });

  test('even windowSize throws RangeError', () => {
    expect(() =>
      movingAverage(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 3]), 2),
    ).toThrow();
  });

  test('windowSize > n throws RangeError', () => {
    expect(() =>
      movingAverage(new Float64Array([1, 2]), new Float64Array([1, 2]), 3),
    ).toThrow();
  });
});
