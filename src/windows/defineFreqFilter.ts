/**
 * Frequency-domain Filter window.
 *
 * Bandpass/notch filtering matching AnalySeries PDF §6.3 and §8.2.
 * Shows the filter transfer function overlaid on the input spectrum.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor, appendHistory } from '../utils';
import { periodogram } from '../math/spectral';
import { freqFilter, type FilterShape } from '../math/freqFilter';

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

export function createDefineFreqFilterWindow(
  item: SeriesItem,
  callbacks: {
    onSaveFiltered: (series: SeriesItem) => void;
  },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-freqfilter-window';

  const centerRef = createRef<HTMLInputElement>();
  const bwRef = createRef<HTMLInputElement>();
  const shapeRef = createRef<HTMLSelectElement>();
  const notchRef = createRef<HTMLInputElement>();
  const taperRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;
  let currentFiltered: Float64Array | null = null;

  // Compute sample interval
  const N = item.index.length;
  const dt = N > 1 ? Math.abs(item.index[N - 1] - item.index[0]) / (N - 1) : 1;
  const nyquist = 1 / (2 * dt);

  // Pre-compute spectrum for background display
  const spectrum = periodogram(item.values, dt, { window: 'hann' });

  // Normalize spectrum for overlay (scale to 0–1)
  let specMax = 0;
  for (let i = 1; i < spectrum.power.length; i++) {
    if (spectrum.power[i] > specMax) specMax = spectrum.power[i];
  }
  const specNorm = new Float64Array(spectrum.power.length);
  if (specMax > 0) {
    for (let i = 0; i < spectrum.power.length; i++) specNorm[i] = spectrum.power[i] / specMax;
  }

  const template = html`
    <div class="as-params-group">
      <label>Center freq:</label>
      <input type="number" .value=${String((nyquist / 4).toFixed(4))} step="any" min="0"
        ${ref(centerRef)} @input=${scheduleCompute}>
      <label>Bandwidth:</label>
      <input type="number" .value=${String((nyquist / 10).toFixed(4))} step="any" min="0.0001"
        ${ref(bwRef)} @input=${scheduleCompute}>
      <label>Shape:</label>
      <select ${ref(shapeRef)} @change=${scheduleCompute}>
        <option value="gaussian">Gaussian</option>
        <option value="cosine-taper">Piecewise linear</option>
      </select>
      <label><input type="checkbox" ${ref(notchRef)} @change=${scheduleCompute}> Notch filter</label>
      <label>Taper width:</label>
      <input type="number" .value=${'0.25'} step="0.05" min="0" max="0.5"
        ${ref(taperRef)} @input=${scheduleCompute}>
      <span class="as-param-info">
        Nyquist: ${nyquist.toFixed(4)} · dt=${dt.toFixed(3)} · N=${N}
      </span>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleApply}>Apply filter</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Plot engine
  const engine = new PlotEngine(plotRef.value!);
  // Spectrum background (normalized)
  engine.addTrace({
    x: spectrum.frequency, y: specNorm, color: '#2ca02c', width: 0.5, name: 'Spectrum',
  });
  // Filter transfer function
  let filterTraceId = -1;

  engine.configureAxis('x', 0, { title: 'Frequency' });
  engine.configureAxis('y', 0, { title: 'Gain / Normalized power' });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; doCompute(); }, 300);
  }

  function doCompute() {
    try {
      const center = numOrDefault(centerRef.value?.value ?? '', nyquist / 4);
      const bw = numOrDefault(bwRef.value?.value ?? '', nyquist / 10);
      const shape = (shapeRef.value?.value ?? 'gaussian') as FilterShape;
      const notch = notchRef.value?.checked ?? false;
      const taper = numOrDefault(taperRef.value?.value ?? '', 0.25);

      const result = freqFilter(item.values, dt, {
        centerFreq: center, bandwidth: bw, shape, notch, taperWidth: taper,
      });

      currentFiltered = result.values;

      // Update filter trace
      if (filterTraceId < 0) {
        filterTraceId = engine.addTrace({
          x: result.frequency, y: result.transferFunction,
          color: '#d62728', width: 1.5, name: 'Filter',
        });
      } else {
        engine.beginUpdate();
        engine.updateTrace(filterTraceId, {
          x: result.frequency, y: result.transferFunction,
        });
        engine.endUpdate();
      }
    } catch (err) {
      console.error('Freq filter error:', err);
    }
  }

  void doCompute();

  function handleApply() {
    if (!currentFiltered) return;

    const center = numOrDefault(centerRef.value?.value ?? '', nyquist / 4);
    const bw = numOrDefault(bwRef.value?.value ?? '', nyquist / 10);
    const notch = notchRef.value?.checked ?? false;
    const shape = shapeRef.value?.value ?? 'gaussian';
    const modeLabel = notch ? 'notch' : 'bandpass';

    const id = generateId();
    const series: SeriesItem = {
      id,
      type: 'Series filtered',
      name: `${item.name} ${modeLabel}(${center.toFixed(4)}, bw=${bw.toFixed(4)})`,
      date: formatDate(),
      comment: '',
      history: appendHistory(
        item.history,
        `Series <i><b>${item.id}</b></i> filtered with ${shape} ${modeLabel} at f=${center.toFixed(4)}, bw=${bw.toFixed(4)}<BR>---> series <i><b>${id}</b></i>`,
      ),
      xLabel: item.xLabel,
      yLabel: item.yLabel,
      color: generateColor(item.color),
      index: copyF64(item.index),
      values: copyF64(currentFiltered),
    };
    callbacks.onSaveFiltered(series);
  }

  return {
    id: 'freqfilter-' + item.id,
    title: `Frequency Filter — ${item.name}`,
    element: el,
    onClose: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      engine.destroy();
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
