import { describe, test, expect } from 'vitest';
import { ssa } from './ssa';

describe('SSA', () => {
  test('reconstruction from all components recovers original signal', () => {
    const N = 100;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = Math.sin(2 * Math.PI * i / 20) + 5;
    const r = ssa(x, { windowLength: 30 });

    // Full reconstruction should match original closely
    for (let i = 0; i < N; i++) {
      expect(Math.abs(r.reconstruction[i] - x[i])).toBeLessThan(0.1);
    }
  });

  test('eigenvalues are non-negative and sorted descending', () => {
    const N = 80;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = Math.sin(2 * Math.PI * i / 15) + Math.random() * 0.1;
    const r = ssa(x, { windowLength: 20 });

    for (let i = 0; i < r.eigenvalues.length; i++) {
      expect(r.eigenvalues[i]).toBeGreaterThanOrEqual(-1e-8);
    }
    for (let i = 1; i < r.eigenvalues.length; i++) {
      expect(r.eigenvalues[i]).toBeLessThanOrEqual(r.eigenvalues[i - 1] + 1e-8);
    }
  });

  test('variance fractions sum to ~1', () => {
    const N = 60;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = i * 0.1 + Math.sin(i * 0.3);
    const r = ssa(x, { windowLength: 15 });

    let sum = 0;
    for (let i = 0; i < r.varianceFraction.length; i++) sum += r.varianceFraction[i];
    expect(sum).toBeCloseTo(1, 1);
  });

  test('first 2 components capture most variance of a sinusoid', () => {
    const N = 100;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = 10 * Math.sin(2 * Math.PI * i / 25);
    const r = ssa(x, { windowLength: 30, nComponents: 2 });

    // For a pure sinusoid, the first 2 components should capture >95% variance
    const varCaptured = r.varianceFraction[0] + r.varianceFraction[1];
    expect(varCaptured).toBeGreaterThan(0.95);
  });

  test('partial reconstruction has fewer components', () => {
    const x = new Float64Array(50);
    for (let i = 0; i < 50; i++) x[i] = Math.sin(i * 0.2) + Math.random();
    const r = ssa(x, { windowLength: 15, nComponents: 3 });
    expect(r.components.length).toBe(3);
  });

  test('rejects windowLength out of range', () => {
    expect(() => ssa(new Float64Array(10), { windowLength: 1 })).toThrow();
    expect(() => ssa(new Float64Array(10), { windowLength: 10 })).toThrow();
  });

  test('rejects fewer than 3 points', () => {
    expect(() => ssa(new Float64Array(2))).toThrow();
  });
});
