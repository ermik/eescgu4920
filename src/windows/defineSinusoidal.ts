/**
 * D7b — Sinusoidal Series generator window.
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

  // Input refs for domain
  const startRef = createRef<HTMLInputElement>();
  const endRef = createRef<HTMLInputElement>();
  const nbRef = createRef<HTMLInputElement>();
  const sigmaRef = createRef<HTMLInputElement>();
  // Input refs for sinusoid #1
  const f1Ref = createRef<HTMLInputElement>();
  const a1Ref = createRef<HTMLInputElement>();
  const p1Ref = createRef<HTMLInputElement>();
  // Input refs for sinusoid #2
  const f2Ref = createRef<HTMLInputElement>();
  const a2Ref = createRef<HTMLInputElement>();
  const p2Ref = createRef<HTMLInputElement>();
  // Formula and plot refs
  const formulaRef = createRef<HTMLDivElement>();
  const plotRef = createRef<HTMLDivElement>();

  function onParamChange() {
    updateFormula();
    generate();
  }

  function fieldset(legend: string, fields: [string, string, ReturnType<typeof createRef<HTMLInputElement>>][]) {
    return html`
      <fieldset>
        <legend>${legend}</legend>
        ${fields.map(([label, value, r]) => html`
          <label>${label}:<input type="number" step="any" .value=${value}
            ${ref(r)} @input=${onParamChange}></label>
        `)}
      </fieldset>
    `;
  }

  const template = html`
    <div class="as-sin-params">
      ${fieldset('Domain', [
        ['Start', '0', startRef],
        ['End', '1000', endRef],
        ['Nb points', '1000', nbRef],
        ['Noise \u03c3', '0.2', sigmaRef],
      ])}
      ${fieldset('Sinusoid #1', [
        ['Freq', '10', f1Ref],
        ['Amplitude', '3.0', a1Ref],
        ['Phase', '0.0', p1Ref],
      ])}
      ${fieldset('Sinusoid #2', [
        ['Freq', '200', f2Ref],
        ['Amplitude', '0.5', a2Ref],
        ['Phase', '0.0', p2Ref],
      ])}
    </div>
    <div class="as-formula" ${ref(formulaRef)}></div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${generate}>Generate</button>
      <button class="as-btn" @click=${handleImport}>Import series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  function updateFormula() {
    const a1 = a1Ref.value!.value;
    const f1v = f1Ref.value!.value;
    const p1v = p1Ref.value!.value;
    const a2 = a2Ref.value!.value;
    const f2v = f2Ref.value!.value;
    const p2v = p2Ref.value!.value;
    const sigma = sigmaRef.value!.value;
    formulaRef.value!.innerHTML =
      `y = ${a1}\u00b7sin(2\u03c0\u00b7${f1v}\u00b7x + ${p1v}) + ${a2}\u00b7sin(2\u03c0\u00b7${f2v}\u00b7x + ${p2v}) + N(0, ${sigma})`;
  }
  updateFormula();

  // Engine
  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  function generate() {
    const start = parseFloat(startRef.value!.value) || 0;
    const end = parseFloat(endRef.value!.value) || 1000;
    const n = Math.max(2, parseInt(nbRef.value!.value, 10) || 1000);
    const sigma = parseFloat(sigmaRef.value!.value) || 0;

    const f1 = parseFloat(f1Ref.value!.value) || 0;
    const a1 = parseFloat(a1Ref.value!.value) || 0;
    const p1 = parseFloat(p1Ref.value!.value) || 0;
    const f2 = parseFloat(f2Ref.value!.value) || 0;
    const a2 = parseFloat(a2Ref.value!.value) || 0;
    const p2 = parseFloat(p2Ref.value!.value) || 0;

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

  function handleImport() {
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
  }

  let closeCallback: (() => void) | null = null;

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
