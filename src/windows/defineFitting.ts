/**
 * Curve fitting window.
 *
 * Spec: PDF §8.2 — Fitting with polynomial, piecewise linear, staircase,
 * and cubic spline.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor, appendHistory } from '../utils';
import { fit, type FitKind } from '../math/fitting';

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

export function createDefineFittingWindow(
  item: SeriesItem,
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-fitting-window';

  const kindRef = createRef<HTMLSelectElement>();
  const degreeRef = createRef<HTMLInputElement>();
  const stepRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  const N = item.index.length;
  const xMin = item.index[0];
  const xMax = item.index[N - 1];
  const defaultStep = N > 1 ? Math.abs(xMax - xMin) / (N - 1) : 1;

  const template = html`
    <div style="padding:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:80px">Type:</label>
        <select style="font-size:12px" ${ref(kindRef)}
          @change=${() => { updateDegreeVisibility(); scheduleCompute(); }}>
          <option value="polynomial">Polynomial</option>
          <option value="piecewise-linear">Piecewise Linear</option>
          <option value="staircase">Staircase</option>
          <option value="cubic-spline">Cubic Spline</option>
        </select>
      </div>
      <div class="degree-row" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:80px">Degree:</label>
        <input type="number" .value=${'1'} min="0" max="20"
          style="width:60px;font-size:12px" ${ref(degreeRef)} @input=${scheduleCompute}>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:80px">Step:</label>
        <input type="number" .value=${String(defaultStep.toFixed(4))} step="any" min="0.0001"
          style="width:90px;font-size:12px" ${ref(stepRef)} @input=${scheduleCompute}>
      </div>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import fitted series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  // Data trace
  engine.addTrace({
    x: item.index, y: item.values, color: '#d62728', width: 0.5, name: 'Data',
  });
  let fitTraceId = -1;
  engine.configureAxis('x', 0, { title: item.xLabel });
  engine.configureAxis('y', 0, { title: item.yLabel });

  function updateDegreeVisibility() {
    const row = el.querySelector('.degree-row') as HTMLElement | null;
    if (row) row.style.display = kindRef.value?.value === 'polynomial' ? '' : 'none';
  }
  updateDegreeVisibility();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; doCompute(); }, 400);
  }

  function doCompute() {
    try {
      const kind = (kindRef.value?.value ?? 'polynomial') as FitKind;
      const degree = Math.round(numOrDefault(degreeRef.value?.value ?? '', 1));
      const step = numOrDefault(stepRef.value?.value ?? '', defaultStep);
      if (step <= 0) return;

      // Build query grid
      const lo = Math.min(xMin, xMax);
      const hi = Math.max(xMin, xMax);
      const pts: number[] = [];
      for (let x = lo; x <= hi; x += step) { pts.push(x); if (pts.length > 50000) break; }
      const xQuery = new Float64Array(pts);

      const result = fit(item.index, item.values, xQuery, kind, degree);
      currentIndex = result.index;
      currentValues = result.values;

      if (fitTraceId < 0) {
        fitTraceId = engine.addTrace({
          x: currentIndex, y: currentValues, color: '#1f77b4', width: 1.5, name: 'Fit',
        });
      } else {
        engine.beginUpdate();
        engine.updateTrace(fitTraceId, { x: currentIndex, y: currentValues });
        engine.endUpdate();
      }
    } catch (err) {
      console.error('Fitting error:', err);
    }
  }

  void doCompute();

  function handleImport() {
    if (currentValues.length === 0) return;
    const kind = kindRef.value?.value ?? 'polynomial';
    const id = generateId();
    const series: SeriesItem = {
      id, type: 'Series',
      name: `${kind} fit of ${item.name}`,
      date: formatDate(), comment: '',
      history: appendHistory(item.history,
        `${kind} fit of series <i><b>${item.id}</b></i><BR>---> series <i><b>${id}</b></i>`),
      xLabel: item.xLabel, yLabel: item.yLabel,
      color: generateColor(item.color),
      index: copyF64(currentIndex), values: copyF64(currentValues),
    };
    callbacks.onImport(series);
  }

  return {
    id: 'fitting-' + item.id,
    title: `Fitting — ${item.name}`,
    element: el,
    onClose: () => { if (debounceTimer !== null) clearTimeout(debounceTimer); engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
