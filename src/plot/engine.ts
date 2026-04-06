/**
 * PlotEngine — Plotly.js wrapper with project conventions for AnalySeries.
 *
 * Manages one Plotly plot that may contain multiple subplots. All trace
 * mutations flow through Plotly.react() to avoid index-shifting bugs
 * inherent in addTraces/deleteTraces.
 */

import * as Plotly from 'plotly.js-dist-min';

import type {
  TraceOptions,
  SubplotConfig,
  AxisConfig,
  TwinYConfig,
  TwinXConfig,
  VerticalLineStyle,
  ManagedTrace,
  SubplotAxisMap,
  SecondaryXAxisState,
  PixelPoint,
  DataPoint,
  SubplotBounds,
} from './types.js';

import {
  subplotToLayoutKey,
  layoutKeyToAnchor,
  computeSubplotDomains,
  computeSecondaryTicks,
  applyAxisConfig,
  createTwinYAxis,
  createTwinXAxis,
  createSecondaryXAxis,
  computeProportionalZoomFactors,
  DEFAULT_AXIS_STYLE,
} from './axes.js';

import { createVerticalLineShapes } from './shapes.js';

import {
  dataToPixel as coordsDataToPixel,
  pixelToData as coordsPixelToData,
  getSubplotBounds as coordsGetSubplotBounds,
  getAxisRange as coordsGetAxisRange,
} from './coords.js';

// Re-export pure functions that consumers depend on
export {
  subplotToLayoutKey,
  layoutKeyToAnchor,
  computeSubplotDomains,
  niceNum,
  niceTicks,
  computeSecondaryTicks,
} from './axes.js';

export type {
  TraceOptions,
  SubplotConfig,
  AxisConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Point count threshold above which traces auto-switch to WebGL. */
export const WEBGL_THRESHOLD = 5000;

const DEFAULT_CONFIG: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['select2d', 'lasso2d'] as Plotly.ModeBarDefaultButtons[],
  // Native scrollZoom disabled — we implement our own three-zone wheel handler
  // so the user can zoom X-only (scroll on X axis), Y-only (scroll on Y axis),
  // or both (scroll on plot area). Native scrollZoom zooms both axes uniformly,
  // which is unusable for data with extreme aspect ratios (e.g. X: 0–5000,
  // Y: 2.6–5.1).
  scrollZoom: false,
  doubleClick: 'autosize',
};


// ---------------------------------------------------------------------------
// PlotEngine
// ---------------------------------------------------------------------------

export class PlotEngine {
  /** The underlying Plotly div — exposed for event listening and overlay positioning. */
  readonly plotDiv: HTMLDivElement;

  private rows: number;
  private sharedX: boolean;
  private domains: [number, number][];
  private subplotAxes: SubplotAxisMap[];
  private nextAxisNum: number;
  private nextTraceId = 0;
  private traces = new Map<number, ManagedTrace>();
  private axisConfigs = new Map<string, Record<string, unknown>>();
  private twinAxisConfigs = new Map<string, Record<string, unknown>>();
  private secondaryXAxes = new Map<number, SecondaryXAxisState>();
  private shapes = new Map<string, Record<string, unknown>>();
  private updatingSecondaryTicks = false;
  private destroyed = false;
  private batchDepth = 0;
  private batchDirty = false;
  /** Axes the user has explicitly zoomed/panned — keyed by layout key. */
  private userRanges = new Map<string, [number, number]>();
  /** Bound wheel handler for cleanup in destroy(). */
  private wheelHandler: ((e: WheelEvent) => void) | null = null;

  constructor(container: HTMLElement, subplots?: SubplotConfig) {
    const rows = subplots?.rows ?? 1;
    const sharedX = subplots?.sharedX ?? false;
    const verticalSpacing = subplots?.verticalSpacing ?? 0.12;

    this.rows = rows;
    this.sharedX = sharedX;
    this.domains = computeSubplotDomains(rows, verticalSpacing);

    // Per-subplot axis tracking
    this.subplotAxes = [];
    for (let i = 0; i < rows; i++) {
      this.subplotAxes.push({
        x: [subplotToLayoutKey(i, 'x')],
        y: [subplotToLayoutKey(i, 'y')],
      });
    }
    this.nextAxisNum = rows + 1;

    // Create the Plotly target div
    this.plotDiv = document.createElement('div');
    this.plotDiv.style.width = '100%';
    this.plotDiv.style.height = '100%';
    container.appendChild(this.plotDiv);

    // Initial render
    const layout = this.buildLayout();
    Plotly.newPlot(
      this.plotDiv,
      [],
      layout as Partial<Plotly.Layout>,
      DEFAULT_CONFIG,
    );

    // Track user zoom/pan and update secondary-axis ticks
    (this.plotDiv as unknown as Plotly.PlotlyHTMLElement).on(
      'plotly_relayout' as 'plotly_click',
      ((eventData: unknown) => {
        if (eventData) this.trackUserRanges(eventData as Record<string, unknown>);
        this.handleRelayout();
      }) as (event: Plotly.PlotMouseEvent) => void,
    );

    // Custom three-zone scroll-wheel zoom (replaces Plotly's native scrollZoom).
    this.wheelHandler = (e: WheelEvent) => this.handleWheel(e);
    this.plotDiv.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  // ----- Batch control -----------------------------------------------------

  /**
   * Begin a batch update. While a batch is active, mutations accumulate
   * without triggering Plotly.react(). Call endUpdate() to flush.
   * Batches nest: only the outermost endUpdate() triggers the render.
   */
  beginUpdate(): void {
    this.batchDepth++;
  }

  /** End a batch update and render if this is the outermost batch. */
  endUpdate(): void {
    if (this.batchDepth <= 0) return;
    this.batchDepth--;
    if (this.batchDepth === 0 && this.batchDirty) {
      this.batchDirty = false;
      this.doRender();
    }
  }

  // ----- Trace management ------------------------------------------------

  /** Add a trace. Returns a stable trace ID for later updates/removal. */
  addTrace(options: TraceOptions): number {
    const id = this.nextTraceId++;
    this.traces.set(id, { id, options: { ...options } });
    this.render();
    return id;
  }

  /** Update an existing trace's data or style. */
  updateTrace(traceIndex: number, options: Partial<TraceOptions>): void {
    const trace = this.traces.get(traceIndex);
    if (!trace) return;
    trace.options = { ...trace.options, ...options };
    this.render();
  }

  /** Remove a trace by ID. */
  removeTrace(traceIndex: number): void {
    this.traces.delete(traceIndex);
    this.render();
  }

  /** Remove all traces and reset layout to defaults. */
  clear(): void {
    this.traces.clear();
    this.shapes.clear();
    this.axisConfigs.clear();
    this.twinAxisConfigs.clear();
    this.secondaryXAxes.clear();
    for (let i = 0; i < this.rows; i++) {
      this.subplotAxes[i] = {
        x: [subplotToLayoutKey(i, 'x')],
        y: [subplotToLayoutKey(i, 'y')],
      };
    }
    this.nextAxisNum = this.rows + 1;
    this.userRanges.clear();
    this.render();
  }

  // ----- Axis configuration ----------------------------------------------

  /** Configure a primary axis on a specific subplot. */
  configureAxis(
    axisType: 'x' | 'y',
    subplotIndex: number,
    config: AxisConfig,
  ): void {
    const axes = this.subplotAxes[subplotIndex];
    if (!axes) return;
    const layoutKey = axisType === 'x' ? axes.x[0] : axes.y[0];
    const prev = this.axisConfigs.get(layoutKey) ?? {};
    const update: Record<string, unknown> = { ...prev };
    applyAxisConfig(update, config);
    this.axisConfigs.set(layoutKey, update);
    this.render();
  }

  /**
   * Create a twin Y axis on a subplot.
   * Returns the axis index to use in TraceOptions.yAxisIndex.
   */
  addTwinY(
    subplotIndex: number,
    config: TwinYConfig,
  ): number {
    const axes = this.subplotAxes[subplotIndex];
    if (!axes) return 0;
    const { layoutKey, axisNum, axisConfig } = createTwinYAxis(
      axes,
      this.nextAxisNum,
      config,
    );
    this.nextAxisNum = axisNum + 1;
    this.twinAxisConfigs.set(layoutKey, axisConfig);
    axes.y.push(layoutKey);
    this.render();
    return axes.y.length - 1;
  }

  /**
   * Create a twin X axis on a subplot.
   * Returns the axis index to use in TraceOptions.xAxisIndex.
   */
  addTwinX(
    subplotIndex: number,
    config: TwinXConfig,
  ): number {
    const axes = this.subplotAxes[subplotIndex];
    if (!axes) return 0;
    const { layoutKey, axisNum, axisConfig } = createTwinXAxis(
      axes,
      this.nextAxisNum,
      config,
    );
    this.nextAxisNum = axisNum + 1;
    this.twinAxisConfigs.set(layoutKey, axisConfig);
    axes.x.push(layoutKey);
    this.render();
    return axes.x.length - 1;
  }

  /**
   * Add a secondary X axis at top of a subplot, with tick positions computed
   * from a transform function. Used for showing original depth values
   * alongside interpolated age values.
   *
   * transformFn maps from the primary X domain to the secondary X domain.
   */
  addSecondaryXAxis(
    subplotIndex: number,
    transformFn: (x: number) => number,
    label: string,
  ): void {
    const axes = this.subplotAxes[subplotIndex];
    if (!axes) return;
    const range = this.getAxisRange('x', subplotIndex);
    const { layoutKey, axisNum, axisConfig } = createSecondaryXAxis(
      axes,
      this.nextAxisNum,
      transformFn,
      label,
      range,
    );
    this.nextAxisNum = axisNum + 1;

    this.secondaryXAxes.set(subplotIndex, {
      layoutKey,
      transformFn,
      lastTicktext: null,
    });

    this.twinAxisConfigs.set(layoutKey, axisConfig);
    this.render();
  }

  // ----- Shapes ----------------------------------------------------------

  /**
   * Add vertical line markers as Plotly shapes.
   * Returns shape IDs for later removal.
   */
  addVerticalLines(
    xPositions: number[],
    subplotIndex: number,
    style?: VerticalLineStyle,
  ): string[] {
    const axes = this.subplotAxes[subplotIndex];
    if (!axes) return [];
    const shapePairs = createVerticalLineShapes(xPositions, axes, style);
    const ids: string[] = [];
    for (const [id, shape] of shapePairs) {
      this.shapes.set(id, shape);
      ids.push(id);
    }
    this.render();
    return ids;
  }

  /** Remove shapes by ID. */
  removeShapes(ids: string[]): void {
    for (const id of ids) this.shapes.delete(id);
    this.render();
  }

  // ----- Rendering -------------------------------------------------------

  /** Force re-render. Useful after lazy initialization. */
  refresh(): void {
    this.doRender();
  }

  /** Export plot as PNG data URL. */
  async toImageDataURL(width?: number, height?: number): Promise<string> {
    return Plotly.toImage(this.plotDiv, {
      format: 'png',
      width: width ?? (this.plotDiv.clientWidth || 800),
      height: height ?? (this.plotDiv.clientHeight || 600),
    });
  }

  // ----- Events ----------------------------------------------------------

  /**
   * Register callback for Plotly events.
   * Useful events: 'plotly_click', 'plotly_relayout', 'plotly_hover',
   * 'plotly_afterplot'
   */
  on(event: string, callback: (...args: unknown[]) => void): void {
    (this.plotDiv as unknown as Plotly.PlotlyHTMLElement).on(
      event as 'plotly_click',
      callback as (event: Plotly.PlotMouseEvent) => void,
    );
  }

  /**
   * Execute a partial layout update via Plotly.relayout.
   * Use for one-shot patches that have no dedicated helper (e.g.,
   * syncing axis ranges across subplots from an external event handler).
   */
  relayout(updates: Record<string, unknown>): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return Plotly.relayout(
      this.plotDiv,
      updates as unknown as Partial<Plotly.Layout>,
    ).then(() => {});
  }

  // ----- Axis queries (delegate to coords module) ------------------------

  /** Get the current axis range for a subplot. */
  getAxisRange(
    axisType: 'x' | 'y',
    subplotIndex: number,
  ): [number, number] {
    return coordsGetAxisRange(this.plotDiv, axisType, subplotIndex);
  }

  /**
   * Convert data coordinates to pixel position relative to the plot div.
   */
  dataToPixel(
    subplotIndex: number,
    x: number,
    y: number,
  ): PixelPoint {
    return coordsDataToPixel(this.plotDiv, subplotIndex, x, y);
  }

  /**
   * Convert pixel position to data coordinates.
   */
  pixelToData(
    subplotIndex: number,
    px: number,
    py: number,
  ): DataPoint {
    return coordsPixelToData(this.plotDiv, subplotIndex, px, py);
  }

  /**
   * Get the pixel bounding box of a subplot's plot area.
   */
  getSubplotBounds(subplotIndex: number): SubplotBounds {
    return coordsGetSubplotBounds(this.plotDiv, subplotIndex);
  }

  // ----- Cleanup ---------------------------------------------------------

  /** Destroy the plot and clean up. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.wheelHandler) {
      this.plotDiv.removeEventListener('wheel', this.wheelHandler);
      this.wheelHandler = null;
    }
    Plotly.purge(this.plotDiv);
    this.plotDiv.remove();
    this.traces.clear();
    this.shapes.clear();
    this.axisConfigs.clear();
    this.twinAxisConfigs.clear();
    this.secondaryXAxes.clear();
    this.userRanges.clear();
  }

  // ----- Private: custom scroll zoom --------------------------------------

  /**
   * Three-zone scroll-wheel zoom, matching the Python AnalySeries behaviour.
   *
   * Plotly's native scrollZoom zooms both axes by the same screen-space
   * factor. For data with extreme aspect ratios (X: 0–5000, Y: 2.6–5.1)
   * this makes a few scroll ticks collapse whichever axis has the smaller
   * pixel-to-data ratio, producing an unreadable view.
   *
   * Instead we detect *where* the cursor is and zoom accordingly:
   *   - Over the plot area → zoom both X and Y, centred on the cursor
   *   - Over the X-axis labels (below the plot area) → zoom X only
   *   - Over the Y-axis labels (left of the plot area)  → zoom Y only
   *
   * Zoom is always centred on the data value under the cursor, so the
   * point the user is looking at stays fixed on screen.
   */
  private handleWheel(e: WheelEvent): void {
    if (this.destroyed) return;

    // Determine which subplot the cursor is closest to.
    const rect = this.plotDiv.getBoundingClientRect();
    const mx = e.clientX - rect.left; // mouse X relative to plotDiv
    const my = e.clientY - rect.top;  // mouse Y relative to plotDiv

    // Find the subplot whose plot-area is closest to the cursor.
    let bestSubplot = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.rows; i++) {
      const b = this.getSubplotBounds(i);
      if (b.width === 0 || b.height === 0) continue;
      // Signed distances to each edge (negative = inside).
      const dx = Math.max(b.left - mx, 0, mx - (b.left + b.width));
      const dy = Math.max(b.top - my, 0, my - (b.top + b.height));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestSubplot = i;
      }
    }
    if (bestSubplot < 0) return; // no subplots (shouldn't happen)

    const bounds = this.getSubplotBounds(bestSubplot);
    if (bounds.width === 0 || bounds.height === 0) return;

    // Classify cursor zone.
    const inPlotX = mx >= bounds.left && mx <= bounds.left + bounds.width;
    const inPlotY = my >= bounds.top && my <= bounds.top + bounds.height;
    const belowPlot = my > bounds.top + bounds.height;
    const leftOfPlot = mx < bounds.left;

    let zoomX = false;
    let zoomY = false;
    if (inPlotX && inPlotY) {
      // Inside the plot area → zoom both
      zoomX = true;
      zoomY = true;
    } else if (belowPlot && inPlotX) {
      // Over the X-axis label area → zoom X only
      zoomX = true;
    } else if (leftOfPlot && inPlotY) {
      // Over the Y-axis label area → zoom Y only
      zoomY = true;
    } else {
      // Outside all zones (e.g. corner, title area) — ignore.
      return;
    }

    // If we got here we're handling the event — prevent page scroll.
    e.preventDefault();

    // Base scale factor: scroll up zooms in, scroll down zooms out.
    const baseFactor = e.deltaY > 0 ? 1.1 : 0.9;

    const xAxisKey = this.subplotAxes[bestSubplot].x[0];
    const yAxisKey = this.subplotAxes[bestSubplot].y[0];
    const updates: Record<string, unknown> = {};

    const curXRange = this.getAxisRange('x', bestSubplot);
    const curYRange = this.getAxisRange('y', bestSubplot);
    const dataPt = this.pixelToData(bestSubplot, mx, my);

    // When zooming a single axis (scroll on axis labels), use full factor.
    // When zooming both (scroll on plot area), weight each axis's factor
    // by its proportion of the total data range.  The axis spanning more
    // data units zooms at full speed; the narrow axis barely moves.
    // This preserves the aspect ratio established by initial load or
    // by prior axis-specific zooming.
    //
    // LR04 example: X spans 5320, Y spans 2.43.
    //   xExp = 5320/5320 = 1.0  → xFactor = 0.9   (full zoom)
    //   yExp = 2.43/5320 = 0.0005 → yFactor ≈ 1.0  (virtually no zoom)
    // Symmetric data: xExp = yExp = 1.0 → both zoom equally.
    let xFactor = baseFactor;
    let yFactor = baseFactor;

    if (zoomX && zoomY) {
      [xFactor, yFactor] = computeProportionalZoomFactors(
        baseFactor,
        Math.abs(curXRange[1] - curXRange[0]),
        Math.abs(curYRange[1] - curYRange[0]),
      );
    }

    if (zoomX) {
      const xData = dataPt.x;
      const newMin = xData - (xData - curXRange[0]) * xFactor;
      const newMax = xData + (curXRange[1] - xData) * xFactor;
      updates[`${xAxisKey}.range[0]`] = newMin;
      updates[`${xAxisKey}.range[1]`] = newMax;
      updates[`${xAxisKey}.autorange`] = false;
    }

    if (zoomY) {
      const yData = dataPt.y;
      const newMin = yData - (yData - curYRange[0]) * yFactor;
      const newMax = yData + (curYRange[1] - yData) * yFactor;
      updates[`${yAxisKey}.range[0]`] = newMin;
      updates[`${yAxisKey}.range[1]`] = newMax;
      updates[`${yAxisKey}.autorange`] = false;
    }

    Plotly.relayout(
      this.plotDiv,
      updates as unknown as Partial<Plotly.Layout>,
    );
  }

  // ----- Private ---------------------------------------------------------

  /** Build the full Plotly layout from current engine state. */
  private buildLayout(): Record<string, unknown> {
    const layout: Record<string, unknown> = {
      dragmode: 'pan',
      hovermode: 'closest',
      legend: { itemclick: 'toggle', itemdoubleclick: false },
      margin: { l: 80, r: 50, t: 50, b: 60 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
    };

    // Primary axes for each subplot
    for (let i = 0; i < this.rows; i++) {
      const xKey = this.subplotAxes[i].x[0];
      const yKey = this.subplotAxes[i].y[0];
      const xAnchor = layoutKeyToAnchor(yKey);
      const yAnchor = layoutKeyToAnchor(xKey);

      const xAxisObj: Record<string, unknown> = {
        ...DEFAULT_AXIS_STYLE,
        anchor: xAnchor,
        ...(this.axisConfigs.get(xKey) ?? {}),
      };

      // SharedX: link axis ranges via `matches` and hide tick labels on
      // non-bottom subplots so they track subplot 0's zoom/pan.
      if (this.sharedX && i > 0) {
        xAxisObj.matches = 'x';
      }
      if (this.sharedX && i < this.rows - 1) {
        xAxisObj.showticklabels = false;
      }

      layout[xKey] = xAxisObj;

      layout[yKey] = {
        ...DEFAULT_AXIS_STYLE,
        domain: this.domains[i],
        anchor: yAnchor,
        ...(this.axisConfigs.get(yKey) ?? {}),
      };
    }

    // Twin and secondary axes
    for (const [key, config] of this.twinAxisConfigs) {
      layout[key] = config;
    }

    // Shapes — always set to ensure Plotly.react() clears removed shapes
    layout.shapes = this.shapes.size > 0
      ? Array.from(this.shapes.values())
      : [];

    return layout;
  }

  /** Build the Plotly data array from managed traces. */
  private buildData(): Record<string, unknown>[] {
    const data: Record<string, unknown>[] = [];

    for (const trace of this.traces.values()) {
      const opts = trace.options;
      const subplot = opts.subplot ?? 0;
      const yAxisIndex = opts.yAxisIndex ?? 0;
      const axes = this.subplotAxes[subplot];
      if (!axes) continue;

      const xAxisIndex = opts.xAxisIndex ?? 0;
      const xKey = axes.x[xAxisIndex] ?? axes.x[0];
      const yKey = axes.y[yAxisIndex] ?? axes.y[0];

      // Auto WebGL for large datasets
      const len = opts.x ? opts.x.length : 0;
      const useWebGL =
        opts.webgl !== undefined ? opts.webgl : len > WEBGL_THRESHOLD;

      data.push({
        x: opts.x,
        y: opts.y,
        type: useWebGL ? 'scattergl' : 'scatter',
        mode: opts.showMarkers ? 'lines+markers' : 'lines',
        name: opts.name ?? '',
        line: { color: opts.color, width: opts.width ?? 0.8, dash: opts.dash },
        opacity: opts.opacity ?? 1,
        xaxis: layoutKeyToAnchor(xKey),
        yaxis: layoutKeyToAnchor(yKey),
      });
    }

    return data;
  }

  /**
   * Schedule a render. Respects batch mode: if inside a beginUpdate/endUpdate
   * bracket, defers the actual Plotly.react() call until endUpdate().
   */
  private render(): void {
    if (this.destroyed) return;
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    this.doRender();
  }

  /** Commit current traces + layout to Plotly via react(). */
  private doRender(): void {
    if (this.destroyed) return;
    const data = this.buildData();
    const layout = this.buildLayout();

    // Preserve user zoom/pan: if the user has explicitly zoomed an axis and
    // our config doesn't set a range, carry forward the user's range.
    for (const [axisKey, range] of this.userRanges) {
      const axisLayout = layout[axisKey] as Record<string, unknown> | undefined;
      if (
        axisLayout &&
        axisLayout.autorange === undefined &&
        axisLayout.range === undefined
      ) {
        axisLayout.range = range;
        axisLayout.autorange = false;
      }
    }

    Plotly.react(
      this.plotDiv,
      data as Plotly.Data[],
      layout as Partial<Plotly.Layout>,
      DEFAULT_CONFIG,
    );

    // After each render, capture computed axis ranges so that subsequent
    // renders (e.g. from adding shapes) preserve the current view.
    this.captureCurrentRanges();
  }

  /**
   * Snapshot current axis ranges from Plotly's internal layout.
   *
   * Called after every `Plotly.react()` so that subsequent react
   * calls (e.g., from adding shapes or traces) preserve the view
   * the user is currently looking at, even if no explicit zoom has
   * occurred yet.  Without this, the first trace mutation after
   * initial load would reset autoranged axes.
   */
  private captureCurrentRanges(): void {
    for (let i = 0; i < this.rows; i++) {
      const xKey = this.subplotAxes[i].x[0];
      const yKey = this.subplotAxes[i].y[0];
      try {
        const xr = coordsGetAxisRange(this.plotDiv, 'x', i);
        if (xr[0] !== xr[1]) this.userRanges.set(xKey, xr);
      } catch { /* axis not yet rendered */ }
      try {
        const yr = coordsGetAxisRange(this.plotDiv, 'y', i);
        if (yr[0] !== yr[1]) this.userRanges.set(yKey, yr);
      } catch { /* axis not yet rendered */ }
    }
  }

  /**
   * Record axis ranges that the user has set via zoom/pan.
   */
  private trackUserRanges(eventData: Record<string, unknown>): void {
    for (const key of Object.keys(eventData)) {
      const m = key.match(/^([xy]axis\d*)\.range\[0\]$/);
      if (m) {
        const axisKey = m[1];
        const r0 = eventData[`${axisKey}.range[0]`] as number;
        const r1 = eventData[`${axisKey}.range[1]`] as number;
        if (r0 !== undefined && r1 !== undefined) {
          this.userRanges.set(axisKey, [r0, r1]);
        }
      }
      const ma = key.match(/^([xy]axis\d*)\.autorange$/);
      if (ma) {
        this.userRanges.delete(ma[1]);
      }
    }
  }

  /** Recompute secondary-axis ticks after zoom/pan. */
  private handleRelayout(): void {
    if (this.updatingSecondaryTicks || this.secondaryXAxes.size === 0) return;

    const updates: Record<string, unknown> = {};
    let hasChanges = false;

    for (const [subplotIndex, state] of this.secondaryXAxes) {
      const range = this.getAxisRange('x', subplotIndex);
      if (range[0] === range[1]) continue;
      const { tickvals, ticktext } = computeSecondaryTicks(
        range,
        state.transformFn,
        8,
      );

      // Skip relayout if ticks haven't changed (prevents infinite loop)
      if (
        state.lastTicktext !== null &&
        state.lastTicktext.length === ticktext.length &&
        state.lastTicktext.every((t, i) => t === ticktext[i])
      ) {
        continue;
      }

      state.lastTicktext = ticktext;

      // Keep stored config in sync
      const existing = this.twinAxisConfigs.get(state.layoutKey);
      if (existing) {
        existing.tickvals = tickvals;
        existing.ticktext = ticktext;
      }
      updates[`${state.layoutKey}.tickvals`] = tickvals;
      updates[`${state.layoutKey}.ticktext`] = ticktext;
      hasChanges = true;
    }

    if (hasChanges) {
      this.updatingSecondaryTicks = true;
      Plotly.relayout(
        this.plotDiv,
        updates as unknown as Partial<Plotly.Layout>,
      ).finally(() => {
        this.updatingSecondaryTicks = false;
      });
    }
  }
}
