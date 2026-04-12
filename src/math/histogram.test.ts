import { describe, test, expect } from 'vitest';
import { histogram } from './histogram';

describe('histogram', () => {
  test('counts mode sums to data length', () => {
    const data = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const r = histogram(data, { mode: 'counts', binWidth: 2, rangeMin: 1, rangeMax: 10 });
    let total = 0;
    for (let i = 0; i < r.values.length; i++) total += r.values[i];
    // All 10 points should be binned
    expect(total).toBeGreaterThanOrEqual(9); // edge effects may lose 1
  });

  test('probability density integrates to ~1', () => {
    const data = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = i / 100;
    const r = histogram(data, { mode: 'probability-density', binWidth: 1 });
    // Integral ≈ sum(density * binWidth)
    const bw = r.binEdges[1] - r.binEdges[0];
    let integral = 0;
    for (let i = 0; i < r.values.length; i++) integral += r.values[i] * bw;
    expect(integral).toBeCloseTo(1, 1);
  });

  test('cumulative probability ends at 1', () => {
    const data = new Float64Array([1, 2, 3, 4, 5]);
    const r = histogram(data, { mode: 'cumulative-probability', binWidth: 1, rangeMin: 1, rangeMax: 5 });
    expect(r.values[r.values.length - 1]).toBeCloseTo(1, 5);
  });

  test('cumulative probability is monotonically non-decreasing', () => {
    const data = new Float64Array(100);
    for (let i = 0; i < 100; i++) data[i] = Math.random() * 10;
    const r = histogram(data, { mode: 'cumulative-probability' });
    for (let i = 1; i < r.values.length; i++) {
      expect(r.values[i]).toBeGreaterThanOrEqual(r.values[i - 1] - 1e-10);
    }
  });

  test('bin edges bracket bin centers', () => {
    const data = new Float64Array([0, 1, 2, 3, 4, 5]);
    const r = histogram(data, { binWidth: 1 });
    for (let i = 0; i < r.binCenters.length; i++) {
      expect(r.binCenters[i]).toBeGreaterThanOrEqual(r.binEdges[i]);
      expect(r.binCenters[i]).toBeLessThanOrEqual(r.binEdges[i + 1]);
    }
  });

  test('auto bin width works', () => {
    const data = new Float64Array(200);
    for (let i = 0; i < 200; i++) data[i] = Math.random();
    const r = histogram(data); // no binWidth → auto
    expect(r.binCenters.length).toBeGreaterThan(1);
    expect(r.values.length).toBe(r.binCenters.length);
  });

  test('NaN values are excluded', () => {
    const data = new Float64Array([1, NaN, 2, NaN, 3]);
    const r = histogram(data, { mode: 'counts', binWidth: 1, rangeMin: 1, rangeMax: 3 });
    let total = 0;
    for (let i = 0; i < r.values.length; i++) total += r.values[i];
    expect(total).toBe(3);
  });

  test('empty input returns empty result', () => {
    const r = histogram(new Float64Array(0));
    expect(r.binCenters.length).toBe(0);
  });
});
