/**
 * Pointers plot — gradient (sedimentation rate) visualization.
 *
 * Plots:
 *   - X2 vs X1 scatter+line (primary Y axis)
 *   - Gradient dx/dy for both Linear and PCHIP modes (twin Y axis)
 */

import { PlotEngine } from '../../plot/engine.js';
import type { InterpolationState } from './state.js';
import { computeGradient } from './interpolatedOverlay.js';

// ---------------------------------------------------------------------------
// Per-instance pointers plot manager
// ---------------------------------------------------------------------------

/**
 * Manages a single pointers plot instance. Previous implementation used
 * module-level variables, which meant opening two interpolation windows
 * simultaneously would corrupt shared state.
 */
export class PointersPlotManager {
  private plotEngine: PlotEngine | null = null;
  private scatterTraceId: number | null = null;
  private gradientLinearTraceId: number | null = null;
  private gradientPchipTraceId: number | null = null;
  private gradientYAxisIndex: number | null = null;

  /**
   * Create the pointers plot container and engine.
   */
  createPointersPlot(container: HTMLDivElement): PlotEngine {
    this.plotEngine = new PlotEngine(container);
    return this.plotEngine;
  }

  /**
   * Update the pointers plot with current tie-point data.
   */
  updatePointersPlot(
    state: InterpolationState,
  ): void {
    if (!this.plotEngine) return;

    const { x1Coords, x2Coords } = state;

    // Clear existing traces
    if (this.scatterTraceId !== null) {
      this.plotEngine.removeTrace(this.scatterTraceId);
      this.scatterTraceId = null;
    }
    if (this.gradientLinearTraceId !== null) {
      this.plotEngine.removeTrace(this.gradientLinearTraceId);
      this.gradientLinearTraceId = null;
    }
    if (this.gradientPchipTraceId !== null) {
      this.plotEngine.removeTrace(this.gradientPchipTraceId);
      this.gradientPchipTraceId = null;
    }

    if (x1Coords.length < 2) return;

    this.plotEngine.beginUpdate();

    // Scatter + line: X2 vs X1
    this.scatterTraceId = this.plotEngine.addTrace({
      x: new Float64Array(x2Coords),
      y: new Float64Array(x1Coords),
      color: 'steelblue',
      width: 1,
      showMarkers: true,
      name: 'Tie-points',
    });

    this.plotEngine.configureAxis('x', 0, { title: state.distItem.xLabel });
    this.plotEngine.configureAxis('y', 0, { title: state.refItem.xLabel });

    // Gradient twin Y axis
    if (this.gradientYAxisIndex === null) {
      this.gradientYAxisIndex = this.plotEngine.addTwinY(0, {
        title: 'Gradients (dx/dy)',
        titleColor: 'darkorange',
        side: 'right',
      });
    }

    // Linear gradient
    const linearGrad = computeGradient(x1Coords, x2Coords, 'Linear');
    if (linearGrad) {
      this.gradientLinearTraceId = this.plotEngine.addTrace({
        x: linearGrad.x2Values,
        y: linearGrad.gradient,
        color: 'darkorange',
        width: 1,
        name: 'Linear',
        yAxisIndex: this.gradientYAxisIndex,
      });
    }

    // PCHIP gradient
    const pchipGrad = computeGradient(x1Coords, x2Coords, 'PCHIP');
    if (pchipGrad) {
      this.gradientPchipTraceId = this.plotEngine.addTrace({
        x: pchipGrad.x2Values,
        y: pchipGrad.gradient,
        color: 'darkorange',
        width: 1,
        dash: 'dash',
        opacity: 0.6,
        name: 'PCHIP',
        yAxisIndex: this.gradientYAxisIndex,
      });
    }

    this.plotEngine.endUpdate();
  }

  /**
   * Destroy the pointers plot engine.
   */
  destroyPointersPlot(): void {
    if (this.plotEngine) {
      this.plotEngine.destroy();
      this.plotEngine = null;
    }
    this.scatterTraceId = null;
    this.gradientLinearTraceId = null;
    this.gradientPchipTraceId = null;
    this.gradientYAxisIndex = null;
  }
}
