import { describe, test, expect } from 'vitest';
import { generateNoise } from './noise';

describe('noise generators', () => {
  test('gaussian produces correct number of points', () => {
    const r = generateNoise({ type: 'gaussian', nPoints: 100, xStart: 0, xEnd: 99, seed: 42 });
    expect(r.index.length).toBe(100);
    expect(r.values.length).toBe(100);
  });

  test('index spans xStart to xEnd', () => {
    const r = generateNoise({ type: 'gaussian', nPoints: 50, xStart: -10, xEnd: 10, seed: 1 });
    expect(r.index[0]).toBe(-10);
    expect(r.index[49]).toBeCloseTo(10, 10);
  });

  test('seeded output is reproducible', () => {
    const r1 = generateNoise({ type: 'gaussian', nPoints: 50, xStart: 0, xEnd: 49, seed: 123 });
    const r2 = generateNoise({ type: 'gaussian', nPoints: 50, xStart: 0, xEnd: 49, seed: 123 });
    for (let i = 0; i < 50; i++) expect(r1.values[i]).toBe(r2.values[i]);
  });

  test('gaussian mean is approximately zero', () => {
    const r = generateNoise({ type: 'gaussian', nPoints: 10000, xStart: 0, xEnd: 9999, seed: 7, center: 0, variance: 1 });
    let sum = 0;
    for (let i = 0; i < r.values.length; i++) sum += r.values[i];
    expect(Math.abs(sum / r.values.length)).toBeLessThan(0.1);
  });

  test('uniform values are bounded', () => {
    const v = 4; // variance = 4 → half-width = sqrt(12) ≈ 3.46
    const r = generateNoise({ type: 'uniform', nPoints: 1000, xStart: 0, xEnd: 999, seed: 5, center: 0, variance: v });
    const half = Math.sqrt(3 * v) + 0.01;
    for (let i = 0; i < r.values.length; i++) {
      expect(r.values[i]).toBeGreaterThanOrEqual(-half);
      expect(r.values[i]).toBeLessThanOrEqual(half);
    }
  });

  test('all distribution types run without error', () => {
    for (const type of ['uniform', 'gaussian', 'exponential', 'double-exponential', 'lorentzian'] as const) {
      const r = generateNoise({ type, nPoints: 100, xStart: 0, xEnd: 99, seed: 42, center: 0, variance: 1 });
      expect(r.values.length).toBe(100);
      // No NaN (except possibly lorentzian which can have extreme values)
      if (type !== 'lorentzian') {
        for (let i = 0; i < r.values.length; i++) expect(isFinite(r.values[i])).toBe(true);
      }
    }
  });

  test('red noise has positive autocorrelation', () => {
    const r = generateNoise({ type: 'gaussian', nPoints: 1000, xStart: 0, xEnd: 999, seed: 10, redNoise: 0.9 });
    // Lag-1 autocorrelation should be clearly positive
    let sum = 0, s1 = 0, s2 = 0;
    const mean = r.values.reduce((a, b) => a + b, 0) / r.values.length;
    for (let i = 1; i < r.values.length; i++) {
      s1 += (r.values[i] - mean) * (r.values[i - 1] - mean);
      s2 += (r.values[i] - mean) * (r.values[i] - mean);
    }
    sum = s1 / s2;
    expect(sum).toBeGreaterThan(0.5);
  });

  test('rejects nPoints < 1', () => {
    expect(() => generateNoise({ nPoints: 0, xStart: 0, xEnd: 1 })).toThrow();
  });
});
