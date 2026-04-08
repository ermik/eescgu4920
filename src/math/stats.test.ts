import { describe, test, expect } from 'vitest';
import { computeStats } from './stats';
import { expectClose } from '../test-helpers';

describe('Stats', () => {
  test('basic univariate stats for [2,4,6,8,10]', () => {
    const stats = computeStats(
      new Float64Array([1, 2, 3, 4, 5]),
      new Float64Array([2, 4, 6, 8, 10]),
    );
    expect(stats.count).toBe(5);
    expect(stats.replicateCount).toBe(0);
    expect(stats.missingCount).toBe(0);
    expectClose(stats.mean, 6, 1e-10, 'mean');
    expectClose(stats.median, 6, 1e-10, 'median');
    expectClose(stats.min, 2, 1e-10, 'min');
    expectClose(stats.max, 10, 1e-10, 'max');
    expectClose(stats.std, Math.sqrt(10), 1e-6, 'std = √10');
    expectClose(stats.variance, 10, 1e-6, 'variance = 10');
    expectClose(stats.q25, 4, 1e-10, 'q25');
    expectClose(stats.q75, 8, 1e-10, 'q75');
    expectClose(stats.iqr, 4, 1e-10, 'iqr');
  });

  test('Pearson and Spearman r=1 for perfectly linear data', () => {
    const stats = computeStats(
      new Float64Array([1, 2, 3, 4, 5]),
      new Float64Array([2, 4, 6, 8, 10]),
    );
    expectClose(stats.pearson, 1.0, 1e-10, 'pearson = 1');
    expectClose(stats.pearsonPValue, 0, 1e-10, 'pearsonPValue = 0');
    expectClose(stats.spearman, 1.0, 1e-10, 'spearman = 1');
    expectClose(stats.spearmanPValue, 0, 1e-10, 'spearmanPValue = 0');
  });

  test('NaN values are excluded from univariate stats', () => {
    const stats = computeStats(
      new Float64Array([1, 2, 3]),
      new Float64Array([NaN, 4, 6]),
    );
    expect(stats.count).toBe(3);
    expect(stats.missingCount).toBe(1);
    expectClose(stats.mean, 5, 1e-10, 'mean of [4,6] = 5');
  });

  test('empty input returns 0 counts and NaN numerics', () => {
    const stats = computeStats(new Float64Array(0), new Float64Array(0));
    expect(stats.count).toBe(0);
    expect(stats.missingCount).toBe(0);
    expect(stats.mean).toBeNaN();
    expect(stats.median).toBeNaN();
    expect(stats.std).toBeNaN();
    expect(stats.pearson).toBeNaN();
    expect(stats.spearman).toBeNaN();
  });

  test('replicateCount detects duplicate index values', () => {
    const stats = computeStats(
      new Float64Array([1, 1, 2, 3]),
      new Float64Array([10, 20, 30, 40]),
    );
    expect(stats.replicateCount).toBe(1);
  });

  test('two-element input (min valid for std and correlation)', () => {
    const stats = computeStats(
      new Float64Array([0, 1]),
      new Float64Array([0, 2]),
    );
    expectClose(stats.mean, 1, 1e-10, 'mean');
    expectClose(stats.std, Math.sqrt(2), 1e-6, 'std of [0,2]');
    expectClose(stats.pearson, 1.0, 1e-10, 'pearson = 1');
    expectClose(stats.pearsonPValue, 0, 1e-10, 'p-value = 0 for |r|=1');
  });

  test('known t-statistic p-value: t=2.228, df=10 → p≈0.0500 (reference table)', () => {
    const n = 12;
    const df = n - 2; // 10
    const tStat = 2.228;
    const r = tStat / Math.sqrt(tStat * tStat + df); // ≈ 0.5762

    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const mx = (n - 1) / 2;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      x[i] = i;
      sxx += (i - mx) * (i - mx);
    }
    const orth = new Float64Array(n);
    for (let i = 0; i < n; i++) orth[i] = i % 2 === 0 ? 1 : -1;
    let mo = 0;
    for (let i = 0; i < n; i++) mo += orth[i];
    mo /= n;
    for (let i = 0; i < n; i++) orth[i] -= mo;
    let dotXO = 0;
    for (let i = 0; i < n; i++) dotXO += (x[i] - mx) * orth[i];
    const dotXX = sxx;
    for (let i = 0; i < n; i++) orth[i] -= (dotXO / dotXX) * (x[i] - mx);
    let soo = 0;
    for (let i = 0; i < n; i++) soo += orth[i] * orth[i];
    const sx = Math.sqrt(sxx);
    const so = Math.sqrt(soo);
    for (let i = 0; i < n; i++) {
      y[i] = r * (x[i] - mx) / sx + Math.sqrt(1 - r * r) * orth[i] / so;
    }

    const stats = computeStats(x, y);
    expectClose(stats.pearson, r, 1e-6, 'pearson ≈ 0.576');
    expectClose(stats.pearsonPValue, 0.0500, 0.002, 'p ≈ 0.05 for t=2.228, df=10');
  });
});
