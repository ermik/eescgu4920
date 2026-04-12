import { describe, test, expect } from 'vitest';
import { pca } from './pca';

describe('PCA', () => {
  test('eigenvalues are non-negative and sorted descending', () => {
    const N = 100;
    const s1 = new Float64Array(N);
    const s2 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s1[i] = Math.sin(i * 0.1);
      s2[i] = Math.cos(i * 0.1) + 0.5 * Math.sin(i * 0.1);
    }
    const r = pca([s1, s2]);
    for (let i = 0; i < r.eigenvalues.length; i++) {
      expect(r.eigenvalues[i]).toBeGreaterThanOrEqual(-1e-8);
    }
    for (let i = 1; i < r.eigenvalues.length; i++) {
      expect(r.eigenvalues[i]).toBeLessThanOrEqual(r.eigenvalues[i - 1] + 1e-8);
    }
  });

  test('variance fractions sum to ~1', () => {
    const N = 80;
    const s1 = new Float64Array(N);
    const s2 = new Float64Array(N);
    const s3 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s1[i] = Math.sin(i * 0.2);
      s2[i] = Math.cos(i * 0.2) + 0.3 * s1[i];
      s3[i] = s1[i] * 0.5 + Math.random() * 0.01;
    }
    const r = pca([s1, s2, s3]);
    let sum = 0;
    for (let i = 0; i < r.varianceFraction.length; i++) sum += r.varianceFraction[i];
    expect(sum).toBeCloseTo(1, 1);
  });

  test('scores have correct dimensions', () => {
    const N = 50;
    const s1 = new Float64Array(N);
    const s2 = new Float64Array(N);
    for (let i = 0; i < N; i++) { s1[i] = i; s2[i] = i * 2; }
    const r = pca([s1, s2]);
    expect(r.scores.length).toBe(2);
    expect(r.scores[0].length).toBe(N);
    expect(r.scores[1].length).toBe(N);
  });

  test('loadings have correct dimensions', () => {
    const N = 30;
    const s1 = new Float64Array(N);
    const s2 = new Float64Array(N);
    const s3 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s1[i] = Math.sin(i);
      s2[i] = Math.cos(i);
      s3[i] = i * 0.01;
    }
    const r = pca([s1, s2, s3]);
    expect(r.loadings.length).toBe(3); // 3 components
    expect(r.loadings[0].length).toBe(3); // 3 variables per loading
  });

  test('perfectly correlated series: first PC captures all variance', () => {
    const N = 100;
    const s1 = new Float64Array(N);
    const s2 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s1[i] = i * 0.1;
      s2[i] = i * 0.3 + 5; // perfectly linear with s1
    }
    const r = pca([s1, s2]);
    expect(r.varianceFraction[0]).toBeGreaterThan(0.99);
  });

  test('rejects fewer than 2 series', () => {
    expect(() => pca([new Float64Array(10)])).toThrow();
  });

  test('rejects mismatched lengths', () => {
    expect(() => pca([new Float64Array(10), new Float64Array(5)])).toThrow();
  });
});
