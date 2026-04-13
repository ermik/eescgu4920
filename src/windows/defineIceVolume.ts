/**
 * Ice Volume Model window.
 *
 * Spec: PDF §7.3 — four global ice volume models driven by insolation.
 * Requires an existing insolation series to be selected.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor, appendHistory } from '../utils';
import { computeIceVolume, type IceVolumeModel } from '../math/iceVolume';

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

const MODELS: { value: IceVolumeModel; label: string }[] = [
  { value: 'calder', label: 'Calder (1974)' },
  { value: 'imbrie', label: 'Imbrie & Imbrie (1980)' },
  { value: 'paillard', label: 'Paillard (1998)' },
  { value: 'paillard-parrenin', label: 'Paillard & Parrenin (2004)' },
];

export function createDefineIceVolumeWindow(
  item: SeriesItem,
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-ice-volume-window';

  const modelRef = createRef<HTMLSelectElement>();
  const tauGRef = createRef<HTMLInputElement>();
  const tauDRef = createRef<HTMLInputElement>();
  const thresh1Ref = createRef<HTMLInputElement>();
  const thresh2Ref = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);

  // Compute mean insolation for defaults
  let Fmean = 0;
  for (let i = 0; i < item.values.length; i++) Fmean += item.values[i];
  Fmean /= item.values.length;

  const template = html`
    <div class="as-params-group">
      <label>Model:</label>
      <select ${ref(modelRef)}
        @change=${() => { updateVisibility(); scheduleCompute(); }}>
        ${MODELS.map(m => html`<option value=${m.value}>${m.label}</option>`)}
      </select>
      <label>τ growth (kyr):</label>
      <input type="number" .value=${'30'} step="any" min="1"
        ${ref(tauGRef)} @input=${scheduleCompute}>
      <label>τ decay (kyr):</label>
      <input type="number" .value=${'10'} step="any" min="1"
        ${ref(tauDRef)} @input=${scheduleCompute}>
      <span class="as-param-group-inline thresh-opts">
        <label>Threshold 1:</label>
        <input type="number" .value=${String((Fmean - 10).toFixed(1))} step="any"
          ${ref(thresh1Ref)} @input=${scheduleCompute}>
        <label>Threshold 2:</label>
        <input type="number" .value=${'1.5'} step="any"
          ${ref(thresh2Ref)} @input=${scheduleCompute}>
      </span>
      <span class="as-param-info">${item.name} · mean=${Fmean.toFixed(1)} W/m²</span>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import ice volume</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  engine.configureAxis('x', 0, { title: item.xLabel });
  engine.configureAxis('y', 0, { title: 'Ice Volume' });

  function updateVisibility() {
    const model = modelRef.value?.value ?? 'calder';
    const threshOpts = el.querySelector('.thresh-opts') as HTMLElement | null;
    if (threshOpts) threshOpts.toggleAttribute(
      'hidden',
      !(model === 'paillard' || model === 'paillard-parrenin'),
    );
  }
  updateVisibility();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; doCompute(); }, 500);
  }

  function doCompute() {
    try {
      const model = (modelRef.value?.value ?? 'calder') as IceVolumeModel;
      const tauGrowth = numOrDefault(tauGRef.value?.value ?? '', 30);
      const tauDecay = numOrDefault(tauDRef.value?.value ?? '', 10);
      const threshold1 = numOrDefault(thresh1Ref.value?.value ?? '', Fmean - 10);
      const threshold2 = numOrDefault(thresh2Ref.value?.value ?? '', 1.5);

      const r = computeIceVolume(item.index, item.values, {
        model, tauGrowth, tauDecay, threshold1, threshold2,
      });
      currentIndex = new Float64Array(r.index);
      currentValues = new Float64Array(r.values);

      if (traceId < 0) {
        traceId = engine.addTrace({
          x: currentIndex, y: currentValues, color: '#2ca02c', width: 1, name: 'Ice Volume',
        });
      } else {
        engine.beginUpdate();
        engine.resetAxisRange('x', 0);
        engine.resetAxisRange('y', 0);
        engine.updateTrace(traceId, { x: currentIndex, y: currentValues });
        engine.endUpdate();
      }
    } catch (err) {
      console.error('Ice volume error:', err);
    }
  }

  void doCompute();

  function handleImport() {
    if (currentValues.length === 0) return;
    const model = MODELS.find(m => m.value === modelRef.value?.value)?.label ?? 'Ice Volume';
    const id = generateId();
    const series: SeriesItem = {
      id, type: 'Series',
      name: `${model} from ${item.name}`,
      date: formatDate(), comment: '',
      history: appendHistory(item.history,
        `Ice volume model (${model}) from forcing <i><b>${item.id}</b></i><BR>---> series <i><b>${id}</b></i>`),
      xLabel: item.xLabel, yLabel: 'Ice Volume',
      color: generateColor(),
      index: copyF64(currentIndex), values: copyF64(currentValues),
    };
    callbacks.onImport(series);
  }

  return {
    id: 'icevol-' + item.id,
    title: `Ice Volume — ${item.name}`,
    element: el,
    onClose: () => { if (debounceTimer !== null) clearTimeout(debounceTimer); engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
