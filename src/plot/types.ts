/**
 * Shared types for the plot engine module.
 */

// ---------------------------------------------------------------------------
// Trace options
// ---------------------------------------------------------------------------

export interface TraceOptions {
  /** X values */
  x: Float64Array | number[];
  /** Y values */
  y: Float64Array | number[];
  /** Display name (legend and hover) */
  name?: string;
  /** Line color as hex string or CSS color */
  color?: string;
  /** Line width (default 0.8) */
  width?: number;
  /** Line dash style (default 'solid') */
  dash?: 'solid' | 'dash' | 'dot' | 'dashdot';
  /** Opacity 0-1 (default 1) */
  opacity?: number;
  /** Show markers in addition to lines */
  showMarkers?: boolean;
  /** Subplot index, 0-based (default 0) */
  subplot?: number;
  /** Y axis index within the subplot: 0 = primary, 1 = first twin, etc. */
  yAxisIndex?: number;
  /** X axis index within the subplot: 0 = primary, 1 = first twin, etc. */
  xAxisIndex?: number;
  /** Force WebGL renderer (default: auto, true if >5000 points) */
  webgl?: boolean;
}

// ---------------------------------------------------------------------------
// Subplot configuration
// ---------------------------------------------------------------------------

export interface SubplotConfig {
  /** Number of subplot rows */
  rows: number;
  /** Whether subplots share X axes via Plotly `matches` (default false) */
  sharedX?: boolean;
  /** Vertical spacing between subplots 0-1 (default 0.12) */
  verticalSpacing?: number;
}

// ---------------------------------------------------------------------------
// Axis configuration
// ---------------------------------------------------------------------------

export interface AxisConfig {
  title?: string;
  /** Title color (for twin axes with different colors) */
  titleColor?: string;
  /** Log or linear scale */
  type?: 'linear' | 'log';
  /** Reverse axis direction */
  reversed?: boolean;
  /** Fixed range [min, max] - if omitted, autorange */
  range?: [number, number];
}

export interface TwinYConfig extends AxisConfig {
  side?: 'left' | 'right';
  /** Offset as percentage of plot width (used with `position` in Plotly) */
  offset?: number;
}

export interface TwinXConfig extends AxisConfig {
  side?: 'top' | 'bottom';
  /** Offset as percentage of plot height */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Shape styles
// ---------------------------------------------------------------------------

export interface VerticalLineStyle {
  color?: string;
  dash?: 'solid' | 'dash' | 'dot';
  width?: number;
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Connection overlay
// ---------------------------------------------------------------------------

export interface Connection {
  id: string;
  /** X data coordinate in the reference subplot */
  x1: number;
  /** X data coordinate in the distorted subplot */
  x2: number;
}

// ---------------------------------------------------------------------------
// Internal types (used across modules but not part of public API)
// ---------------------------------------------------------------------------

export interface ManagedTrace {
  id: number;
  options: TraceOptions;
}

export interface SubplotAxisMap {
  /** Layout keys for X axes: [0] = primary, [1..] = twins */
  x: string[];
  /** Layout keys for Y axes: [0] = primary, [1..] = twins */
  y: string[];
}

export interface SecondaryXAxisState {
  layoutKey: string;
  transformFn: (x: number) => number;
  /** Cached tick text from last update, used to skip redundant relayouts */
  lastTicktext: string[] | null;
}

// ---------------------------------------------------------------------------
// Pixel / data coordinate types
// ---------------------------------------------------------------------------

export interface PixelPoint {
  px: number;
  py: number;
}

export interface DataPoint {
  x: number;
  y: number;
}

export interface SubplotBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
