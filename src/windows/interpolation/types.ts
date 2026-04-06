/**
 * Types specific to the interpolation window.
 */

import type { SeriesItem, InterpolationItem } from '../../types.js';

// ---------------------------------------------------------------------------
// Pending pointer — a vertical line the user has placed but not yet connected
// ---------------------------------------------------------------------------

export interface PendingPointer {
  /** 0 = reference subplot, 1 = distorted subplot */
  subplot: 0 | 1;
  /** Data X coordinate where the pointer is placed */
  x: number;
  /** Whether the pointer was snapped to an actual data point (Ctrl+click) */
  snapped: boolean;
  /** Plotly shape ID for the vertical dashed line */
  shapeId: string;
}

// ---------------------------------------------------------------------------
// Connection — a committed tie-point linking two pointers
// ---------------------------------------------------------------------------

export interface TiePointConnection {
  /** Unique connection identifier */
  id: string;
  /** Reference X coordinate (subplot 0) */
  x1: number;
  /** Distorted X coordinate (subplot 1) */
  x2: number;
  /** Shape ID of the vertical line in the reference subplot */
  vlineRef: string;
  /** Shape ID of the vertical line in the distorted subplot */
  vlineDist: string;
  /** SVG line ID in the ConnectionOverlay */
  overlayLineId: string;
}

// ---------------------------------------------------------------------------
// Callbacks from the interpolation window to main.ts
// ---------------------------------------------------------------------------

export interface InterpolationCallbacks {
  onSaveInterpolation: (item: InterpolationItem) => void;
  onSaveInterpolationAndSeries: (
    interp: InterpolationItem,
    series: SeriesItem,
  ) => void;
}

// ---------------------------------------------------------------------------
// Interpolation mode
// ---------------------------------------------------------------------------

export type InterpolationMode = 'Linear' | 'PCHIP';
