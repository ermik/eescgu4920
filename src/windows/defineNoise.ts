/**
 * Noise generator window.
 *
 * Spec: PDF §7.2 — Noise generation with distribution types and red noise.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';
import { generateNoise, type NoiseType } from '../math/noise';

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function numOrDefault(raw: string, fallback: number): number {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

function copyF64(src: ArrayLike<number>): Float64Array {
  const dst = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
  return dst;
}

export function createDefineNoiseWindow(
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-noise-window';

  const typeRef = createRef<HTMLSelectElement>();
  const nRef = createRef<HTMLInputElement>();
  const startRef = createRef<HTMLInputElement>();
  const endRef = createRef<HTMLInputElement>();
  const centerRef = createRef<HTMLInputElement>();
  const varRef = createRef<HTMLInputElement>();
  const redRef = createRef<HTMLInputElement>();
  const seedRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  const template = html`
    <div class="as-params-group">
      <label>Distribution:</label>
      <select ${ref(typeRef)} @change=${scheduleCompute}>
        <option value="gaussian">Gaussian</option>
        <option value="uniform">Uniform</option>
        <option value="exponential">Exponential</option>
        <option value="double-exponential">Double Exponential</option>
        <option value="lorentzian">Lorentzian</option>
      </select>
      <label>Points:</label>
      <input type="number" .value=${'1000'} min="1" ${ref(nRef)} @input=${scheduleCompute}>
      <label>Start:</label>
      <input type="number" .value=${'0'} step="any" ${ref(startRef)} @input=${scheduleCompute}>
      <label>End:</label>
      <input type="number" .value=${'999'} step="any" ${ref(endRef)} @input=${scheduleCompute}>
      <label>Center:</label>
      <input type="number" .value=${'0'} step="any" ${ref(centerRef)} @input=${scheduleCompute}>
      <label>Variance:</label>
      <input type="number" .value=${'1'} step="any" min="0.001"
        ${ref(varRef)} @input=${scheduleCompute}>
      <label>Red noise (ρ):</label>
      <input type="number" .value=${'0'} step="0.1" min="-0.99" max="0.99"
        ${ref(redRef)} @input=${scheduleCompute}>
      <label>Seed:</label>
      <input type="number" .value=${'42'} min="0" ${ref(seedRef)} @input=${scheduleCompute}>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  engine.configureAxis('x', 0, { title: 'X' });
  engine.configureAxis('y', 0, { title: 'Value' });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; doCompute(); }, 400);
  }

  function doCompute() {
    try {
      const type = (typeRef.value?.value ?? 'gaussian') as NoiseType;
      const nPoints = Math.round(numOrDefault(nRef.value?.value ?? '', 1000));
      const xStart = numOrDefault(startRef.value?.value ?? '', 0);
      const xEnd = numOrDefault(endRef.value?.value ?? '', 999);
      const center = numOrDefault(centerRef.value?.value ?? '', 0);
      const variance = numOrDefault(varRef.value?.value ?? '', 1);
      const redNoise = numOrDefault(redRef.value?.value ?? '', 0);
      const seed = Math.round(numOrDefault(seedRef.value?.value ?? '', 42));

      const r = generateNoise({ type, nPoints, xStart, xEnd, center, variance, redNoise, seed });
      currentIndex = new Float64Array(r.index);
      currentValues = new Float64Array(r.values);

      if (traceId < 0) {
        traceId = engine.addTrace({
          x: currentIndex, y: currentValues, color: '#1f77b4', width: 0.8, name: 'Noise',
        });
      } else {
        engine.beginUpdate();
        engine.resetAxisRange('x', 0);
        engine.resetAxisRange('y', 0);
        engine.updateTrace(traceId, { x: currentIndex, y: currentValues });
        engine.endUpdate();
      }
    } catch (err) {
      console.error('Noise generation error:', err);
    }
  }

  void doCompute();

  function handleImport() {
    if (currentValues.length === 0) return;
    const type = typeRef.value?.value ?? 'gaussian';
    const id = generateId();
    const series: SeriesItem = {
      id, type: 'Series',
      name: `Noise (${type})`,
      date: formatDate(), comment: '',
      history: `Generated ${type} noise<BR>---> series <i><b>${id}</b></i>`,
      xLabel: 'X', yLabel: 'Value',
      color: generateColor(),
      index: copyF64(currentIndex), values: copyF64(currentValues),
    };
    callbacks.onImport(series);
  }

  return {
    id: 'noise',
    title: 'Noise Generator',
    element: el,
    onClose: () => { if (debounceTimer !== null) clearTimeout(debounceTimer); engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
