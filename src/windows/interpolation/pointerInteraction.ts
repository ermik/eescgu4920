/**
 * Pointer interaction — Shift+click and Ctrl+click handlers for placing
 * tie-point pointers on the reference and distorted subplots.
 *
 * Shift+click: place pointer at the clicked X position on the curve.
 * Ctrl+click:  snap pointer to the nearest actual data point.
 */

import type { PlotEngine } from '../../plot/engine.js';
import type { InterpolationState } from './state.js';
import type { PendingPointer } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PENDING_STYLE = {
  color: 'blue',
  dash: 'dash' as const,
  width: 1,
  opacity: 0.5,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle a Shift+click on a subplot: place a pointer at the given X position.
 * If a pointer already exists on that subplot, it is moved.
 */
export function placePointerAtX(
  state: InterpolationState,
  engine: PlotEngine,
  subplot: 0 | 1,
  x: number,
): void {
  // Remove existing pending pointer shape on this subplot
  const existing = subplot === 0 ? state.pendingRef : state.pendingDist;
  if (existing) {
    engine.removeShapes([existing.shapeId]);
  }

  // Create new shape
  const [shapeId] = engine.addVerticalLines([x], subplot, PENDING_STYLE);

  const pointer: PendingPointer = {
    subplot,
    x,
    snapped: false,
    shapeId,
  };

  state.placePointer(pointer);
}

/**
 * Handle a Ctrl+click on a subplot: snap pointer to the nearest data point.
 */
export function placePointerSnapped(
  state: InterpolationState,
  engine: PlotEngine,
  subplot: 0 | 1,
  clickX: number,
): void {
  // Find nearest data point
  const series = subplot === 0 ? state.refItem : state.distItem;
  const idx = findNearestIndex(series.index, clickX);
  const snappedX = series.index[idx];

  // Remove existing pending pointer shape on this subplot
  const existing = subplot === 0 ? state.pendingRef : state.pendingDist;
  if (existing) {
    engine.removeShapes([existing.shapeId]);
  }

  // Create new shape at snapped position
  const [shapeId] = engine.addVerticalLines([snappedX], subplot, PENDING_STYLE);

  const pointer: PendingPointer = {
    subplot,
    x: snappedX,
    snapped: true,
    shapeId,
  };

  state.placePointer(pointer);
}

/**
 * Determine which subplot a pixel Y coordinate belongs to.
 * Returns 0 (reference), 1 (distorted), or -1 (neither).
 */
export function identifySubplot(
  engine: PlotEngine,
  py: number,
): 0 | 1 | -1 {
  const refBounds = engine.getSubplotBounds(0);
  const distBounds = engine.getSubplotBounds(1);

  if (
    py >= refBounds.top &&
    py <= refBounds.top + refBounds.height
  ) {
    return 0;
  }

  if (
    py >= distBounds.top &&
    py <= distBounds.top + distBounds.height
  ) {
    return 1;
  }

  return -1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the nearest value in a sorted Float64Array.
 */
function findNearestIndex(arr: Float64Array, target: number): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return 0;

  // Binary search for the closest value
  let lo = 0;
  let hi = arr.length - 1;

  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= target) lo = mid;
    else hi = mid;
  }

  // Compare lo and hi to find the nearest
  return Math.abs(arr[lo] - target) <= Math.abs(arr[hi] - target) ? lo : hi;
}
