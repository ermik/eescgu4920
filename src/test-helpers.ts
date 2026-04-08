/**
 * Shared numeric assertion helpers for test files.
 */

import { expect } from 'vitest';

export function expectClose(
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

export function expectArrayClose(
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
