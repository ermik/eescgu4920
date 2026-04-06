/**
 * D7b — Sinusoidal Series generator window.
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
  const arr = new Float64Array(n);
  if (n <= 1) { arr[0] = start; return arr; }
  const step = (end - start) / (n - 1);
  for (let i = 0; i < n; i++) arr[i] = start + i * step;
  return arr;
}

function copyF64(src: Float64Array): Float64Array {
  const dst = new Float64Array(src.length);
  dst.set(src);
  return dst;
}

function gaussianNoise(sigma: number): number {
  if (sigma === 0) return 0;
  // Box-Muller transform
  let u1 = Math.random();
  if (u1 === 0) u1 = Number.MIN_VALUE; // avoid log(0)
  const u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineSinusoidalWindow(callbacks: {
  onImport: (item: SeriesItem) => void;
}): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-sinusoidal-window';

  // 3-column params
  const paramsGrid = document.createElement('div');
  paramsGrid.className = 'as-sin-params';

  function makeFieldset(legend: string, fields: [string, string][]): { fs: HTMLElement; inputs: Map<string, HTMLInputElement> } {
    const fs = document.createElement('fieldset');
    const leg = document.createElement('legend');
    leg.textContent = legend;
    fs.appendChild(leg);

    const inputs = new Map<string, HTMLInputElement>();
    for (const [label, value] of fields) {
      const lbl = document.createElement('label');
      lbl.textContent = label + ':';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = value;
      lbl.appendChild(input);
      fs.appendChild(lbl);
      inputs.set(label, input);
    }
    return { fs, inputs };
  }

  const domain = makeFieldset('Domain', [
    ['Start', '0'], ['End', '1000'], ['Nb points', '1000'], ['Noise \u03c3', '0.2'],
  ]);
  const sin1 = makeFieldset('Sinusoid #1', [
    ['Freq', '10'], ['Amplitude', '3.0'], ['Phase', '0.0'],
  ]);
  const sin2 = makeFieldset('Sinusoid #2', [
    ['Freq', '200'], ['Amplitude', '0.5'], ['Phase', '0.0'],
  ]);

  paramsGrid.appendChild(domain.fs);
  paramsGrid.appendChild(sin1.fs);
  paramsGrid.appendChild(sin2.fs);

  // Formula display
  const formula = document.createElement('div');
  formula.className = 'as-formula';

  function updateFormula() {
    const a1 = sin1.inputs.get('Amplitude')!.value;
    const f1 = sin1.inputs.get('Freq')!.value;
    const p1 = sin1.inputs.get('Phase')!.value;
    const a2 = sin2.inputs.get('Amplitude')!.value;
    const f2 = sin2.inputs.get('Freq')!.value;
    const p2 = sin2.inputs.get('Phase')!.value;
    const sigma = domain.inputs.get('Noise \u03c3')!.value;
    formula.innerHTML =
      `y = ${a1}\u00b7sin(2\u03c0\u00b7${f1}\u00b7x + ${p1}) + ${a2}\u00b7sin(2\u03c0\u00b7${f2}\u00b7x + ${p2}) + N(0, ${sigma})`;
  }
  updateFormula();

  // Plot
  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  // Buttons
  const buttonBar = document.createElement('div');
  buttonBar.className = 'as-button-bar';

  const btnGenerate = document.createElement('button');
  btnGenerate.className = 'as-btn';
  btnGenerate.textContent = 'Generate';

  const btnImport = document.createElement('button');
  btnImport.className = 'as-btn';
  btnImport.textContent = 'Import series';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  buttonBar.appendChild(btnGenerate);
  buttonBar.appendChild(btnImport);
  buttonBar.appendChild(btnClose);

  el.appendChild(paramsGrid);
  el.appendChild(formula);
  el.appendChild(plotContainer);
  el.appendChild(buttonBar);

  // Engine
  const engine = new PlotEngine(plotContainer);
  let traceId = -1;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  function generate() {
    const start = parseFloat(domain.inputs.get('Start')!.value) || 0;
    const end = parseFloat(domain.inputs.get('End')!.value) || 1000;
    const n = Math.max(2, parseInt(domain.inputs.get('Nb points')!.value, 10) || 1000);
    const sigma = parseFloat(domain.inputs.get('Noise \u03c3')!.value) || 0;

    const f1 = parseFloat(sin1.inputs.get('Freq')!.value) || 0;
    const a1 = parseFloat(sin1.inputs.get('Amplitude')!.value) || 0;
    const p1 = parseFloat(sin1.inputs.get('Phase')!.value) || 0;
    const f2 = parseFloat(sin2.inputs.get('Freq')!.value) || 0;
    const a2 = parseFloat(sin2.inputs.get('Amplitude')!.value) || 0;
    const p2 = parseFloat(sin2.inputs.get('Phase')!.value) || 0;

    currentIndex = linspace(start, end, n);
    currentValues = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = currentIndex[i];
      currentValues[i] =
        a1 * Math.sin(2 * Math.PI * f1 * x + p1) +
        a2 * Math.sin(2 * Math.PI * f2 * x + p2) +
        gaussianNoise(sigma);
    }

    updateFormula();

    if (traceId < 0) {
      traceId = engine.addTrace({
        x: currentIndex,
        y: currentValues,
        color: '#1f77b4',
        width: 0.8,
        name: 'Sinusoidal',
      });
      engine.configureAxis('x', 0, { title: 'X' });
      engine.configureAxis('y', 0, { title: 'Y' });
    } else {
      engine.updateTrace(traceId, { x: currentIndex, y: currentValues });
    }
  }

  generate();

  // Wire param changes to update formula AND regenerate plot
  for (const inputs of [domain.inputs, sin1.inputs, sin2.inputs]) {
    for (const input of inputs.values()) {
      input.addEventListener('input', () => {
        updateFormula();
        generate();
      });
    }
  }

  btnGenerate.addEventListener('click', generate);

  // Batch F: history includes generated ID reference
  btnImport.addEventListener('click', () => {
    const id = generateId();
    const item: SeriesItem = {
      id,
      type: 'Series',
      name: 'Sinusoidal series',
      date: formatDate(),
      comment: '',
      history: `Generated sinusoidal series<BR>---> series <i><b>${id}</b></i>`,
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
    id: 'sinusoidal',
    title: 'Sinusoidal Series',
    element: el,
    onClose: () => {
      engine.destroy();
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
