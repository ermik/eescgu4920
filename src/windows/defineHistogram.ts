/**
 * Histogram window.
 * Spec: PDF §11.1 (v2.0.8).
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor, appendHistory } from '../utils';
import { histogram, type HistogramMode } from '../math/histogram';

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function numOrDefault(raw: string, fb: number): number { const v = parseFloat(raw); return Number.isFinite(v) ? v : fb; }
function copyF64(src: Float64Array): Float64Array { const d = new Float64Array(src.length); d.set(src); return d; }

export function createDefineHistogramWindow(
  item: SeriesItem,
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-histogram-window';
  const modeRef = createRef<HTMLSelectElement>();
  const bwRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();
  let closeCallback: (() => void) | null = null;
  let curBins = new Float64Array(0);
  let curVals = new Float64Array(0);

  const template = html`
    <div class="as-params-group">
      <label>Mode:</label>
      <select ${ref(modeRef)} @change=${sched}>
        <option value="probability-density">Probability density</option>
        <option value="cumulative-probability">Cumulative probability</option>
        <option value="counts">Counts</option>
      </select>
      <label>Bin width:</label>
      <input type="number" .value=${'0'} step="any" min="0" ${ref(bwRef)} @input=${sched}>
      <span class="as-param-info">(0 = auto)</span>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${doImport}>Import histogram</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>`;
  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  let trId = -1;
  engine.configureAxis('x', 0, { title: item.yLabel || 'Value' });
  engine.configureAxis('y', 0, { title: 'Density' });

  let timer: ReturnType<typeof setTimeout> | null = null;
  function sched() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; compute(); }, 300); }

  function compute() {
    try {
      const mode = (modeRef.value?.value ?? 'probability-density') as HistogramMode;
      const bw = numOrDefault(bwRef.value?.value ?? '', 0);
      const r = histogram(item.values, { mode, binWidth: bw > 0 ? bw : undefined });
      curBins = new Float64Array(r.binCenters); curVals = new Float64Array(r.values);
      if (trId < 0) {
        trId = engine.addTrace({ x: curBins, y: curVals, color: '#1f77b4', width: 1.5, name: 'Histogram' });
      } else {
        engine.beginUpdate();
        engine.resetAxisRange('x', 0); engine.resetAxisRange('y', 0);
        engine.updateTrace(trId, { x: curBins, y: curVals });
        engine.endUpdate();
      }
    } catch (e) { console.error('Histogram error:', e); }
  }
  void compute();

  function doImport() {
    if (curVals.length === 0) return;
    const id = generateId();
    callbacks.onImport({
      id, type: 'Series',
      name: `Histogram of ${item.name}`,
      date: formatDate(), comment: '',
      history: appendHistory(item.history, `Histogram of <i><b>${item.id}</b></i><BR>---> series <i><b>${id}</b></i>`),
      xLabel: item.yLabel || 'Value', yLabel: modeRef.value?.value ?? 'Density',
      color: generateColor(), index: copyF64(curBins), values: copyF64(curVals),
    });
  }

  return {
    id: 'histogram-' + item.id, title: `Histogram — ${item.name}`, element: el,
    onClose: () => { if (timer) clearTimeout(timer); engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
