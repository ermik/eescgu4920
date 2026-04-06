/**
 * Axis utilities — naming conventions, domain computation, twin axis creation,
 * secondary axis tick computation.
 *
 * All pure functions are exported and testable without DOM or Plotly.
 */

import { formatNumber } from '../utils.js';
import type { AxisConfig, TwinYConfig, TwinXConfig, SubplotAxisMap } from './types.js';

// ---------------------------------------------------------------------------
// Axis naming arithmetic
// ---------------------------------------------------------------------------

/**
 * Map a 0-indexed subplot and axis dimension to the Plotly layout key.
 *
 * Plotly convention: subplot 0 uses 'xaxis'/'yaxis' (no number suffix).
 * Subplot 1 uses 'xaxis2'/'yaxis2', subplot 2 uses 'xaxis3'/'yaxis3', etc.
 *
 *   subplotToLayoutKey(0, 'x') → 'xaxis'
 *   subplotToLayoutKey(1, 'y') → 'yaxis2'
 */
export function subplotToLayoutKey(subplot: number, dim: 'x' | 'y'): string {
  const suffix = subplot === 0 ? '' : String(subplot + 1);
  return dim + 'axis' + suffix;
}

/**
 * Convert a Plotly layout key to the anchor string used in trace data.
 *
 *   layoutKeyToAnchor('xaxis')  → 'x'
 *   layoutKeyToAnchor('yaxis2') → 'y2'
 *   layoutKeyToAnchor('xaxis3') → 'x3'
 */
export function layoutKeyToAnchor(key: string): string {
  return key.replace('axis', '');
}

// ---------------------------------------------------------------------------
// Subplot domain computation
// ---------------------------------------------------------------------------

/**
 * Compute vertical domains for N vertically-stacked subplots.
 *
 * Subplot 0 is at the top. Returns array of [bottom, top] domain pairs.
 * Each pair sums to a fraction of 1, with `gap` between adjacent subplots.
 */
export function computeSubplotDomains(
  rows: number,
  gap: number,
): [number, number][] {
  if (rows <= 0) return [];
  if (rows === 1) return [[0, 1]];
  const available = 1 - gap * (rows - 1);
  const height = available / rows;
  const domains: [number, number][] = [];
  for (let i = 0; i < rows; i++) {
    const top = 1 - i * (height + gap);
    const bottom = top - height;
    domains.push([Math.max(0, bottom), Math.min(1, top)]);
  }
  return domains;
}

// ---------------------------------------------------------------------------
// Nice number / tick utilities
// ---------------------------------------------------------------------------

/**
 * Find a "nice" number: 1, 2, or 5 x 10^n. Used for tick generation.
 */
export function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 0;
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

/**
 * Generate evenly-spaced "nice" tick values covering [lo, hi].
 */
export function niceTicks(lo: number, hi: number, nticks: number): number[] {
  if (nticks <= 1 || lo >= hi) return [lo];
  const range = niceNum(hi - lo, false);
  const step = niceNum(range / (nticks - 1), true);
  if (step <= 0) return [lo, hi];
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 0.01; v += step) {
    ticks.push(parseFloat(v.toPrecision(12)));
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Secondary axis tick computation
// ---------------------------------------------------------------------------

/**
 * Compute tick positions and labels for a secondary axis linked by a
 * transform function.
 *
 * Generates tickCount+1 evenly spaced positions in the primary range
 * and applies transformFn to produce tick labels.
 */
export function computeSecondaryTicks(
  primaryRange: [number, number],
  transformFn: (x: number) => number,
  tickCount: number,
): { tickvals: number[]; ticktext: string[] } {
  const [xMin, xMax] = primaryRange;
  const n = Math.max(1, tickCount);
  const tickvals: number[] = [];
  const ticktext: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + (xMax - xMin) * (i / n);
    tickvals.push(x);
    ticktext.push(formatNumber(transformFn(x), 1));
  }
  return { tickvals, ticktext };
}

// ---------------------------------------------------------------------------
// Proportional zoom weighting
// ---------------------------------------------------------------------------

/**
 * Compute per-axis zoom factors for "zoom both" mode.
 *
 * When scrolling over the plot area, both axes should zoom, but the axis
 * spanning more data units should zoom at full speed while the narrow axis
 * zooms proportionally less. This prevents a few scroll ticks from collapsing
 * the small-range axis (e.g. Y: 2.6–5.1) when the other axis is wide
 * (e.g. X: 0–5320).
 *
 * Each axis's effective factor is `baseFactor ^ (span / maxSpan)`:
 *   - The dominant axis gets exponent 1.0 → full baseFactor
 *   - A narrow axis gets a small exponent → factor close to 1.0 (barely zooms)
 *   - Equal spans → both exponents = 1.0 → classic uniform zoom
 *
 * Returns [xFactor, yFactor].
 */
export function computeProportionalZoomFactors(
  baseFactor: number,
  xSpan: number,
  ySpan: number,
): [number, number] {
  const maxSpan = Math.max(xSpan, ySpan);
  if (maxSpan <= 0) return [baseFactor, baseFactor];
  const xExp = xSpan / maxSpan;
  const yExp = ySpan / maxSpan;
  return [Math.pow(baseFactor, xExp), Math.pow(baseFactor, yExp)];
}

// ---------------------------------------------------------------------------
// Axis config application
// ---------------------------------------------------------------------------

/**
 * Apply AxisConfig properties to a Plotly layout axis object.
 */
export function applyAxisConfig(
  axis: Record<string, unknown>,
  config: AxisConfig,
): void {
  if (config.title !== undefined) {
    const titleObj: Record<string, unknown> = { text: config.title };
    if (config.titleColor) titleObj.font = { color: config.titleColor };
    axis.title = titleObj;
  }
  if (config.type !== undefined) axis.type = config.type;

  if (config.reversed && config.range) {
    const [lo, hi] = config.range;
    axis.range = [Math.max(lo, hi), Math.min(lo, hi)];
    axis.autorange = false;
  } else if (config.reversed) {
    axis.autorange = 'reversed';
  } else if (config.range) {
    axis.range = config.range;
    axis.autorange = false;
  }
}

// ---------------------------------------------------------------------------
// Twin axis creation helpers
// ---------------------------------------------------------------------------

/**
 * Create a twin Y axis configuration for overlaying on a subplot.
 * Returns the new layout key and the axis configuration object.
 */
export function createTwinYAxis(
  subplotAxes: SubplotAxisMap,
  nextAxisNum: number,
  config: TwinYConfig,
): { layoutKey: string; axisNum: number; axisConfig: Record<string, unknown> } {
  const layoutKey = `yaxis${nextAxisNum}`;
  const primaryYAnchor = layoutKeyToAnchor(subplotAxes.y[0]);
  const primaryXAnchor = layoutKeyToAnchor(subplotAxes.x[0]);
  const side = config.side ?? 'right';

  const axis: Record<string, unknown> = {
    overlaying: primaryYAnchor,
    side,
    showgrid: false,
  };

  if (config.offset !== undefined) {
    axis.anchor = 'free';
    axis.position =
      side === 'right' ? 1 - config.offset / 100 : config.offset / 100;
  } else {
    axis.anchor = primaryXAnchor;
  }

  applyAxisConfig(axis, config);
  return { layoutKey, axisNum: nextAxisNum, axisConfig: axis };
}

/**
 * Create a twin X axis configuration for overlaying on a subplot.
 * Returns the new layout key and the axis configuration object.
 */
export function createTwinXAxis(
  subplotAxes: SubplotAxisMap,
  nextAxisNum: number,
  config: TwinXConfig,
): { layoutKey: string; axisNum: number; axisConfig: Record<string, unknown> } {
  const layoutKey = `xaxis${nextAxisNum}`;
  const primaryXAnchor = layoutKeyToAnchor(subplotAxes.x[0]);
  const primaryYAnchor = layoutKeyToAnchor(subplotAxes.y[0]);
  const side = config.side ?? 'top';

  const axis: Record<string, unknown> = {
    overlaying: primaryXAnchor,
    side,
    showgrid: false,
  };

  if (config.offset !== undefined) {
    axis.anchor = 'free';
    axis.position =
      side === 'top' ? 1 - config.offset / 100 : config.offset / 100;
  } else {
    axis.anchor = primaryYAnchor;
  }

  applyAxisConfig(axis, config);
  return { layoutKey, axisNum: nextAxisNum, axisConfig: axis };
}

/**
 * Create a secondary X axis configuration with tick positions computed
 * from a transform function.
 */
export function createSecondaryXAxis(
  subplotAxes: SubplotAxisMap,
  nextAxisNum: number,
  transformFn: (x: number) => number,
  label: string,
  primaryRange: [number, number],
): { layoutKey: string; axisNum: number; axisConfig: Record<string, unknown> } {
  const layoutKey = `xaxis${nextAxisNum}`;
  const primaryXAnchor = layoutKeyToAnchor(subplotAxes.x[0]);
  const primaryYAnchor = layoutKeyToAnchor(subplotAxes.y[0]);

  const { tickvals, ticktext } = computeSecondaryTicks(primaryRange, transformFn, 8);

  const axis: Record<string, unknown> = {
    overlaying: primaryXAnchor,
    side: 'top',
    anchor: primaryYAnchor,
    tickmode: 'array',
    tickvals,
    ticktext,
    title: { text: label },
    showgrid: false,
  };

  return { layoutKey, axisNum: nextAxisNum, axisConfig: axis };
}

// ---------------------------------------------------------------------------
// Default axis style
// ---------------------------------------------------------------------------

export const DEFAULT_AXIS_STYLE: Record<string, unknown> = {
  showgrid: true,
  gridcolor: 'lightgray',
  gridwidth: 0.5,
  griddash: 'dash',
};
