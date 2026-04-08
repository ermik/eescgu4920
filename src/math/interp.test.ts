import { describe, test, expect } from 'vitest';
import { linearInterp, createLinearInterpFn } from './interp';
import { expectClose, expectArrayClose } from '../test-helpers';

describe('Linear interpolation', () => {
  test('interpolation — (0,0)→(1,1)→(2,4) at 0.5 and 1.5', () => {
    const result = linearInterp([0, 1, 2], [0, 1, 4], [0.5, 1.5]);
    expectArrayClose(result, [0.5, 2.5], 1e-12);
  });

  test('linear extrapolation outside data range', () => {
    const result = linearInterp([0, 1, 2], [0, 1, 4], [-1, 3]);
    expectArrayClose(result, [-1, 7], 1e-12);
  });

  test('single-point xKnown returns constant everywhere', () => {
    const result = linearInterp([5], [42], [1, 5, 10]);
    expectArrayClose(result, [42, 42, 42], 1e-12);
  });

  test('createLinearInterpFn consistent with linearInterp', () => {
    const xs = [0, 1, 2];
    const ys = [0, 1, 4];
    const fn = createLinearInterpFn(xs, ys);
    const queries = [0.5, 1.5, -1, 3];
    const batch = linearInterp(xs, ys, queries);
    for (let i = 0; i < queries.length; i++) {
      expectClose(fn(queries[i]), batch[i], 1e-12, `x=${queries[i]}`);
    }
  });

  test('mismatched lengths throw RangeError', () => {
    expect(() => linearInterp([0, 1], [0], [0])).toThrow();
  });

  test('non-monotone xKnown throws RangeError', () => {
    expect(() => linearInterp([0, 2, 1], [0, 2, 1], [0])).toThrow();
  });
});
