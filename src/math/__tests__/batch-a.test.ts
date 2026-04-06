
/**
 * Batch-A validation: types and pure math functions for AnalySeries Browser.
 */

import { describe, test, expect } from 'vitest';
import type {
  WorksheetItem,
  SeriesItem,
  FilterItem,
  SampleItem,
  InterpolationItem,
} from '../../types.js';
import {
  generateId,
  generateColor,
  blendColors,
  appendHistory,
  isMonotonicIncreasing,
} from '../../utils.js';
import { linearInterp, createLinearInterpFn } from '../interp.js';
import { pchipInterp, createPchipInterpFn } from '../pchip.js';
import { movingAverage } from '../filter.js';
import { resample } from '../sample.js';
import { computeStats } from '../stats.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectClose(
  actual: number,
  expected: number,
  tolerance = 1e-6,
  msg = '',
) {
  expect(isNaN(actual), `${msg ? msg + ': ' : ''}got NaN for actual`).toBe(false);
  expect(isNaN(expected), `${msg ? msg + ': ' : ''}got NaN for expected`).toBe(false);
  expect(
    Math.abs(actual - expected),
    `${msg ? msg + ': ' : ''}expected ${expected}, got ${actual} (±${tolerance})`,
  ).toBeLessThanOrEqual(tolerance);
}

function expectArrayClose(
  actual: ArrayLike<number>,
  expected: number[],
  tolerance = 1e-6,
  msg = '',
) {
  expect(actual.length, `${msg ? msg + ': ' : ''}length mismatch`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(
      Math.abs(actual[i] - expected[i]),
      `${msg ? msg + ': ' : ''}[${i}]: expected ${expected[i]}, got ${actual[i]} (±${tolerance})`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

// ===========================================================================
// A1 — Types
// ===========================================================================

describe('A1: Types', () => {
  test('construct SeriesItem and narrow discriminated union', () => {
    const series: SeriesItem = {
      id: 'Id-AABBCCDD',
      type: 'Series',
      name: 'Test Series',
      date: '2024/01/01',
      comment: '',
      history: '',
      xLabel: 'Depth (m)',
      yLabel: 'δ18O',
      color: '#1f77b4',
      index: new Float64Array([1, 2, 3]),
      values: new Float64Array([10, 20, 30]),
    };

    const item: WorksheetItem = series;
    expect(item.type).toBe('Series');

    if (item.type === 'Series') {
      expect(item.index.length).toBe(3);
      expect(item.color).toBe('#1f77b4');
    }
  });

  test('construct FilterItem', () => {
    const filter: FilterItem = {
      id: 'Id-11223344',
      type: 'FILTER',
      name: 'MA-5',
      date: '',
      comment: '',
      history: '',
      windowSize: 5,
    };
    const item: WorksheetItem = filter;
    expect(item.type).toBe('FILTER');
    if (item.type === 'FILTER') {
      expect(item.windowSize).toBe(5);
    }
  });

  test('construct SampleItem (step mode)', () => {
    const sample: SampleItem = {
      id: 'Id-AABBCCDD',
      type: 'SAMPLE',
      name: 'Resample 0.5ka',
      date: '',
      comment: '',
      history: '',
      step: 0.5,
      kind: 'linear',
      integrated: false,
      xCoords: null,
    };
    const item: WorksheetItem = sample;
    expect(item.type).toBe('SAMPLE');
  });

  test('construct InterpolationItem', () => {
    const interp: InterpolationItem = {
      id: 'Id-AABBCCDD',
      type: 'INTERPOLATION',
      name: 'Age model',
      date: '',
      comment: '',
      history: '',
      x1Coords: [0, 10, 20],
      x2Coords: [0, 5, 15],
      x1Name: 'Age (ka)',
    };
    const item: WorksheetItem = interp;
    expect(item.type).toBe('INTERPOLATION');
  });

  test('SeriesItem with InterpolationOverlay', () => {
    const series: SeriesItem = {
      id: 'Id-AABBCCDD',
      type: 'Series interpolated',
      name: 'Re-referenced',
      date: '',
      comment: '',
      history: '',
      xLabel: 'Age (ka)',
      yLabel: 'δ18O',
      color: '#ff7f0e',
      index: new Float64Array([0, 5, 10]),
      values: new Float64Array([1, 2, 3]),
      interpolation: {
        interpolationMode: 'PCHIP',
        x1Coords: [0, 10],
        x2Coords: [0, 20],
        xOriginalLabel: 'Depth (m)',
        xOriginalValues: new Float64Array([0, 10, 20]),
      },
    };
    expect(series.interpolation?.interpolationMode).toBe('PCHIP');
    expect(series.interpolation?.xOriginalValues.length).toBe(3);
  });
});

// ===========================================================================
// A2 — Utils
// ===========================================================================

describe('A2: Utils', () => {
  test('generateId format is Id-[0-9A-F]{8}', () => {
    expect(generateId()).toMatch(/^Id-[0-9A-F]{8}$/);
  });

  test('generateId uniqueness', () => {
    expect(generateId()).not.toBe(generateId());
  });

  test('generateColor format', () => {
    expect(generateColor()).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('generateColor excludes specified color (50 draws)', () => {
    const excluded = '#1f77b4';
    for (let i = 0; i < 50; i++) {
      expect(generateColor(excluded)).not.toBe(excluded);
    }
  });

  test('blendColors midpoint (#000000 + #ffffff at 0.5)', () => {
    expect(blendColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  test('blendColors ratio=0 returns color1', () => {
    expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  test('blendColors ratio=1 returns color2', () => {
    expect(blendColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  test('appendHistory — empty base', () => {
    expect(appendHistory('', 'first entry')).toBe('first entry');
  });

  test('appendHistory — non-empty base adds <li>', () => {
    expect(appendHistory('old', 'new')).toBe('old<li>new');
  });

  test('isMonotonicIncreasing — true cases', () => {
    expect(isMonotonicIncreasing([1, 2, 3])).toBe(true);
    expect(isMonotonicIncreasing([])).toBe(true);
    expect(isMonotonicIncreasing([42])).toBe(true);
    expect(isMonotonicIncreasing(new Float64Array([0.1, 0.2, 0.3]))).toBe(true);
  });

  test('isMonotonicIncreasing — false cases', () => {
    expect(isMonotonicIncreasing([1, 3, 2])).toBe(false);
    expect(isMonotonicIncreasing([1, 1, 2])).toBe(false);
    expect(isMonotonicIncreasing([3, 2, 1])).toBe(false);
  });
});

// ===========================================================================
// A3 — Linear interpolation
// ===========================================================================

describe('A3: Linear interpolation', () => {
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

// ===========================================================================
// A4 — PCHIP interpolation
// ===========================================================================

describe('A4: PCHIP interpolation', () => {
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

// ===========================================================================
// A5 — Moving average
// ===========================================================================

describe('A5: Moving average', () => {
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

// ===========================================================================
// A6 — Resampling
// ===========================================================================

describe('A6: Resampling', () => {
  test('non-integrated linear — evenly spaced', () => {
    const { index, values } = resample(
      new Float64Array([0, 1, 2, 3, 4]),
      new Float64Array([0, 2, 4, 6, 8]),
      [0.5, 1.5, 2.5, 3.5],
      'linear',
      false,
    );
    expectArrayClose(index, [0.5, 1.5, 2.5, 3.5], 1e-10, 'index');
    expectArrayClose(values, [1, 3, 5, 7], 1e-10, 'values');
  });

  test('non-integrated nearest', () => {
    const { values } = resample(
      new Float64Array([0, 1, 2, 3, 4]),
      new Float64Array([0, 2, 4, 6, 8]),
      [0.3, 0.7, 2.1],
      'nearest',
      false,
    );
    expectArrayClose(values, [0, 2, 4], 1e-10);
  });

  test('integrated constant-zero gives zero', () => {
    const { index, values } = resample(
      new Float64Array([0, 1, 2, 3, 4]),
      new Float64Array([0, 0, 0, 0, 0]),
      [1, 2, 3],
      'linear',
      true,
    );
    expectArrayClose(index, [1, 2, 3], 1e-10, 'index');
    expectArrayClose(values, [0, 0, 0], 1e-10, '∫0 = 0');
  });

  test('sample points outside data range are excluded', () => {
    const { index } = resample(
      new Float64Array([0, 1, 2]),
      new Float64Array([0, 1, 4]),
      [-1, 1, 3],
      'linear',
      false,
    );
    expectArrayClose(index, [1], 1e-10, 'only x=1 is in [0,2]');
  });

  test('duplicate index values averaged before resampling', () => {
    const { values } = resample(
      new Float64Array([0, 0, 1, 2]),
      new Float64Array([1, 3, 5, 7]),
      [0, 1, 2],
      'linear',
      false,
    );
    expectArrayClose(values, [2, 5, 7], 1e-10);
  });

  test('integrated with single valid point returns empty', () => {
    const { index, values } = resample(
      new Float64Array([0, 1, 2]),
      new Float64Array([0, 1, 4]),
      [1],
      'linear',
      true,
    );
    expect(index.length).toBe(0);
    expect(values.length).toBe(0);
  });
});

// ===========================================================================
// A7 — Stats
// ===========================================================================

describe('A7: Stats', () => {
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
});
