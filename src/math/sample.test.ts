import { describe, test, expect } from 'vitest';
import { resample } from './sample';
import { expectArrayClose } from '../test-helpers';

describe('Resampling', () => {
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

  test('cubic spline — last segment evaluated correctly', () => {
    // Regression: buildNaturalCubicSpline binary search must find the
    // last interval. With 3 data points and a steep final segment, using
    // the wrong segment gives a wildly different result.
    const { values } = resample(
      new Float64Array([0, 1, 2]),
      new Float64Array([0, 0, 10]),
      [1.5],
      'cubic',
      false,
    );
    expect(values[0]).toBeGreaterThan(1);   // must reflect the steep rise
    expect(values[0]).toBeLessThanOrEqual(10);
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
