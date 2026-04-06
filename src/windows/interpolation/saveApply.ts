/**
 * Save and apply — create InterpolationItem and optionally the
 * interpolated series from the current tie-point set.
 */

import type { SeriesItem, InterpolationItem } from '../../types.js';
import { generateId, generateColor, appendHistory } from '../../utils.js';
import type { InterpolationState } from './state.js';
import { createInterpFunctions } from './interpolatedOverlay.js';
import type { InterpolationMode } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an InterpolationItem from the current state.
 * Returns null if fewer than 2 tie-points exist.
 */
export function createInterpolationItem(
  state: InterpolationState,
): InterpolationItem | null {
  if (!state.canInterpolate) return null;

  // Batch F: history format includes ID and parameter summary
  const id = generateId();
  return {
    id,
    type: 'INTERPOLATION',
    name: 'Pointers',
    x1Coords: [...state.x1Coords],
    x2Coords: [...state.x2Coords],
    x1Name: state.refItem.xLabel,
    date: formatDate(),
    comment: '',
    history: `INTERPOLATION <i><b>${id}</b></i> with parameters :<ul><li>Reference : ${state.refItem.name}<li>Distorted : ${state.distItem.name}<li>Tie-points : ${state.x1Coords.length}</ul>`,
  };
}

/**
 * Create an interpolated series from the current state.
 * Transforms the distorted series' index through the tie-point mapping.
 */
export function createInterpolatedSeries(
  state: InterpolationState,
  interpolationId: string,
): SeriesItem | null {
  if (!state.canInterpolate) return null;

  const { f_2to1 } = createInterpFunctions(
    state.x1Coords,
    state.x2Coords,
    state.interpolationMode,
  );

  const distItem = state.distItem;
  const transformedIndex = new Float64Array(distItem.index.length);
  const xOriginalValues = new Float64Array(distItem.index.length);

  for (let i = 0; i < distItem.index.length; i++) {
    transformedIndex[i] = f_2to1(distItem.index[i]);
    xOriginalValues[i] = distItem.index[i];
  }

  const id = generateId();
  return {
    id,
    type: 'Series interpolated',
    name: `${distItem.name} interpolated`,
    date: formatDate(),
    comment: '',
    history: appendHistory(
      distItem.history,
      `Series <i><b>${distItem.id}</b></i> interpolated with INTERPOLATION <i><b>${interpolationId}</b></i> with mode ${state.interpolationMode}<BR>---> series <i><b>${id}</b></i>`,
    ),
    xLabel: state.refItem.xLabel,
    yLabel: distItem.yLabel,
    color: generateColor(distItem.color),
    index: transformedIndex,
    values: new Float64Array(distItem.values),
    interpolation: {
      interpolationMode: state.interpolationMode,
      x1Coords: [...state.x1Coords],
      x2Coords: [...state.x2Coords],
      xOriginalLabel: distItem.xLabel,
      xOriginalValues,
    },
  };
}

/**
 * Apply an existing InterpolationItem to a series.
 * Used by "Apply Interpolation" menu action (outside the window).
 */
export function applyInterpolation(
  interpItem: InterpolationItem,
  series: SeriesItem,
  mode: InterpolationMode,
): SeriesItem {
  const { f_2to1 } = createInterpFunctions(
    interpItem.x1Coords,
    interpItem.x2Coords,
    mode,
  );

  const transformedIndex = new Float64Array(series.index.length);
  const xOriginalValues = new Float64Array(series.index.length);

  for (let i = 0; i < series.index.length; i++) {
    transformedIndex[i] = f_2to1(series.index[i]);
    xOriginalValues[i] = series.index[i];
  }

  const id = generateId();
  return {
    id,
    type: 'Series interpolated',
    name: `${series.name} interpolated`,
    date: formatDate(),
    comment: '',
    history: appendHistory(
      series.history,
      `Series <i><b>${series.id}</b></i> interpolated with INTERPOLATION <i><b>${interpItem.id}</b></i> with mode ${mode}<BR>---> series <i><b>${id}</b></i>`,
    ),
    xLabel: interpItem.x1Name,
    yLabel: series.yLabel,
    color: generateColor(series.color),
    index: transformedIndex,
    values: new Float64Array(series.values),
    interpolation: {
      interpolationMode: mode,
      x1Coords: [...interpItem.x1Coords],
      x2Coords: [...interpItem.x2Coords],
      xOriginalLabel: series.xLabel,
      xOriginalValues,
    },
  };
}
