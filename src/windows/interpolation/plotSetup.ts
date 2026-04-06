/**
 * Plot setup — create the dual-subplot layout with reference and distorted
 * series traces, axis configuration, and the ConnectionOverlay.
 */

import { PlotEngine } from '../../plot/engine.js';
import { ConnectionOverlay } from '../../plot/connectionOverlay.js';
import type { InterpolationState } from './state.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlotSetupResult {
  engine: PlotEngine;
  overlay: ConnectionOverlay;
  refTraceId: number;
  distTraceId: number;
}

/**
 * Create the main interpolation plot with two subplots and a connection overlay.
 *
 * Subplot 0 (top): Reference series
 * Subplot 1 (bottom): Distorted series
 */
export function setupInterpolationPlot(
  container: HTMLDivElement,
  state: InterpolationState,
): PlotSetupResult {
  const engine = new PlotEngine(container, {
    rows: 2,
    verticalSpacing: 0.15,
  });

  engine.beginUpdate();

  // Reference series (top subplot)
  const refTraceId = engine.addTrace({
    x: state.refItem.index,
    y: state.refItem.values,
    color: state.refItem.color,
    width: 0.8,
    name: state.refItem.name,
    subplot: 0,
  });

  engine.configureAxis('x', 0, { title: state.refItem.xLabel });
  engine.configureAxis('y', 0, { title: state.refItem.yLabel });

  // Distorted series (bottom subplot)
  const distTraceId = engine.addTrace({
    x: state.distItem.index,
    y: state.distItem.values,
    color: state.distItem.color,
    width: 0.8,
    name: state.distItem.name,
    subplot: 1,
  });

  engine.configureAxis('x', 1, { title: state.distItem.xLabel });
  engine.configureAxis('y', 1, { title: state.distItem.yLabel });

  engine.endUpdate();

  // Connection overlay (SVG lines between subplots)
  const overlay = new ConnectionOverlay(engine, 0, 1);

  return { engine, overlay, refTraceId, distTraceId };
}
