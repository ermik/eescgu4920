/**
 * SSA (Singular Spectrum Analysis) window.
 * Spec: PDF §8.4.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor, appendHistory } from '../utils';
import { ssa } from '../math/ssa';

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function numOrDefault(raw: string, fb: number): number { const v = parseFloat(raw); return Number.isFinite(v) ? v : fb; }
function copyF64(src: Float64Array): Float64Array { const d = new Float64Array(src.length); d.set(src); return d; }

export function createDefineSSAWindow(
  item: SeriesItem,
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-ssa-window';
  const N = item.index.length;
  const winRef = createRef<HTMLInputElement>();
  const ncompRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();
  let closeCallback: (() => void) | null = null;
  let curResult: ReturnType<typeof ssa> | null = null;

  const template = html`
    <div style="padding:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:120px">Window length:</label>
        <input type="number" .value=${String(Math.floor(N / 3))} min="2" max=${N - 1}
          style="width:70px;font-size:12px" ${ref(winRef)} @input=${sched}>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:120px">Components:</label>
        <input type="number" .value=${'5'} min="1"
          style="width:70px;font-size:12px" ${ref(ncompRef)} @input=${sched}>
      </div>
      <div style="font-size:11px;color:#666">Series: ${item.name} (${N} pts)</div>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${doImport}>Import reconstruction</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>`;
  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  engine.addTrace({ x: item.index, y: item.values, color: '#d62728', width: 0.5, name: 'Original' });
  let recTraceId = -1;
  engine.configureAxis('x', 0, { title: item.xLabel });
  engine.configureAxis('y', 0, { title: item.yLabel });

  let timer: ReturnType<typeof setTimeout> | null = null;
  function sched() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; compute(); }, 500); }

  function compute() {
    try {
      const wl = Math.round(numOrDefault(winRef.value?.value ?? '', Math.floor(N / 3)));
      const nc = Math.round(numOrDefault(ncompRef.value?.value ?? '', 5));
      curResult = ssa(item.values, { windowLength: wl, nComponents: nc });
      const rec = new Float64Array(curResult.reconstruction);
      if (recTraceId < 0) {
        recTraceId = engine.addTrace({ x: item.index, y: rec, color: '#1f77b4', width: 1.5, name: 'Reconstruction' });
      } else {
        engine.beginUpdate(); engine.updateTrace(recTraceId, { x: item.index, y: rec }); engine.endUpdate();
      }
    } catch (e) { console.error('SSA error:', e); }
  }
  void compute();

  function doImport() {
    if (!curResult) return;
    const id = generateId();
    callbacks.onImport({
      id, type: 'Series',
      name: `SSA reconstruction of ${item.name}`,
      date: formatDate(), comment: '',
      history: appendHistory(item.history, `SSA reconstruction of <i><b>${item.id}</b></i><BR>---> series <i><b>${id}</b></i>`),
      xLabel: item.xLabel, yLabel: item.yLabel,
      color: generateColor(item.color),
      index: copyF64(item.index), values: new Float64Array(curResult.reconstruction),
    });
    // Import eigenvalues as a separate series
    const evId = generateId();
    const evIdx = new Float64Array(curResult.eigenvalues.length);
    for (let i = 0; i < evIdx.length; i++) evIdx[i] = i + 1;
    callbacks.onImport({
      id: evId, type: 'Series',
      name: `SSA eigenvalues of ${item.name}`,
      date: formatDate(), comment: '',
      history: `SSA eigenvalues from <i><b>${item.id}</b></i><BR>---> series <i><b>${evId}</b></i>`,
      xLabel: 'Component', yLabel: 'Eigenvalue',
      color: generateColor(), index: evIdx, values: new Float64Array(curResult.eigenvalues),
    });
  }

  return {
    id: 'ssa-' + item.id, title: `SSA — ${item.name}`, element: el,
    onClose: () => { if (timer) clearTimeout(timer); engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
