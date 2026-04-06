/**
 * Unit tests for coords.ts — coordinate conversion with mock Plotly internals.
 */

import { describe, test, expect } from 'vitest';

import { dataToPixel, pixelToData, getSubplotBounds, getAxisRange } from './coords.js';

// ---------------------------------------------------------------------------
// Mock Plotly axis internals
// ---------------------------------------------------------------------------

function createMockPlotDiv(axes?: Record<string, {
  l2p?: (v: number) => number;
  p2l?: (v: number) => number;
  _offset?: number;
  _length?: number;
  range?: [number, number];
}>): HTMLDivElement {
  const div = document.createElement('div');
  if (axes) {
    (div as unknown as Record<string, unknown>)._fullLayout = axes;
  }
  return div;
}

// ===========================================================================
// dataToPixel
// ===========================================================================

describe('dataToPixel', () => {
  test('converts using l2p + _offset', () => {
    const div = createMockPlotDiv({
      xaxis: { l2p: (v) => v * 5, _offset: 80, _length: 400 },
      yaxis: { l2p: (v) => v * 3, _offset: 20, _length: 300 },
    });
    const { px, py } = dataToPixel(div, 0, 10, 20);
    expect(px).toBe(10 * 5 + 80); // 130
    expect(py).toBe(20 * 3 + 20); // 80
  });

  test('returns {0, 0} when no _fullLayout', () => {
    const div = createMockPlotDiv();
    const { px, py } = dataToPixel(div, 0, 10, 20);
    expect(px).toBe(0);
    expect(py).toBe(0);
  });

  test('returns {0, 0} when l2p is missing', () => {
    const div = createMockPlotDiv({
      xaxis: { _offset: 80, _length: 400 },
      yaxis: { _offset: 20, _length: 300 },
    });
    const { px, py } = dataToPixel(div, 0, 10, 20);
    expect(px).toBe(0);
    expect(py).toBe(0);
  });

  test('handles subplot 1 (xaxis2/yaxis2)', () => {
    const div = createMockPlotDiv({
      xaxis2: { l2p: (v) => v * 2, _offset: 50, _length: 300 },
      yaxis2: { l2p: (v) => v * 4, _offset: 200, _length: 150 },
    });
    const { px, py } = dataToPixel(div, 1, 5, 10);
    expect(px).toBe(5 * 2 + 50); // 60
    expect(py).toBe(10 * 4 + 200); // 240
  });

  test('handles missing _offset gracefully (defaults to 0)', () => {
    const div = createMockPlotDiv({
      xaxis: { l2p: (v) => v * 5 },
      yaxis: { l2p: (v) => v * 3 },
    });
    const { px, py } = dataToPixel(div, 0, 10, 20);
    expect(px).toBe(50); // 10*5 + 0
    expect(py).toBe(60); // 20*3 + 0
  });
});

// ===========================================================================
// pixelToData
// ===========================================================================

describe('pixelToData', () => {
  test('converts using p2l - _offset', () => {
    const div = createMockPlotDiv({
      xaxis: { p2l: (v) => v / 5, _offset: 80 },
      yaxis: { p2l: (v) => v / 3, _offset: 20 },
    });
    const { x, y } = pixelToData(div, 0, 130, 80);
    expect(x).toBeCloseTo((130 - 80) / 5); // 10
    expect(y).toBeCloseTo((80 - 20) / 3); // 20
  });

  test('returns {0, 0} when no _fullLayout', () => {
    const div = createMockPlotDiv();
    const { x, y } = pixelToData(div, 0, 100, 200);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  test('round-trip: dataToPixel -> pixelToData', () => {
    const div = createMockPlotDiv({
      xaxis: {
        l2p: (v) => v * 5,
        p2l: (v) => v / 5,
        _offset: 80,
      },
      yaxis: {
        l2p: (v) => v * 3,
        p2l: (v) => v / 3,
        _offset: 20,
      },
    });
    const originalX = 15;
    const originalY = 25;
    const { px, py } = dataToPixel(div, 0, originalX, originalY);
    const { x, y } = pixelToData(div, 0, px, py);
    expect(x).toBeCloseTo(originalX, 10);
    expect(y).toBeCloseTo(originalY, 10);
  });
});

// ===========================================================================
// getSubplotBounds
// ===========================================================================

describe('getSubplotBounds', () => {
  test('returns axis offset and length', () => {
    const div = createMockPlotDiv({
      xaxis: { _offset: 50, _length: 400 },
      yaxis: { _offset: 20, _length: 300 },
    });
    const bounds = getSubplotBounds(div, 0);
    expect(bounds.left).toBe(50);
    expect(bounds.top).toBe(20);
    expect(bounds.width).toBe(400);
    expect(bounds.height).toBe(300);
  });

  test('returns zeros when no _fullLayout', () => {
    const div = createMockPlotDiv();
    const bounds = getSubplotBounds(div, 0);
    expect(bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  test('returns zeros for missing subplot', () => {
    const div = createMockPlotDiv({
      xaxis: { _offset: 50, _length: 400 },
      yaxis: { _offset: 20, _length: 300 },
    });
    const bounds = getSubplotBounds(div, 5); // No xaxis6/yaxis6
    expect(bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  test('defaults missing _offset/_length to 0', () => {
    const div = createMockPlotDiv({
      xaxis: {},
      yaxis: {},
    });
    const bounds = getSubplotBounds(div, 0);
    expect(bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

// ===========================================================================
// getAxisRange
// ===========================================================================

describe('getAxisRange', () => {
  test('returns axis range from _fullLayout', () => {
    const div = createMockPlotDiv({
      xaxis: { range: [0, 100] },
      yaxis: { range: [-5, 5] },
    });
    expect(getAxisRange(div, 'x', 0)).toEqual([0, 100]);
    expect(getAxisRange(div, 'y', 0)).toEqual([-5, 5]);
  });

  test('returns [0, 1] when no _fullLayout', () => {
    const div = createMockPlotDiv();
    expect(getAxisRange(div, 'x', 0)).toEqual([0, 1]);
  });

  test('returns [0, 1] when axis has no range', () => {
    const div = createMockPlotDiv({
      xaxis: {},
    });
    expect(getAxisRange(div, 'x', 0)).toEqual([0, 1]);
  });

  test('handles subplot 1 correctly', () => {
    const div = createMockPlotDiv({
      xaxis2: { range: [10, 20] },
      yaxis2: { range: [30, 40] },
    });
    expect(getAxisRange(div, 'x', 1)).toEqual([10, 20]);
    expect(getAxisRange(div, 'y', 1)).toEqual([30, 40]);
  });
});
