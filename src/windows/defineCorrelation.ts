/**
 * G4 — Correlation window.
 *
 * Auto-correlation (1 series) or cross-correlation (2 series).
 * Modes: correlation, covariance, crossproduct.
 * Optional FFT acceleration.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';
import { autoCorrelation, crossCorrelation } from '../math/correlation';
import type { CorrelationResult } from '../math/correlation';
import { resample } from '../math/sample';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function copyF64(src: Float64Array): Float64Array {
  const dst = new Float64Array(src.length);
  dst.set(src);
  return dst;
}

/** Check if a series is approximately evenly spaced. */
function isEvenlySpaced(index: Float64Array, tolerance: number = 0.01): boolean {
  if (index.length < 3) return true;
  const step = index[1] - index[0];
  for (let i = 2; i < index.length; i++) {
    if (Math.abs((index[i] - index[i - 1]) - step) / Math.abs(step) > tolerance) {
      return false;
    }
  }
  return true;
}

/** Compute the median step size of a series. */
function medianStep(index: Float64Array): number {
  const steps: number[] = [];
  for (let i = 1; i < index.length; i++) {
    steps.push(index[i] - index[i - 1]);
  }
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * Resample a series to even spacing using linear interpolation.
 * Returns new (index, values) pair.
 */
function makeEvenlySpaced(index: Float64Array, values: Float64Array): { index: Float64Array; values: Float64Array } {
  const step = medianStep(index);
  const min = index[0];
  const max = index[index.length - 1];
  const pts: number[] = [];
  for (let x = min; x <= max; x += step) pts.push(x);
  const sampled = resample(index, values, pts, 'linear', false);
  return { index: sampled.index, values: sampled.values };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineCorrelationWindow(
  items: SeriesItem[],
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const isAuto = items.length === 1;
  const el = document.createElement('div');
  el.className = 'as-window as-define-correlation-window';

  // Title
  const title = isAuto
    ? `Auto-correlation: ${items[0].name}`
    : `Cross-correlation: ${items[0].name} × ${items[1].name}`;

  // Refs
  const modeSelectRef = createRef<HTMLSelectElement>();
  const fftCbRef = createRef<HTMLInputElement>();
  const meanCbRef = createRef<HTMLInputElement>();
  const maxLagRef = createRef<HTMLInputElement>();
  const statusRef = createRef<HTMLDivElement>();
  const plotRef = createRef<HTMLDivElement>();

  const template = html`
    <div style="display:flex;gap:12px;align-items:center;padding:8px;flex-wrap:wrap">
      <label style="font-size:12px">Mode:</label>
      <select style="font-size:12px" ${ref(modeSelectRef)} @change=${compute}>
        <option value="correlation">correlation</option>
        <option value="covariance">covariance</option>
        <option value="crossproduct">crossproduct</option>
      </select>
      <label style="font-size:12px">
        <input type="checkbox" checked ${ref(fftCbRef)} @change=${compute}> Use FFT
      </label>
      <label style="font-size:12px">
        <input type="checkbox" checked ${ref(meanCbRef)} @change=${compute}> Remove mean
      </label>
      ${isAuto ? html`
        <label style="font-size:12px">Max lag:</label>
        <input type="number" value="" placeholder="auto"
          style="width:60px;font-size:12px"
          ${ref(maxLagRef)} @change=${compute}>
      ` : ''}
    </div>
    <div style="padding:0 8px;font-size:11px;color:#666" ${ref(statusRef)}></div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Access elements after render
  const modeSelect = modeSelectRef.value!;
  const fftCb = fftCbRef.value!;
  const meanCb = meanCbRef.value!;
  const maxLagInput = isAuto ? maxLagRef.value! : null;
  const statusEl = statusRef.value!;

  // Engine
  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  let currentResult: CorrelationResult | null = null;

  // Prepare evenly-spaced data
  let series1 = { index: items[0].index, values: items[0].values };
  let series2 = isAuto ? series1 : { index: items[1].index, values: items[1].values };
  let wasResampled = false;

  if (!isEvenlySpaced(series1.index)) {
    series1 = makeEvenlySpaced(series1.index, series1.values);
    wasResampled = true;
  }
  if (!isAuto && !isEvenlySpaced(series2.index)) {
    series2 = makeEvenlySpaced(series2.index, series2.values);
    wasResampled = true;
  }

  // For cross-correlation, ensure same length by trimming to overlap
  if (!isAuto && series1.values.length !== series2.values.length) {
    const minLen = Math.min(series1.values.length, series2.values.length);
    series1 = {
      index: series1.index.slice(0, minLen),
      values: series1.values.slice(0, minLen),
    };
    series2 = {
      index: series2.index.slice(0, minLen),
      values: series2.values.slice(0, minLen),
    };
  }

  if (wasResampled) {
    statusEl.textContent = 'Note: series resampled to even spacing (linear interpolation at median step).';
  }

  function compute(): void {
    const mode = modeSelect.value as 'correlation' | 'covariance' | 'crossproduct';
    const useFft = fftCb.checked;
    const removeMean = meanCb.checked;
    const maxLag = maxLagInput && maxLagInput.value !== ''
      ? parseInt(maxLagInput.value, 10)
      : undefined;

    const opts = { mode, useFft, removeMean, normalize: true, maxLag };

    if (isAuto) {
      currentResult = autoCorrelation(series1.values, opts);
    } else {
      currentResult = crossCorrelation(series1.values, series2.values, opts);
    }

    if (!currentResult) return;

    if (traceId < 0) {
      traceId = engine.addTrace({
        x: currentResult.lags,
        y: currentResult.values,
        color: '#d62728',
        width: 0.8,
        name: mode,
      });
      engine.configureAxis('x', 0, { title: 'Lag' });
      engine.configureAxis('y', 0, { title: mode });
    } else {
      engine.updateTrace(traceId, { x: currentResult.lags, y: currentResult.values, name: mode });
      engine.configureAxis('y', 0, { title: mode });
    }
  }

  compute();

  // Import
  function handleImport() {
    if (!currentResult) return;
    const mode = modeSelect.value;
    const id = generateId();
    const item: SeriesItem = {
      id,
      type: 'Series',
      name: isAuto
        ? `Auto-${mode} of ${items[0].name}`
        : `Cross-${mode} of ${items[0].name} × ${items[1].name}`,
      date: formatDate(),
      comment: '',
      history: isAuto
        ? `Auto-${mode} of series <i><b>${items[0].id}</b></i><BR>---> series <i><b>${id}</b></i>`
        : `Cross-${mode} of series <i><b>${items[0].id}</b></i> and <i><b>${items[1].id}</b></i><BR>---> series <i><b>${id}</b></i>`,
      xLabel: 'Lag',
      yLabel: mode,
      color: generateColor(),
      index: copyF64(currentResult.lags),
      values: copyF64(currentResult.values),
    };
    callbacks.onImport(item);
  }

  let closeCallback: (() => void) | null = null;

  const winId = isAuto
    ? 'correlation-' + items[0].id
    : 'correlation-' + items[0].id + '-' + items[1].id;

  return {
    id: winId,
    title,
    element: el,
    onClose: () => engine.destroy(),
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
