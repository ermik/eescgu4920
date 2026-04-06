/**
 * Unit tests for shapes.ts — vertical line shape creation and configuration.
 */

import { describe, test, expect, beforeEach } from 'vitest';

import { createVerticalLineShapes, resetShapeIds } from './shapes.js';
import type { SubplotAxisMap } from './types.js';

beforeEach(() => {
  resetShapeIds();
});

// ===========================================================================
// Vertical line shapes
// ===========================================================================

describe('createVerticalLineShapes', () => {
  const subplot0Axes: SubplotAxisMap = {
    x: ['xaxis'],
    y: ['yaxis'],
  };

  test('creates shapes at specified X positions', () => {
    const shapes = createVerticalLineShapes([10, 20, 30], subplot0Axes);
    expect(shapes).toHaveLength(3);
    expect(shapes[0][1].x0).toBe(10);
    expect(shapes[1][1].x0).toBe(20);
    expect(shapes[2][1].x0).toBe(30);
  });

  test('shape IDs are unique and prefixed with "shape-"', () => {
    const shapes = createVerticalLineShapes([1, 2], subplot0Axes);
    expect(shapes[0][0]).toBe('shape-0');
    expect(shapes[1][0]).toBe('shape-1');
  });

  test('x0 equals x1 (vertical line)', () => {
    const shapes = createVerticalLineShapes([42], subplot0Axes);
    const shape = shapes[0][1];
    expect(shape.x0).toBe(42);
    expect(shape.x1).toBe(42);
  });

  test('spans full Y domain (0 to 1)', () => {
    const shapes = createVerticalLineShapes([5], subplot0Axes);
    const shape = shapes[0][1];
    expect(shape.y0).toBe(0);
    expect(shape.y1).toBe(1);
  });

  test('xref matches subplot primary X axis anchor', () => {
    const shapes0 = createVerticalLineShapes([1], subplot0Axes);
    expect(shapes0[0][1].xref).toBe('x');

    const subplot1Axes: SubplotAxisMap = {
      x: ['xaxis2'],
      y: ['yaxis2'],
    };
    resetShapeIds();
    const shapes1 = createVerticalLineShapes([1], subplot1Axes);
    expect(shapes1[0][1].xref).toBe('x2');
  });

  test('yref uses domain notation for full-height span', () => {
    const shapes = createVerticalLineShapes([1], subplot0Axes);
    expect(shapes[0][1].yref).toBe('y domain');

    const subplot2Axes: SubplotAxisMap = {
      x: ['xaxis3'],
      y: ['yaxis3'],
    };
    resetShapeIds();
    const shapes2 = createVerticalLineShapes([1], subplot2Axes);
    expect(shapes2[0][1].yref).toBe('y3 domain');
  });

  test('default style: gray, solid, width 1, opacity 0.5', () => {
    const shapes = createVerticalLineShapes([1], subplot0Axes);
    const line = shapes[0][1].line as Record<string, unknown>;
    expect(line.color).toBe('gray');
    expect(line.dash).toBe('solid');
    expect(line.width).toBe(1);
    expect(shapes[0][1].opacity).toBe(0.5);
  });

  test('custom style overrides defaults', () => {
    const shapes = createVerticalLineShapes([1], subplot0Axes, {
      color: 'blue',
      dash: 'dash',
      width: 0.5,
      opacity: 0.4,
    });
    const line = shapes[0][1].line as Record<string, unknown>;
    expect(line.color).toBe('blue');
    expect(line.dash).toBe('dash');
    expect(line.width).toBe(0.5);
    expect(shapes[0][1].opacity).toBe(0.4);
  });

  test('empty positions returns empty array', () => {
    const shapes = createVerticalLineShapes([], subplot0Axes);
    expect(shapes).toHaveLength(0);
  });

  test('shape type is "line"', () => {
    const shapes = createVerticalLineShapes([1], subplot0Axes);
    expect(shapes[0][1].type).toBe('line');
  });
});
