/**
 * Interpolated overlay — compute and render the distorted series
 * transformed onto the reference time axis using the current tie-points.
 *
 * Also provides the transform functions used by the secondary X axis
 * and the gradient (sedimentation rate) computation.
 */

import { createLinearInterpFn } from '../../math/interp.js';
import { createPchipInterpFn } from '../../math/pchip.js';
import type { PlotEngine } from '../../plot/engine.js';
import type { InterpolationState } from './state.js';
import type { InterpolationMode } from './types.js';

// ---------------------------------------------------------------------------
// Interpolation function creation
// ---------------------------------------------------------------------------

/**
 * Create bidirectional interpolation functions from tie-point coordinates.
 *
 * f_1to2: reference X → distorted X
 * f_2to1: distorted X → reference X
 *
 * Both functions extrapolate linearly outside the data range.
 */
export function createInterpFunctions(
  x1Coords: number[],
  x2Coords: number[],
  mode: InterpolationMode,
): { f_1to2: (x: number) => number; f_2to1: (x: number) => number } {
  const createFn =
    mode === 'Linear' ? createLinearInterpFn : createPchipInterpFn;

  return {
    f_1to2: createFn(x1Coords, x2Coords),
    f_2to1: createFn(x2Coords, x1Coords),
  };
}

// ---------------------------------------------------------------------------
// Transform distorted series to reference axis
// ---------------------------------------------------------------------------

/**
 * Transform the distorted series' X coordinates through the interpolation
 * mapping, producing coordinates on the reference axis.
 *
 * Returns null if fewer than 2 tie-points exist.
 */
export function computeTransformedX(
  state: InterpolationState,
): { transformedX: Float64Array; f_1to2: (x: number) => number; f_2to1: (x: number) => number } | null {
  if (!state.canInterpolate) return null;

  const { f_1to2, f_2to1 } = createInterpFunctions(
    state.x1Coords,
    state.x2Coords,
    state.interpolationMode,
  );

  const distX = state.distItem.index;
  const transformedX = new Float64Array(distX.length);
  for (let i = 0; i < distX.length; i++) {
    transformedX[i] = f_2to1(distX[i]);
  }

  return { transformedX, f_1to2, f_2to1 };
}

// ---------------------------------------------------------------------------
// Gradient (sedimentation rate) computation
// ---------------------------------------------------------------------------

/**
 * Compute the gradient dx/dy (sedimentation rate) for the given mode.
 *
 * x2Values: evenly spaced values in the distorted domain
 * Returns: { x2Values, gradient } where gradient[i] ≈ Δx2 / Δ(f_2to1(x2))
 */
export function computeGradient(
  x1Coords: number[],
  x2Coords: number[],
  mode: InterpolationMode,
  nPoints = 100,
): { x2Values: Float64Array; gradient: Float64Array } | null {
  if (x1Coords.length < 2) return null;

  const { f_2to1 } = createInterpFunctions(x1Coords, x2Coords, mode);

  const x2Min = x2Coords[0];
  const x2Max = x2Coords[x2Coords.length - 1];
  const x2Values = new Float64Array(nPoints);
  const refValues = new Float64Array(nPoints);

  for (let i = 0; i < nPoints; i++) {
    const t = i / (nPoints - 1);
    x2Values[i] = x2Min + t * (x2Max - x2Min);
    refValues[i] = f_2to1(x2Values[i]);
  }

  // Numerical gradient: Δx2 / Δref (sedimentation rate)
  const gradient = new Float64Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    let dx2: number, dref: number;
    if (i === 0) {
      dx2 = x2Values[1] - x2Values[0];
      dref = refValues[1] - refValues[0];
    } else if (i === nPoints - 1) {
      dx2 = x2Values[nPoints - 1] - x2Values[nPoints - 2];
      dref = refValues[nPoints - 1] - refValues[nPoints - 2];
    } else {
      dx2 = x2Values[i + 1] - x2Values[i - 1];
      dref = refValues[i + 1] - refValues[i - 1];
    }
    gradient[i] = dref !== 0 ? dx2 / dref : 0;
  }

  return { x2Values, gradient };
}

// ---------------------------------------------------------------------------
// Overlay rendering — per-instance state
// ---------------------------------------------------------------------------

/**
 * Per-window overlay rendering state.
 *
 * Previous implementation used module-level variables, which meant opening
 * two interpolation windows simultaneously would corrupt shared state.
 * This class encapsulates the state per window instance.
 */
export class OverlayManager {
  private overlayTraceId: number | null = null;
  private overlayYAxisIndex: number | null = null;
  private secondaryXAdded = false;

  /**
   * Update or create the interpolated overlay trace on the reference subplot.
   *
   * When showInterpolated is false or fewer than 2 connections exist,
   * the overlay is hidden.
   */
  updateOverlay(
    state: InterpolationState,
    engine: PlotEngine,
  ): void {
    const result = state.showInterpolated ? computeTransformedX(state) : null;

    if (!result) {
      // Remove overlay if it exists
      if (this.overlayTraceId !== null) {
        engine.removeTrace(this.overlayTraceId);
        this.overlayTraceId = null;
      }
      return;
    }

    const { transformedX, f_1to2 } = result;

    // Ensure twin Y axis exists
    if (this.overlayYAxisIndex === null) {
      this.overlayYAxisIndex = engine.addTwinY(0, {
        title: state.distItem.yLabel,
        titleColor: state.distItem.color,
        side: 'right',
      });
    }

    // Add or update the overlay trace
    if (this.overlayTraceId === null) {
      this.overlayTraceId = engine.addTrace({
        x: transformedX,
        y: state.distItem.values,
        color: state.distItem.color,
        width: 0.8,
        opacity: 0.8,
        name: `${state.distItem.name} (interpolated)`,
        subplot: 0,
        yAxisIndex: this.overlayYAxisIndex,
      });
    } else {
      engine.updateTrace(this.overlayTraceId, {
        x: transformedX,
        y: state.distItem.values,
        color: state.distItem.color,
        name: `${state.distItem.name} (interpolated)`,
      });
    }

    // Add or update secondary X axis showing original depth values
    if (!this.secondaryXAdded) {
      engine.addSecondaryXAxis(0, f_1to2, state.distItem.xLabel);
      this.secondaryXAdded = true;
    }
  }

  /**
   * Reset overlay tracking state. Must be called when the window is
   * destroyed or series are switched.
   *
   * If an engine is provided, the overlay trace is removed from the plot
   * before clearing the tracking IDs.
   */
  resetOverlayState(engine?: PlotEngine): void {
    if (engine && this.overlayTraceId !== null) {
      engine.removeTrace(this.overlayTraceId);
    }
    this.overlayTraceId = null;
    this.overlayYAxisIndex = null;
    this.secondaryXAdded = false;
  }
}
