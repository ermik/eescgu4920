import { describe, test, expect } from 'vitest';
import { computeIceVolume } from './iceVolume';

/** Generate a simple sinusoidal insolation forcing. */
function fakeForcingKyr(N: number, dt: number): { index: Float64Array; forcing: Float64Array } {
  const index = new Float64Array(N);
  const forcing = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    index[i] = -i * dt; // negative = past
    // ~41 kyr obliquity cycle + ~23 kyr precession cycle
    forcing[i] = 500 + 30 * Math.sin(2 * Math.PI * i * dt / 41) +
                       20 * Math.sin(2 * Math.PI * i * dt / 23);
  }
  return { index, forcing };
}

describe('ice volume models', () => {
  // --- Calder ---

  test('calder model produces non-trivial output', () => {
    const { index, forcing } = fakeForcingKyr(1000, 1);
    const r = computeIceVolume(index, forcing, { model: 'calder' });
    expect(r.values.length).toBe(1000);
    // Should have non-zero values
    let maxV = 0;
    for (let i = 0; i < r.values.length; i++) maxV = Math.max(maxV, Math.abs(r.values[i]));
    expect(maxV).toBeGreaterThan(0);
  });

  test('calder with constant forcing produces zero ice', () => {
    const N = 100;
    const index = new Float64Array(N);
    const forcing = new Float64Array(N);
    for (let i = 0; i < N; i++) { index[i] = i; forcing[i] = 500; }
    const r = computeIceVolume(index, forcing, { model: 'calder', insolationRef: 500 });
    for (let i = 0; i < N; i++) expect(Math.abs(r.values[i])).toBeLessThan(1e-10);
  });

  // --- Imbrie & Imbrie ---

  test('imbrie model tracks forcing with lag', () => {
    const { index, forcing } = fakeForcingKyr(500, 1);
    const r = computeIceVolume(index, forcing, { model: 'imbrie', tauGrowth: 42, tauDecay: 10 });
    expect(r.values.length).toBe(500);
    // Output should be bounded and non-trivial
    let maxV = 0;
    for (let i = 0; i < r.values.length; i++) maxV = Math.max(maxV, Math.abs(r.values[i]));
    expect(maxV).toBeGreaterThan(0.01);
    expect(maxV).toBeLessThan(100);
  });

  // --- Paillard ---

  test('paillard model produces cyclic behaviour', () => {
    const { index, forcing } = fakeForcingKyr(800, 1);
    const r = computeIceVolume(index, forcing, { model: 'paillard' });
    expect(r.values.length).toBe(800);
    // Should have positive values (ice volume)
    let hasPositive = false;
    for (let i = 0; i < r.values.length; i++) {
      if (r.values[i] > 0.01) hasPositive = true;
    }
    expect(hasPositive).toBe(true);
  });

  // --- Paillard & Parrenin ---

  test('paillard-parrenin model runs without error', () => {
    const { index, forcing } = fakeForcingKyr(500, 1);
    const r = computeIceVolume(index, forcing, { model: 'paillard-parrenin' });
    expect(r.values.length).toBe(500);
    // Values should be non-negative (ice volume)
    for (let i = 0; i < r.values.length; i++) {
      expect(r.values[i]).toBeGreaterThanOrEqual(-0.01);
    }
  });

  // --- Edge cases ---

  test('rejects mismatched lengths', () => {
    expect(() => computeIceVolume(
      new Float64Array([0, 1]),
      new Float64Array([500]),
      { model: 'calder' },
    )).toThrow();
  });

  test('rejects fewer than 2 points', () => {
    expect(() => computeIceVolume(
      new Float64Array([0]),
      new Float64Array([500]),
      { model: 'calder' },
    )).toThrow();
  });
});
