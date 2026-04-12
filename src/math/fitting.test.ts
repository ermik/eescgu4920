import { describe, test, expect } from 'vitest';
import { fit } from './fitting';

function expectClose(actual: number, expected: number, tol: number, _label?: string) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

describe('fitting', () => {
  // --- Polynomial ---

  test('polynomial degree 1 fits a line exactly', () => {
    const index = new Float64Array([0, 1, 2, 3, 4]);
    const values = new Float64Array([2, 4, 6, 8, 10]); // y = 2 + 2x
    const xQuery = new Float64Array([0.5, 2.5]);
    const r = fit(index, values, xQuery, 'polynomial', 1);
    expectClose(r.values[0], 3, 0.01);
    expectClose(r.values[1], 7, 0.01);
  });

  test('polynomial degree 2 fits a parabola', () => {
    const index = new Float64Array([0, 1, 2, 3, 4]);
    const values = new Float64Array([0, 1, 4, 9, 16]); // y = x²
    const xQuery = new Float64Array([1.5, 3.5]);
    const r = fit(index, values, xQuery, 'polynomial', 2);
    expectClose(r.values[0], 2.25, 0.1);
    expectClose(r.values[1], 12.25, 0.1);
  });

  test('polynomial degree 0 returns mean', () => {
    const index = new Float64Array([0, 1, 2, 3]);
    const values = new Float64Array([2, 4, 6, 8]); // mean = 5
    const xQuery = new Float64Array([10, -5]);
    const r = fit(index, values, xQuery, 'polynomial', 0);
    expectClose(r.values[0], 5, 0.01);
    expectClose(r.values[1], 5, 0.01);
  });

  // --- Piecewise linear ---

  test('piecewise linear interpolates between points', () => {
    const index = new Float64Array([0, 1, 2, 3]);
    const values = new Float64Array([0, 10, 10, 0]);
    const xQuery = new Float64Array([0.5, 1.5, 2.5]);
    const r = fit(index, values, xQuery, 'piecewise-linear');
    expectClose(r.values[0], 5, 0.01);
    expectClose(r.values[1], 10, 0.01);
    expectClose(r.values[2], 5, 0.01);
  });

  test('piecewise linear clamps outside range', () => {
    const index = new Float64Array([0, 1]);
    const values = new Float64Array([5, 10]);
    const xQuery = new Float64Array([-1, 2]);
    const r = fit(index, values, xQuery, 'piecewise-linear');
    expect(r.values[0]).toBe(5);
    expect(r.values[1]).toBe(10);
  });

  // --- Staircase ---

  test('staircase holds value of left neighbour', () => {
    const index = new Float64Array([0, 1, 2, 3]);
    const values = new Float64Array([10, 20, 30, 40]);
    const xQuery = new Float64Array([0.5, 1.9, 2.1]);
    const r = fit(index, values, xQuery, 'staircase');
    expect(r.values[0]).toBe(10);
    expect(r.values[1]).toBe(20);
    expect(r.values[2]).toBe(30);
  });

  // --- Cubic spline ---

  test('cubic spline passes through data points', () => {
    const index = new Float64Array([0, 1, 2, 3, 4]);
    const values = new Float64Array([0, 1, 0, 1, 0]);
    const r = fit(index, values, index, 'cubic-spline');
    for (let i = 0; i < index.length; i++) {
      expectClose(r.values[i], values[i], 0.01, `knot ${i}`);
    }
  });

  test('cubic spline smooth on linear data', () => {
    const index = new Float64Array([0, 1, 2, 3]);
    const values = new Float64Array([0, 1, 2, 3]);
    const xQuery = new Float64Array([0.5, 1.5, 2.5]);
    const r = fit(index, values, xQuery, 'cubic-spline');
    expectClose(r.values[0], 0.5, 0.01);
    expectClose(r.values[1], 1.5, 0.01);
    expectClose(r.values[2], 2.5, 0.01);
  });

  // --- Edge cases ---

  test('rejects mismatched lengths', () => {
    expect(() => fit(
      new Float64Array([0, 1]),
      new Float64Array([0]),
      new Float64Array([0.5]),
      'polynomial',
    )).toThrow();
  });

  test('single point returns constant for all methods', () => {
    const index = new Float64Array([5]);
    const values = new Float64Array([42]);
    const xQuery = new Float64Array([0, 5, 10]);
    for (const kind of ['polynomial', 'piecewise-linear', 'staircase', 'cubic-spline'] as const) {
      const r = fit(index, values, xQuery, kind, 0);
      for (let i = 0; i < xQuery.length; i++) {
        expect(r.values[i]).toBe(42);
      }
    }
  });
});
