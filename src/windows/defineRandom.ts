/**
 * D7a — Random Series generator window.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function linspace(start: number, end: number, n: number): Float64Array {
  const len = Math.max(1, n);
  const arr = new Float64Array(len);
  if (len <= 1) { arr[0] = start; return arr; }
  const step = (end - start) / (len - 1);
  for (let i = 0; i < len; i++) arr[i] = start + i * step;
  return arr;
}

function copyF64(src: Float64Array): Float64Array {
  const dst = new Float64Array(src.length);
  dst.set(src);
  return dst;
}

function randomValues(n: number, min: number, max: number): Float64Array {
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) arr[i] = min + Math.random() * (max - min);
  return arr;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineRandomWindow(callbacks: {
  onImport: (item: SeriesItem) => void;
}): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-random-window';

  const startRef = createRef<HTMLInputElement>();
  const endRef = createRef<HTMLInputElement>();
  const nbRef = createRef<HTMLInputElement>();
  const minRef = createRef<HTMLInputElement>();
  const maxRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  const template = html`
    <div class="as-params-group">
      <label>Start:</label>
      <input type="number" value="0" step="any" ${ref(startRef)} @input=${scheduleGenerate}>
      <label>End:</label>
      <input type="number" value="100" step="any" ${ref(endRef)} @input=${scheduleGenerate}>
      <label>Nb points:</label>
      <input type="number" value="101" min="2" step="any" ${ref(nbRef)} @input=${scheduleGenerate}>
      <label>Min value:</label>
      <input type="number" value="0" step="any" ${ref(minRef)} @input=${scheduleGenerate}>
      <label>Max value:</label>
      <input type="number" value="10" step="any" ${ref(maxRef)} @input=${scheduleGenerate}>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${generate}>Shuffle</button>
      <button class="as-btn" @click=${handleImport}>Import series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Engine
  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  function generate() {
    const s = parseFloat(startRef.value!.value);
    const e = parseFloat(endRef.value!.value);
    const n = Math.max(2, parseInt(nbRef.value!.value, 10) || 101);
    const mn = parseFloat(minRef.value!.value);
    const mx = parseFloat(maxRef.value!.value);

    currentIndex = linspace(s, e, n);
    currentValues = randomValues(n, mn, mx);

    if (traceId < 0) {
      traceId = engine.addTrace({
        x: currentIndex,
        y: currentValues,
        color: 'darkorange',
        width: 0.8,
        name: 'Random',
      });
      engine.configureAxis('x', 0, { title: 'X' });
      engine.configureAxis('y', 0, { title: 'Y' });
    } else {
      engine.updateTrace(traceId, { x: currentIndex, y: currentValues });
    }
  }

  generate();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleGenerate() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      generate();
    }, 300);
  }

  function handleImport() {
    const id = generateId();
    const item: SeriesItem = {
      id,
      type: 'Series',
      name: 'Random series',
      date: formatDate(),
      comment: '',
      history: `Generated random series<BR>---> series <i><b>${id}</b></i>`,
      xLabel: 'X',
      yLabel: 'Y',
      color: generateColor(),
      index: copyF64(currentIndex),
      values: copyF64(currentValues),
    };
    callbacks.onImport(item);
  }

  let closeCallback: (() => void) | null = null;

  return {
    id: 'random',
    title: 'Random Series',
    element: el,
    onClose: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      engine.destroy();
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
