/**
 * Tests for interpolation computation — verifying transformed X values.
 */

import { describe, it, expect } from 'vitest';
import { createInterpFunctions, computeGradient } from '../interpolatedOverlay.js';

// ---------------------------------------------------------------------------
// createInterpFunctions — Linear mode
// ---------------------------------------------------------------------------

describe('createInterpFunctions (Linear)', () => {
  it('simple 2-point mapping: depth/2 = age', () => {
    // depth 0 → age 0, depth 200 → age 100
    const { f_2to1 } = createInterpFunctions([0, 100], [0, 200], 'Linear');

    // Distorted series index: [0, 50, 100, 150, 200]
    // Expected transformed: [0, 25, 50, 75, 100]
    expect(f_2to1(0)).toBeCloseTo(0, 10);
    expect(f_2to1(50)).toBeCloseTo(25, 10);
    expect(f_2to1(100)).toBeCloseTo(50, 10);
    expect(f_2to1(150)).toBeCloseTo(75, 10);
    expect(f_2to1(200)).toBeCloseTo(100, 10);
  });

  it('f_1to2 is the inverse of f_2to1', () => {
    const { f_1to2, f_2to1 } = createInterpFunctions(
      [0, 100, 300],
      [0, 200, 500],
      'Linear',
    );

    // Round-trip: f_1to2(f_2to1(x)) ≈ x
    for (const x of [0, 100, 250, 500]) {
      expect(f_1to2(f_2to1(x))).toBeCloseTo(x, 8);
    }
  });

  it('linear extrapolation outside range', () => {
    const { f_2to1 } = createInterpFunctions([0, 100], [0, 200], 'Linear');

    // Below range: extrapolate with slope 100/200 = 0.5
    expect(f_2to1(-100)).toBeCloseTo(-50, 10);

    // Above range: extrapolate
    expect(f_2to1(300)).toBeCloseTo(150, 10);
  });

  it('result is exactly linear between tie-points', () => {
    const { f_2to1 } = createInterpFunctions(
      [0, 50, 200],
      [0, 100, 300],
      'Linear',
    );

    // Between (0,0) and (100,50): slope = 50/100 = 0.5
    expect(f_2to1(50)).toBeCloseTo(25, 10);

    // Between (100,50) and (300,200): slope = 150/200 = 0.75
    expect(f_2to1(200)).toBeCloseTo(125, 10);
  });
});

// ---------------------------------------------------------------------------
// createInterpFunctions — PCHIP mode
// ---------------------------------------------------------------------------

describe('createInterpFunctions (PCHIP)', () => {
  it('2-point PCHIP is identical to linear', () => {
    const lin = createInterpFunctions([0, 100], [0, 200], 'Linear');
    const pch = createInterpFunctions([0, 100], [0, 200], 'PCHIP');

    for (const x of [0, 50, 100, 150, 200]) {
      expect(pch.f_2to1(x)).toBeCloseTo(lin.f_2to1(x), 8);
    }
  });

  it('3+ point PCHIP is smooth and monotonic', () => {
    // Use a mapping where both x1 and x2 increase uniformly
    // so the inverse f_2to1 is also monotonic
    const { f_2to1 } = createInterpFunctions(
      [0, 100, 200, 300],
      [0, 200, 400, 600],
      'PCHIP',
    );

    // Evaluate at many points and verify monotonicity
    const ys = [];
    for (let x = 0; x <= 600; x += 5) {
      ys.push(f_2to1(x));
    }

    // f_2to1 should be monotonic (uniform scaling → linear inverse)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-10);
    }
  });

  it('PCHIP passes through tie-points exactly', () => {
    const x1 = [0, 50, 150, 300];
    const x2 = [0, 100, 200, 500];
    const { f_2to1 } = createInterpFunctions(x1, x2, 'PCHIP');

    for (let i = 0; i < x1.length; i++) {
      expect(f_2to1(x2[i])).toBeCloseTo(x1[i], 8);
    }
  });

  it('PCHIP extrapolates linearly', () => {
    const { f_2to1 } = createInterpFunctions(
      [0, 50, 150],
      [0, 100, 200],
      'PCHIP',
    );

    // Below range: linear extrapolation from first segment
    const y_neg = f_2to1(-50);
    const y_0 = f_2to1(0);
    const y_neg2 = f_2to1(-100);

    // Should be linear: (y_neg - y_0) ≈ (y_neg2 - y_neg)
    expect(y_neg - y_0).toBeCloseTo(y_neg2 - y_neg, 6);
  });
});

// ---------------------------------------------------------------------------
// computeGradient
// ---------------------------------------------------------------------------

describe('computeGradient', () => {
  it('returns null with fewer than 2 tie-points', () => {
    expect(computeGradient([0], [0], 'Linear')).toBeNull();
  });

  it('constant gradient for uniform linear mapping', () => {
    // depth 0→age 0, depth 200→age 100 ⇒ sed rate = depth/age = 2
    const result = computeGradient([0, 100], [0, 200], 'Linear', 50);
    expect(result).not.toBeNull();

    // All gradient values should be approximately 2
    for (let i = 0; i < result!.gradient.length; i++) {
      expect(result!.gradient[i]).toBeCloseTo(2, 1);
    }
  });

  it('gradient varies for non-uniform mapping', () => {
    // Two segments with different slopes
    const result = computeGradient(
      [0, 50, 200],
      [0, 200, 400],
      'Linear',
      100,
    );
    expect(result).not.toBeNull();

    // First segment: depth span 200 → age span 50 ⇒ grad = 200/50 = 4
    // Second segment: depth span 200 → age span 150 ⇒ grad ≈ 200/150 ≈ 1.33
    // Values should span from ~4 to ~1.33
    const grads = Array.from(result!.gradient);
    const maxGrad = Math.max(...grads);
    const minGrad = Math.min(...grads);
    expect(maxGrad).toBeGreaterThan(2);
    expect(minGrad).toBeGreaterThan(0);
  });
});
