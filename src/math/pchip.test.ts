import { describe, test, expect } from 'vitest';
import { pchipInterp, createPchipInterpFn } from './pchip';
import { expectClose, expectArrayClose } from '../test-helpers';

describe('PCHIP interpolation', () => {
  test('symmetric hill (0,0)→(1,1)→(2,0) — value at knot x=1', () => {
    const r = pchipInterp([0, 1, 2], [0, 1, 0], [1.0]);
    expectClose(r[0], 1.0, 1e-12, 'at knot');
  });

  test('symmetric hill — interior values are in (0, 1)', () => {
    const r = pchipInterp([0, 1, 2], [0, 1, 0], [0.5, 1.5]);
    expect(r[0]).toBeGreaterThan(0);
    expect(r[0]).toBeLessThan(1);
    expect(r[1]).toBeGreaterThan(0);
    expect(r[1]).toBeLessThan(1);
  });

  test('linear data reproduced exactly', () => {
    const r = pchipInterp([0, 1, 2, 3], [0, 1, 2, 3], [0.5, 1.5, 2.5]);
    expectArrayClose(r, [0.5, 1.5, 2.5], 1e-12, 'linear data');
  });

  test('linear data — extrapolation extends with slope 1', () => {
    const r = pchipInterp([0, 1, 2, 3], [0, 1, 2, 3], [-1, 4]);
    expectClose(r[0], -1, 1e-12, 'left extrap');
    expectClose(r[1], 4, 1e-12, 'right extrap');
  });

  test('non-linear data — left extrapolation is linear (collinear check)', () => {
    const xs = [1, 2, 3];
    const ys = [1, 4, 9];
    const r = pchipInterp(xs, ys, [-1, 0, 0.5]);
    expectClose(r[0], 2 * -1 - 1, 1e-10, 'x=-1');
    expectClose(r[1], 2 * 0 - 1, 1e-10, 'x=0');
    expectClose(r[2], 2 * 0.5 - 1, 1e-10, 'x=0.5');
  });

  test('asymmetric 3-point data — last segment used correctly', () => {
    // Regression: findSegment must return segment 1 for queries in [x1, x2]
    // With the off-by-one bug (hi = n-2), segment 0 was used instead,
    // giving ~2.025 instead of the correct ~4.1
    const r = pchipInterp([0, 1, 2], [0, 1, 10], [1.5]);
    expect(r[0]).toBeGreaterThan(3);
    expect(r[0]).toBeLessThan(8);
  });

  test('4-point data — query in last segment', () => {
    // Regression: with 4 knots, queries in the last interval [x2, x3]
    // must use segment 2 (not segment 1)
    const xs = [0, 1, 2, 3];
    const ys = [0, 0, 0, 10]; // steep rise only in the last segment
    const r = pchipInterp(xs, ys, [2.5]);
    expect(r[0]).toBeGreaterThan(1);   // must reflect the steep rise
    expect(r[0]).toBeLessThanOrEqual(10);
  });

  test('createPchipInterpFn consistent with pchipInterp', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 4, 9];
    const fn = createPchipInterpFn(xs, ys);
    const queries = [0.5, 1.5, 2.5, -1, 4];
    const batch = pchipInterp(xs, ys, queries);
    for (let i = 0; i < queries.length; i++) {
      expectClose(fn(queries[i]), batch[i], 1e-12, `x=${queries[i]}`);
    }
  });
});
