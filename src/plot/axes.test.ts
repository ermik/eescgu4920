/**
 * Unit tests for axes.ts — axis naming, domain computation, tick math,
 * twin axis creation, secondary axis tick computation.
 */

import { describe, test, expect } from 'vitest';

import {
  subplotToLayoutKey,
  layoutKeyToAnchor,
  computeSubplotDomains,
  niceNum,
  niceTicks,
  computeSecondaryTicks,
  applyAxisConfig,
  createTwinYAxis,
  createTwinXAxis,
  createSecondaryXAxis,
  computeProportionalZoomFactors,
  DEFAULT_AXIS_STYLE,
} from './axes.js';

import type { SubplotAxisMap } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectClose(
  actual: number,
  expected: number,
  tolerance = 1e-6,
  msg = '',
) {
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
  expect(actual.length, `${msg ? msg + ': ' : ''}length mismatch`).toBe(
    expected.length,
  );
  for (let i = 0; i < expected.length; i++) {
    expect(
      Math.abs(actual[i] - expected[i]),
      `${msg ? msg + ': ' : ''}[${i}]: expected ${expected[i]}, got ${actual[i]} (±${tolerance})`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

// ===========================================================================
// Axis naming
// ===========================================================================

describe('subplotToLayoutKey', () => {
  test('subplot 0 has no number suffix', () => {
    expect(subplotToLayoutKey(0, 'x')).toBe('xaxis');
    expect(subplotToLayoutKey(0, 'y')).toBe('yaxis');
  });

  test('subplot 1 gets suffix 2', () => {
    expect(subplotToLayoutKey(1, 'x')).toBe('xaxis2');
    expect(subplotToLayoutKey(1, 'y')).toBe('yaxis2');
  });

  test('higher indices', () => {
    expect(subplotToLayoutKey(2, 'x')).toBe('xaxis3');
    expect(subplotToLayoutKey(5, 'y')).toBe('yaxis6');
    expect(subplotToLayoutKey(9, 'x')).toBe('xaxis10');
  });
});

describe('layoutKeyToAnchor', () => {
  test('strips "axis" from key', () => {
    expect(layoutKeyToAnchor('xaxis')).toBe('x');
    expect(layoutKeyToAnchor('yaxis')).toBe('y');
    expect(layoutKeyToAnchor('xaxis2')).toBe('x2');
    expect(layoutKeyToAnchor('yaxis3')).toBe('y3');
    expect(layoutKeyToAnchor('xaxis10')).toBe('x10');
  });
});

describe('round-trip: subplotToLayoutKey -> layoutKeyToAnchor', () => {
  test('all subplots 0-5 round-trip correctly', () => {
    for (let i = 0; i < 6; i++) {
      for (const dim of ['x', 'y'] as const) {
        const key = subplotToLayoutKey(i, dim);
        const anchor = layoutKeyToAnchor(key);
        const expected = i === 0 ? dim : dim + String(i + 1);
        expect(anchor).toBe(expected);
      }
    }
  });
});

// ===========================================================================
// Subplot domains
// ===========================================================================

describe('computeSubplotDomains', () => {
  test('single row fills [0, 1]', () => {
    const domains = computeSubplotDomains(1, 0.1);
    expect(domains).toHaveLength(1);
    expectClose(domains[0][0], 0);
    expectClose(domains[0][1], 1);
  });

  test('two rows with gap', () => {
    const domains = computeSubplotDomains(2, 0.1);
    expect(domains).toHaveLength(2);
    expect(domains[0][1]).toBeGreaterThan(domains[1][1]);
    expectClose(domains[0][0] - domains[1][1], 0.1, 1e-9);
    const h0 = domains[0][1] - domains[0][0];
    const h1 = domains[1][1] - domains[1][0];
    expectClose(h0, h1, 1e-9);
  });

  test('three rows with zero gap', () => {
    const domains = computeSubplotDomains(3, 0);
    expect(domains).toHaveLength(3);
    const h = 1 / 3;
    expectArrayClose([domains[0][0], domains[0][1]], [2 * h, 1], 1e-9);
    expectArrayClose([domains[1][0], domains[1][1]], [h, 2 * h], 1e-9);
    expectArrayClose([domains[2][0], domains[2][1]], [0, h], 1e-9);
  });

  test('domains are non-overlapping and ordered top-to-bottom', () => {
    const domains = computeSubplotDomains(4, 0.05);
    for (let i = 0; i < domains.length; i++) {
      expect(domains[i][1]).toBeGreaterThan(domains[i][0]);
      if (i > 0) {
        expect(domains[i - 1][0]).toBeGreaterThanOrEqual(domains[i][1]);
      }
    }
  });

  test('zero rows returns empty', () => {
    expect(computeSubplotDomains(0, 0.1)).toHaveLength(0);
  });
});

// ===========================================================================
// Nice numbers
// ===========================================================================

describe('niceNum', () => {
  test('rounding mode', () => {
    expectClose(niceNum(10, true), 10);
    expectClose(niceNum(11, true), 10);
    expectClose(niceNum(7.5, true), 10);
    expectClose(niceNum(3.5, true), 5);
    expectClose(niceNum(1.5, true), 2);
    expectClose(niceNum(0.7, true), 0.5);
  });

  test('ceiling mode (round=false)', () => {
    expectClose(niceNum(10, false), 10);
    expectClose(niceNum(7, false), 10);
    expectClose(niceNum(4, false), 5);
    expectClose(niceNum(1.5, false), 2);
  });

  test('zero and negative', () => {
    expect(niceNum(0, true)).toBe(0);
    expect(niceNum(-1, true)).toBe(0);
  });
});

describe('niceTicks', () => {
  test('produces values in range', () => {
    const ticks = niceTicks(0, 10, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(10 + 1e-9);
  });

  test('handles small ranges', () => {
    const ticks = niceTicks(0.01, 0.05, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0.01 - 1e-12);
      expect(t).toBeLessThanOrEqual(0.05 + 1e-12);
    }
  });

  test('degenerate cases', () => {
    expect(niceTicks(5, 5, 5)).toEqual([5]);
    expect(niceTicks(5, 3, 5)).toEqual([5]);
  });
});

// ===========================================================================
// Secondary tick computation
// ===========================================================================

describe('computeSecondaryTicks', () => {
  test('linear transform x => 2*x', () => {
    const result = computeSecondaryTicks([0, 100], (x) => 2 * x, 4);
    expect(result.tickvals).toHaveLength(5);
    expect(result.ticktext).toHaveLength(5);
    expect(result.ticktext[0]).toBe('0.0');
    expect(result.ticktext[4]).toBe('200.0');
    expectArrayClose(result.tickvals, [0, 25, 50, 75, 100]);
  });

  test('identity transform', () => {
    const result = computeSecondaryTicks([10, 20], (x) => x, 5);
    expect(result.tickvals).toHaveLength(6);
    expectClose(result.tickvals[0], 10);
    expectClose(result.tickvals[5], 20);
    expect(result.ticktext[0]).toBe('10.0');
    expect(result.ticktext[5]).toBe('20.0');
  });

  test('affine transform depth = age * 2.5 + 10', () => {
    const result = computeSecondaryTicks([0, 100], (x) => x * 2.5 + 10, 4);
    expect(result.ticktext[0]).toBe('10.0');
    expect(result.ticktext[4]).toBe('260.0');
  });

  test('tick count determines number of intervals', () => {
    const result = computeSecondaryTicks([0, 10], (x) => x, 8);
    expect(result.tickvals).toHaveLength(9);
    expect(result.ticktext).toHaveLength(9);
  });

  test('minimum tick count is 1 interval', () => {
    const result = computeSecondaryTicks([0, 10], (x) => x, 0);
    expect(result.tickvals).toHaveLength(2);
  });

  test('nonlinear transform (quadratic)', () => {
    const result = computeSecondaryTicks([0, 4], (x) => x * x, 4);
    expectArrayClose(result.tickvals, [0, 1, 2, 3, 4]);
    expect(result.ticktext[0]).toBe('0.0');
    expect(result.ticktext[1]).toBe('1.0');
    expect(result.ticktext[2]).toBe('4.0');
    expect(result.ticktext[3]).toBe('9.0');
    expect(result.ticktext[4]).toBe('16.0');
  });
});

// ===========================================================================
// applyAxisConfig
// ===========================================================================

describe('applyAxisConfig', () => {
  test('sets title with text', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { title: 'X Label' });
    expect(axis.title).toEqual({ text: 'X Label' });
  });

  test('sets title with color', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { title: 'Y', titleColor: 'red' });
    expect(axis.title).toEqual({ text: 'Y', font: { color: 'red' } });
  });

  test('sets axis type', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { type: 'log' });
    expect(axis.type).toBe('log');
  });

  test('reversed without range sets autorange to reversed', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { reversed: true });
    expect(axis.autorange).toBe('reversed');
  });

  test('reversed with range sets high-to-low order', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { reversed: true, range: [0, 100] });
    expect(axis.range).toEqual([100, 0]);
    expect(axis.autorange).toBe(false);
  });

  test('range without reverse sets normal order', () => {
    const axis: Record<string, unknown> = {};
    applyAxisConfig(axis, { range: [10, 50] });
    expect(axis.range).toEqual([10, 50]);
    expect(axis.autorange).toBe(false);
  });
});

// ===========================================================================
// Proportional zoom weighting
// ===========================================================================

describe('computeProportionalZoomFactors', () => {
  test('equal spans → both get full baseFactor', () => {
    const [xf, yf] = computeProportionalZoomFactors(1.1, 100, 100);
    expectClose(xf, 1.1, 1e-9);
    expectClose(yf, 1.1, 1e-9);
  });

  test('dominant X, narrow Y → X gets full factor, Y near 1.0', () => {
    // LR04-like: X spans 5320, Y spans 2.43
    const [xf, yf] = computeProportionalZoomFactors(1.1, 5320, 2.43);
    expectClose(xf, 1.1, 1e-6, 'X should get full factor');
    // yExp = 2.43/5320 ≈ 0.000457 → 1.1^0.000457 ≈ 1.0000436
    expect(yf).toBeGreaterThan(1.0);
    expect(yf).toBeLessThan(1.001); // barely zooms
  });

  test('dominant Y, narrow X → Y gets full factor, X near 1.0', () => {
    const [xf, yf] = computeProportionalZoomFactors(0.9, 3, 5000);
    expectClose(yf, 0.9, 1e-6, 'Y should get full factor');
    expect(xf).toBeLessThan(1.0);
    expect(xf).toBeGreaterThan(0.999); // barely zooms
  });

  test('zoom-in factor (< 1) with equal spans', () => {
    const [xf, yf] = computeProportionalZoomFactors(0.9, 50, 50);
    expectClose(xf, 0.9, 1e-9);
    expectClose(yf, 0.9, 1e-9);
  });

  test('zero spans → returns baseFactor for both', () => {
    const [xf, yf] = computeProportionalZoomFactors(1.1, 0, 0);
    expectClose(xf, 1.1, 1e-9);
    expectClose(yf, 1.1, 1e-9);
  });

  test('one zero span → non-zero axis gets full factor, zero gets near 1', () => {
    const [xf, yf] = computeProportionalZoomFactors(1.1, 100, 0);
    expectClose(xf, 1.1, 1e-9, 'X gets full factor');
    // yExp = 0/100 = 0 → 1.1^0 = 1.0
    expectClose(yf, 1.0, 1e-9, 'Y exponent 0 → factor 1.0');
  });

  test('10:1 ratio gives intermediate factor for narrow axis', () => {
    const [xf, yf] = computeProportionalZoomFactors(1.1, 100, 10);
    expectClose(xf, 1.1, 1e-9, 'X full');
    // yExp = 10/100 = 0.1 → 1.1^0.1 ≈ 1.00957
    const expected = Math.pow(1.1, 0.1);
    expectClose(yf, expected, 1e-6, 'Y at 0.1 exponent');
  });
});

// ===========================================================================
// Twin axis creation
// ===========================================================================

describe('createTwinYAxis', () => {
  const baseAxes: SubplotAxisMap = {
    x: ['xaxis'],
    y: ['yaxis'],
  };

  test('creates right-side twin by default', () => {
    const { layoutKey, axisConfig } = createTwinYAxis(baseAxes, 5, {
      title: 'Twin Y',
    });
    expect(layoutKey).toBe('yaxis5');
    expect(axisConfig.overlaying).toBe('y');
    expect(axisConfig.side).toBe('right');
    expect(axisConfig.anchor).toBe('x');
    expect(axisConfig.showgrid).toBe(false);
  });

  test('creates left-side twin with offset', () => {
    const { axisConfig } = createTwinYAxis(baseAxes, 3, {
      title: 'Y2',
      titleColor: 'blue',
      side: 'left',
      offset: 6,
    });
    expect(axisConfig.side).toBe('left');
    expect(axisConfig.anchor).toBe('free');
    expect(axisConfig.position).toBeCloseTo(0.06);
    expect(axisConfig.title).toEqual({ text: 'Y2', font: { color: 'blue' } });
  });

  test('references correct primary axes for subplot 1', () => {
    const subplot1Axes: SubplotAxisMap = {
      x: ['xaxis2'],
      y: ['yaxis2'],
    };
    const { axisConfig } = createTwinYAxis(subplot1Axes, 4, { title: 'T' });
    expect(axisConfig.overlaying).toBe('y2');
    expect(axisConfig.anchor).toBe('x2');
  });
});

describe('createTwinXAxis', () => {
  const baseAxes: SubplotAxisMap = {
    x: ['xaxis'],
    y: ['yaxis'],
  };

  test('creates top-side twin by default', () => {
    const { layoutKey, axisConfig } = createTwinXAxis(baseAxes, 5, {
      title: 'Twin X',
    });
    expect(layoutKey).toBe('xaxis5');
    expect(axisConfig.overlaying).toBe('x');
    expect(axisConfig.side).toBe('top');
    expect(axisConfig.anchor).toBe('y');
  });

  test('creates bottom-side twin with offset', () => {
    const { axisConfig } = createTwinXAxis(baseAxes, 3, {
      title: 'X2',
      side: 'bottom',
      offset: 10,
    });
    expect(axisConfig.side).toBe('bottom');
    expect(axisConfig.anchor).toBe('free');
    expect(axisConfig.position).toBeCloseTo(0.1);
  });
});

describe('createSecondaryXAxis', () => {
  const baseAxes: SubplotAxisMap = {
    x: ['xaxis'],
    y: ['yaxis'],
  };

  test('creates secondary axis with transform ticks', () => {
    const { layoutKey, axisConfig } = createSecondaryXAxis(
      baseAxes,
      5,
      (x) => x * 2,
      'Depth (m)',
      [0, 100],
    );
    expect(layoutKey).toBe('xaxis5');
    expect(axisConfig.overlaying).toBe('x');
    expect(axisConfig.side).toBe('top');
    expect(axisConfig.anchor).toBe('y');
    expect(axisConfig.tickmode).toBe('array');
    expect(axisConfig.title).toEqual({ text: 'Depth (m)' });

    const tickvals = axisConfig.tickvals as number[];
    const ticktext = axisConfig.ticktext as string[];
    expect(tickvals.length).toBeGreaterThan(0);
    expect(ticktext.length).toBe(tickvals.length);
    // First tick at x=0 => transform=0
    expect(ticktext[0]).toBe('0.0');
  });
});

// ===========================================================================
// DEFAULT_AXIS_STYLE
// ===========================================================================

describe('DEFAULT_AXIS_STYLE', () => {
  test('has expected grid properties', () => {
    expect(DEFAULT_AXIS_STYLE.showgrid).toBe(true);
    expect(DEFAULT_AXIS_STYLE.gridcolor).toBe('lightgray');
    expect(DEFAULT_AXIS_STYLE.griddash).toBe('dash');
  });
});
