/**
 * Shape management — vertical line shapes for Plotly layouts.
 *
 * Shapes are Plotly layout objects (not traces). Each shape is stored with
 * a unique string ID for individual add/remove operations.
 */

import { layoutKeyToAnchor } from './axes.js';
import type { SubplotAxisMap, VerticalLineStyle } from './types.js';

// ---------------------------------------------------------------------------
// Shape ID generation
// ---------------------------------------------------------------------------

let nextShapeId = 0;

/** Reset shape ID counter (for testing). */
export function resetShapeIds(): void {
  nextShapeId = 0;
}

// ---------------------------------------------------------------------------
// Vertical line shape creation
// ---------------------------------------------------------------------------

/**
 * Create Plotly shape objects for vertical lines at given X positions.
 *
 * Each shape spans the full Y domain (0 to 1) of its subplot using
 * `yref: '<anchor> domain'`. The `xref` matches the subplot's primary
 * X axis anchor.
 *
 * Returns an array of `[id, shapeObject]` pairs for storage in a Map.
 */
export function createVerticalLineShapes(
  xPositions: number[],
  subplotAxes: SubplotAxisMap,
  style?: VerticalLineStyle,
): [string, Record<string, unknown>][] {
  const xRef = layoutKeyToAnchor(subplotAxes.x[0]);
  const yRef = layoutKeyToAnchor(subplotAxes.y[0]);
  const result: [string, Record<string, unknown>][] = [];

  for (const xPos of xPositions) {
    const id = `shape-${nextShapeId++}`;
    result.push([
      id,
      {
        type: 'line',
        x0: xPos,
        x1: xPos,
        y0: 0,
        y1: 1,
        xref: xRef,
        yref: yRef + ' domain',
        line: {
          color: style?.color ?? 'gray',
          dash: style?.dash ?? 'solid',
          width: style?.width ?? 1,
        },
        opacity: style?.opacity ?? 0.5,
      },
    ]);
  }

  return result;
}
