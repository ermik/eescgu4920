/**
 * Spectral Analysis window.
 *
 * Provides Periodogram, Blackman-Tukey, Maximum Entropy, and MTM methods
 * matching AnalySeries PDF §8.3.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';
import {
  periodogram, blackmanTukey, maxEntropy, mtm,
  type WindowFunction, type BTWindowFunction,
  type SpectralResult, type BTResult, type MTMResult,
} from '../math/spectral';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METHODS = ['Periodogram', 'Blackman-Tukey', 'Max. Entropy', 'MTM'] as const;
type Method = typeof METHODS[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function numOrDefault(raw: string, fallback: number): number {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

function copyF64(src: Float64Array): Float64Array {
  const dst = new Float64Array(src.length);
  dst.set(src);
  return dst;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineSpectralWindow(
  items: SeriesItem[],
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const item = items[0]; // primary series
  const el = document.createElement('div');
  el.className = 'as-window as-define-spectral-window';

  // Refs
  const methodRef = createRef<HTMLSelectElement>();
  const windowRef = createRef<HTMLSelectElement>();
  const detrendRef = createRef<HTMLInputElement>();
  // B-Tukey
  const btLagRef = createRef<HTMLInputElement>();
  const btWindowRef = createRef<HTMLSelectElement>();
  const btConfRef = createRef<HTMLInputElement>();
  // Max Entropy
  const meOrderRef = createRef<HTMLInputElement>();
  // MTM
  const mtmNwRef = createRef<HTMLInputElement>();
  const mtmKRef = createRef<HTMLInputElement>();
  // Plot
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;
  let currentResult: SpectralResult | BTResult | MTMResult | null = null;
  let currentMethod: Method = 'Periodogram';

  // Compute sample interval
  const N = item.index.length;
  const dt = N > 1 ? Math.abs(item.index[N - 1] - item.index[0]) / (N - 1) : 1;

  const template = html`
    <div style="display:flex;gap:16px;padding:8px;flex-wrap:wrap">
      <div style="min-width:200px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <label style="font-size:12px;min-width:90px">Method:</label>
          <select style="font-size:12px" ${ref(methodRef)}
            @change=${() => { updateVisibility(); scheduleCompute(); }}>
            ${METHODS.map(m => html`<option value=${m}>${m}</option>`)}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <label style="font-size:12px;min-width:90px">Taper:</label>
          <select style="font-size:12px" ${ref(windowRef)} @change=${scheduleCompute}>
            <option value="hann">Hann</option>
            <option value="hamming">Hamming</option>
            <option value="blackman">Blackman</option>
            <option value="bartlett">Bartlett</option>
            <option value="rectangular">Rectangular</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <label style="font-size:12px;min-width:90px">Detrend:</label>
          <input type="checkbox" checked ${ref(detrendRef)} @change=${scheduleCompute}>
        </div>
        <!-- B-Tukey options -->
        <div class="bt-opts" style="margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">Max lag:</label>
            <input type="number" .value=${String(Math.floor(N / 3))} min="1" max=${N - 1}
              style="width:70px;font-size:12px" ${ref(btLagRef)} @input=${scheduleCompute}>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">Lag window:</label>
            <select style="font-size:12px" ${ref(btWindowRef)} @change=${scheduleCompute}>
              <option value="bartlett">Bartlett</option>
              <option value="parzen">Parzen</option>
              <option value="tukey">Tukey</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">Confidence:</label>
            <input type="number" .value=${'0.95'} min="0.5" max="0.99" step="0.01"
              style="width:70px;font-size:12px" ${ref(btConfRef)} @input=${scheduleCompute}>
          </div>
        </div>
        <!-- Max Entropy options -->
        <div class="me-opts" style="margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">AR order:</label>
            <input type="number" .value=${String(Math.floor(N / 3))} min="1" max=${N - 1}
              style="width:70px;font-size:12px" ${ref(meOrderRef)} @input=${scheduleCompute}>
          </div>
        </div>
        <!-- MTM options -->
        <div class="mtm-opts" style="margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">NW:</label>
            <input type="number" .value=${'4'} min="1" max="20" step="0.5"
              style="width:70px;font-size:12px" ${ref(mtmNwRef)} @input=${scheduleCompute}>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <label style="font-size:12px;min-width:90px">Tapers (K):</label>
            <input type="number" .value=${'7'} min="1" max="20"
              style="width:70px;font-size:12px" ${ref(mtmKRef)} @input=${scheduleCompute}>
          </div>
        </div>
        <div style="font-size:11px;color:#666;margin-top:4px">
          Series: ${item.name} (${N} pts, dt=${dt.toFixed(3)})
        </div>
      </div>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import spectrum</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Engine
  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  let lowerCITraceId = -1;
  let upperCITraceId = -1;
  let sigTraceId = -1;

  // Visibility
  function updateVisibility() {
    currentMethod = (methodRef.value?.value ?? 'Periodogram') as Method;
    const btOpts = el.querySelector('.bt-opts') as HTMLElement | null;
    const meOpts = el.querySelector('.me-opts') as HTMLElement | null;
    const mtmOpts = el.querySelector('.mtm-opts') as HTMLElement | null;
    const taperRow = windowRef.value?.parentElement;

    if (btOpts) btOpts.style.display = currentMethod === 'Blackman-Tukey' ? '' : 'none';
    if (meOpts) meOpts.style.display = currentMethod === 'Max. Entropy' ? '' : 'none';
    if (mtmOpts) mtmOpts.style.display = currentMethod === 'MTM' ? '' : 'none';
    if (taperRow) (taperRow as HTMLElement).style.display =
      currentMethod === 'Periodogram' ? '' : 'none';
  }
  updateVisibility();

  // Debounced compute
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; doCompute(); }, 500);
  }

  function doCompute() {
    try {
      const doDetrend = detrendRef.value?.checked ?? true;

      switch (currentMethod) {
        case 'Periodogram': {
          const win = (windowRef.value?.value ?? 'hann') as WindowFunction;
          currentResult = periodogram(item.values, dt, { window: win, detrend: doDetrend });
          break;
        }
        case 'Blackman-Tukey': {
          const maxLag = numOrDefault(btLagRef.value?.value ?? '', Math.floor(N / 3));
          const btWin = (btWindowRef.value?.value ?? 'bartlett') as BTWindowFunction;
          const conf = numOrDefault(btConfRef.value?.value ?? '', 0.95);
          currentResult = blackmanTukey(item.values, dt, {
            maxLag, window: btWin, confidenceLevel: conf, detrend: doDetrend,
          });
          break;
        }
        case 'Max. Entropy': {
          const order = numOrDefault(meOrderRef.value?.value ?? '', Math.floor(N / 3));
          currentResult = maxEntropy(item.values, dt, { order, detrend: doDetrend });
          break;
        }
        case 'MTM': {
          const nw = numOrDefault(mtmNwRef.value?.value ?? '', 4);
          const k = numOrDefault(mtmKRef.value?.value ?? '', 7);
          currentResult = mtm(item.values, dt, { nw, k: Math.round(k), detrend: doDetrend });
          break;
        }
      }

      updatePlot();
    } catch (err) {
      console.error('Spectral analysis error:', err);
    }
  }

  function updatePlot() {
    if (!currentResult) return;

    const { frequency, power } = currentResult;

    // Remove old CI / significance traces
    if (lowerCITraceId >= 0) { engine.removeTrace(lowerCITraceId); lowerCITraceId = -1; }
    if (upperCITraceId >= 0) { engine.removeTrace(upperCITraceId); upperCITraceId = -1; }
    if (sigTraceId >= 0) { engine.removeTrace(sigTraceId); sigTraceId = -1; }

    if (traceId < 0) {
      traceId = engine.addTrace({
        x: frequency, y: power, color: '#d62728', width: 1, name: 'Power',
      });
      engine.configureAxis('x', 0, { title: 'Frequency' });
      engine.configureAxis('y', 0, { title: 'Power' });
    } else {
      engine.beginUpdate();
      engine.resetAxisRange('x', 0);
      engine.resetAxisRange('y', 0);
      engine.updateTrace(traceId, { x: frequency, y: power });
      engine.endUpdate();
    }

    // B-Tukey: add CI traces
    if ('lowerCI' in currentResult) {
      const bt = currentResult as BTResult;
      lowerCITraceId = engine.addTrace({
        x: frequency, y: bt.lowerCI, color: '#2ca02c', width: 0.5, name: 'Lower CI',
      });
      upperCITraceId = engine.addTrace({
        x: frequency, y: bt.upperCI, color: '#1f77b4', width: 0.5, name: 'Upper CI',
      });
    }

    // MTM: add significance trace on secondary axis
    if ('significance' in currentResult) {
      const mtmR = currentResult as MTMResult;
      sigTraceId = engine.addTrace({
        x: frequency, y: mtmR.significance, color: '#2ca02c', width: 0.8, name: 'Significance',
      });
    }
  }

  void doCompute();

  // Import
  function handleImport() {
    if (!currentResult) return;
    const { frequency, power } = currentResult;

    const id = generateId();
    const series: SeriesItem = {
      id,
      type: 'Series',
      name: `${currentMethod} of ${item.name}`,
      date: formatDate(),
      comment: '',
      history: `${currentMethod} spectral analysis of series <i><b>${item.id}</b></i><BR>---> series <i><b>${id}</b></i>`,
      xLabel: `Frequency (cycles/${item.xLabel || 'unit'})`,
      yLabel: 'Power',
      color: generateColor(),
      index: copyF64(frequency),
      values: copyF64(power),
    };
    callbacks.onImport(series);

    // Also import CI or significance if available
    if ('lowerCI' in currentResult) {
      const bt = currentResult as BTResult;
      const loId = generateId();
      callbacks.onImport({
        id: loId, type: 'Series',
        name: `${currentMethod} lower CI of ${item.name}`,
        date: formatDate(), comment: '',
        history: `Lower confidence interval for ${currentMethod} of <i><b>${item.id}</b></i><BR>---> series <i><b>${loId}</b></i>`,
        xLabel: series.xLabel, yLabel: 'Power',
        color: generateColor(), index: copyF64(frequency), values: copyF64(bt.lowerCI),
      });
      const hiId = generateId();
      callbacks.onImport({
        id: hiId, type: 'Series',
        name: `${currentMethod} upper CI of ${item.name}`,
        date: formatDate(), comment: '',
        history: `Upper confidence interval for ${currentMethod} of <i><b>${item.id}</b></i><BR>---> series <i><b>${hiId}</b></i>`,
        xLabel: series.xLabel, yLabel: 'Power',
        color: generateColor(), index: copyF64(frequency), values: copyF64(bt.upperCI),
      });
    }

    if ('significance' in currentResult) {
      const mtmR = currentResult as MTMResult;
      const sigId = generateId();
      callbacks.onImport({
        id: sigId, type: 'Series',
        name: `MTM significance of ${item.name}`,
        date: formatDate(), comment: '',
        history: `F-test significance for MTM of <i><b>${item.id}</b></i><BR>---> series <i><b>${sigId}</b></i>`,
        xLabel: series.xLabel, yLabel: 'Significance',
        color: generateColor(), index: copyF64(frequency), values: copyF64(mtmR.significance),
      });
    }
  }

  return {
    id: 'spectral-' + item.id,
    title: `Spectral Analysis — ${item.name}`,
    element: el,
    onClose: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      engine.destroy();
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
