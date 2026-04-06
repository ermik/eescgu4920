/**
 * D7a — Random Series generator window.
 */

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

  // Params
  const params = document.createElement('div');
  params.className = 'as-params-group';

  function addParam(label: string, value: string, min?: string, max?: string): HTMLInputElement {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    params.appendChild(lbl);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.step = 'any';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    params.appendChild(input);
    return input;
  }

  const startInput = addParam('Start:', '0');
  const endInput = addParam('End:', '100');
  const nbInput = addParam('Nb points:', '101', '2');
  const minInput = addParam('Min value:', '0');
  const maxInput = addParam('Max value:', '10');

  // Plot
  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  // Buttons
  const buttonBar = document.createElement('div');
  buttonBar.className = 'as-button-bar';

  const btnShuffle = document.createElement('button');
  btnShuffle.className = 'as-btn';
  btnShuffle.textContent = 'Shuffle';

  const btnImport = document.createElement('button');
  btnImport.className = 'as-btn';
  btnImport.textContent = 'Import series';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  buttonBar.appendChild(btnShuffle);
  buttonBar.appendChild(btnImport);
  buttonBar.appendChild(btnClose);

  el.appendChild(params);
  el.appendChild(plotContainer);
  el.appendChild(buttonBar);

  // Engine
  const engine = new PlotEngine(plotContainer);
  let traceId = -1;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  function generate() {
    const s = parseFloat(startInput.value);
    const e = parseFloat(endInput.value);
    const n = Math.max(2, parseInt(nbInput.value, 10) || 101);
    const mn = parseFloat(minInput.value);
    const mx = parseFloat(maxInput.value);

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

  for (const input of [startInput, endInput, nbInput, minInput, maxInput]) {
    input.addEventListener('input', scheduleGenerate);
  }

  btnShuffle.addEventListener('click', generate);

  // Batch F: history includes generated ID reference
  btnImport.addEventListener('click', () => {
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
  });

  let closeCallback: (() => void) | null = null;
  btnClose.addEventListener('click', () => closeCallback?.());

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
