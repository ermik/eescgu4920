/**
 * Coordinate conversion utilities — data-to-pixel and pixel-to-data.
 *
 * Uses Plotly's internal _fullLayout axis objects. The l2p()/p2l() methods
 * convert between data values and pixel offsets from the axis origin.
 * The _offset property gives the pixel position of the axis origin
 * relative to the plot div.
 *
 * These internals are undocumented but stable across Plotly.js versions.
 */

import { subplotToLayoutKey } from './axes.js';
import type { PixelPoint, DataPoint, SubplotBounds } from './types.js';

// ---------------------------------------------------------------------------
// Internal Plotly type helpers
// ---------------------------------------------------------------------------

interface PlotlyAxisInternal {
  l2p?: (v: number) => number;
  p2l?: (v: number) => number;
  _offset?: number;
  _length?: number;
  range?: [number, number];
}

function getFullLayout(
  plotDiv: HTMLDivElement,
): Record<string, PlotlyAxisInternal> | null {
  const fl = (plotDiv as unknown as Record<string, unknown>)._fullLayout;
  return (fl as Record<string, PlotlyAxisInternal>) ?? null;
}

// ---------------------------------------------------------------------------
// Data <-> Pixel conversion
// ---------------------------------------------------------------------------

/**
 * Convert data coordinates to pixel position relative to the plot div.
 *
 * Returns {px: 0, py: 0} if Plotly internals are unavailable (e.g., before
 * first render or in tests with mocked Plotly).
 */
export function dataToPixel(
  plotDiv: HTMLDivElement,
  subplotIndex: number,
  x: number,
  y: number,
): PixelPoint {
  const fullLayout = getFullLayout(plotDiv);
  if (!fullLayout) return { px: 0, py: 0 };

  const xa = fullLayout[subplotToLayoutKey(subplotIndex, 'x')];
  const ya = fullLayout[subplotToLayoutKey(subplotIndex, 'y')];
  if (!xa?.l2p || !ya?.l2p) return { px: 0, py: 0 };

  return {
    px: xa.l2p(x) + (xa._offset ?? 0),
    py: ya.l2p(y) + (ya._offset ?? 0),
  };
}

/**
 * Convert pixel position to data coordinates.
 *
 * Needed for custom click handlers (e.g., shift+click to place tie-point).
 */
export function pixelToData(
  plotDiv: HTMLDivElement,
  subplotIndex: number,
  px: number,
  py: number,
): DataPoint {
  const fullLayout = getFullLayout(plotDiv);
  if (!fullLayout) return { x: 0, y: 0 };

  const xa = fullLayout[subplotToLayoutKey(subplotIndex, 'x')];
  const ya = fullLayout[subplotToLayoutKey(subplotIndex, 'y')];
  if (!xa?.p2l || !ya?.p2l) return { x: 0, y: 0 };

  return {
    x: xa.p2l(px - (xa._offset ?? 0)),
    y: ya.p2l(py - (ya._offset ?? 0)),
  };
}

/**
 * Get the pixel bounding box of a subplot's plot area.
 */
export function getSubplotBounds(
  plotDiv: HTMLDivElement,
  subplotIndex: number,
): SubplotBounds {
  const fullLayout = getFullLayout(plotDiv);
  if (!fullLayout) return { left: 0, top: 0, width: 0, height: 0 };

  const xa = fullLayout[subplotToLayoutKey(subplotIndex, 'x')];
  const ya = fullLayout[subplotToLayoutKey(subplotIndex, 'y')];
  if (!xa || !ya) return { left: 0, top: 0, width: 0, height: 0 };

  return {
    left: xa._offset ?? 0,
    top: ya._offset ?? 0,
    width: xa._length ?? 0,
    height: ya._length ?? 0,
  };
}

/**
 * Get the current visible axis range for a subplot.
 *
 * Reads from Plotly's _fullLayout. Returns [0, 1] if not yet rendered.
 */
export function getAxisRange(
  plotDiv: HTMLDivElement,
  axisType: 'x' | 'y',
  subplotIndex: number,
): [number, number] {
  const fullLayout = getFullLayout(plotDiv);
  const layoutKey = subplotToLayoutKey(subplotIndex, axisType);
  if (!fullLayout?.[layoutKey]?.range) return [0, 1];
  const r = fullLayout[layoutKey].range!;
  return [r[0], r[1]];
}
