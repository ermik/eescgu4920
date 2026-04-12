/**
 * D8 / G1 — Insolation / Astronomical Series window.
 *
 * Full UI with real orbital computation via src/astro module.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import type { AstroSolution, InsolationType } from '../astro/types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';
import { computeOrbitalParams, computeInsolation } from '../astro/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPES = [
  'Eccentricity',
  'Obliquity',
  'Precession angle',
  'Precession parameter',
  '---',
  'Daily insolation',
  'Integrated insolation between 2 true longitudes',
  'Caloric summer insolation',
  'Caloric winter insolation',
] as const;

const SOLUTIONS = [
  'Berger1978',
  'Laskar1993_01',
  'Laskar1993_11',
  'Laskar2004',
  'Laskar2010a',
  'Laskar2010b',
  'Laskar2010c',
  'Laskar2010d',
] as const;

const SOLUTION_REFS: Record<string, string> = {
  Berger1978: 'Berger A. (1978). Long-term variations of daily insolation and quaternary climatic changes. <i>J. Atmos. Sci.</i>, 35(12), 2362-2367.',
  Laskar1993_01: 'Laskar J., Joutel F., Boudin F. (1993). Orbital, precessional, and insolation quantities for the Earth from -20 Myr to +10 Myr. <i>Astron. Astrophys.</i>, 270, 522-533.',
  Laskar1993_11: 'Laskar J., Joutel F., Boudin F. (1993). Orbital, precessional, and insolation quantities for the Earth from -20 Myr to +10 Myr. <i>Astron. Astrophys.</i>, 270, 522-533.',
  Laskar2004: 'Laskar J. et al. (2004). A long-term numerical solution for the insolation quantities of the Earth. <i>Astron. Astrophys.</i>, 428, 261-285.',
  Laskar2010a: 'Laskar J. et al. (2011). La2010: A new orbital solution for the long-term motion of the Earth. <i>Astron. Astrophys.</i>, 532, A89. (Variant a)',
  Laskar2010b: 'Laskar J. et al. (2011). La2010. (Variant b)',
  Laskar2010c: 'Laskar J. et al. (2011). La2010. (Variant c)',
  Laskar2010d: 'Laskar J. et al. (2011). La2010. (Variant d)',
};

const SOLUTION_RANGES: Record<string, string> = {
  Berger1978: 'Range: unbounded (accuracy degrades beyond ~5 Myr)',
  Laskar1993_01: 'Range: -20,000 to +10,000 kyr',
  Laskar1993_11: 'Range: -20,000 to +10,000 kyr',
  Laskar2004: 'Range: -101,000 to +21,000 kyr',
  Laskar2010a: 'Range: -249,999 to 0 kyr (eccentricity only)',
  Laskar2010b: 'Range: -249,999 to 0 kyr (eccentricity only)',
  Laskar2010c: 'Range: -249,999 to 0 kyr (eccentricity only)',
  Laskar2010d: 'Range: -249,999 to 0 kyr (eccentricity only)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function copyF64(src: Float64Array): Float64Array {
  const dst = new Float64Array(src.length);
  dst.set(src);
  return dst;
}

function numOrDefault(raw: string, fallback: number): number {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

type FieldKey = 'solarConst' | 'latitude' | 'longitude1' | 'longitude2';

const ORBITAL_TYPES = new Set(['Eccentricity', 'Obliquity', 'Precession angle', 'Precession parameter']);
const CALORIC_TYPES = new Set(['Caloric summer insolation', 'Caloric winter insolation']);

function getFieldEnabled(selectedType: string): Record<FieldKey, boolean> {
  if (ORBITAL_TYPES.has(selectedType)) {
    return { solarConst: false, latitude: false, longitude1: false, longitude2: false };
  }
  if (selectedType === 'Daily insolation') {
    return { solarConst: true, latitude: true, longitude1: true, longitude2: false };
  }
  if (selectedType === 'Integrated insolation between 2 true longitudes') {
    return { solarConst: true, latitude: true, longitude1: true, longitude2: true };
  }
  if (CALORIC_TYPES.has(selectedType)) {
    return { solarConst: true, latitude: true, longitude1: false, longitude2: false };
  }
  return { solarConst: false, latitude: false, longitude1: false, longitude2: false };
}

function yLabelForType(type: string): string {
  if (type.includes('insolation')) return type + ' [W/m\u00b2]';
  if (type === 'Obliquity') return 'Obliquity [degrees]';
  if (type === 'Precession angle') return 'Precession angle [degrees]';
  return type;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineInsolationWindow(callbacks: {
  onImport: (item: SeriesItem) => void;
}): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-insolation-window';

  // Refs for elements that need JS access
  const typeSelectRef = createRef<HTMLSelectElement>();
  const solSelectRef = createRef<HTMLSelectElement>();
  const solarInputRef = createRef<HTMLInputElement>();
  const latInputRef = createRef<HTMLInputElement>();
  const lon1InputRef = createRef<HTMLInputElement>();
  const lon2InputRef = createRef<HTMLInputElement>();
  const dirSelectRef = createRef<HTMLSelectElement>();
  const unitSelectRef = createRef<HTMLSelectElement>();
  const startInputRef = createRef<HTMLInputElement>();
  const endInputRef = createRef<HTMLInputElement>();
  const stepInputRef = createRef<HTMLInputElement>();
  const refTextRef = createRef<HTMLDivElement>();
  const rangeTextRef = createRef<HTMLDivElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;

  // --- Field row helper (returns a lit template) ---
  function fieldRow(label: string, content: unknown) {
    return html`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:120px">${label}</label>
        ${content}
      </div>
    `;
  }

  const template = html`
    <div class="as-insolation-layout">
      <div>
        ${fieldRow('Type:', html`
          <select style="width:100%;font-size:12px" ${ref(typeSelectRef)}
            @change=${() => { updateFieldStates(); scheduleCompute(); }}>
            ${TYPES.map(t =>
              t === '---'
                ? html`<option disabled>────────────</option>`
                : html`<option value=${t}>${t}</option>`
            )}
          </select>
        `)}
        ${fieldRow('Solution:', html`
          <select style="width:100%;font-size:12px" ${ref(solSelectRef)}
            @change=${() => { updateFieldStates(); updateRefText(); scheduleCompute(); }}>
            ${SOLUTIONS.map(s => html`<option value=${s}>${s}</option>`)}
          </select>
        `)}
        ${fieldRow('Solar constant (W/m\u00b2):', html`
          <input type="number" .value=${'1365'} step="any" min="1000" max="1500"
            style="width:80px;font-size:12px" ${ref(solarInputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('Latitude (\u00b0):', html`
          <input type="number" .value=${'65'} step="any" min="-90" max="90"
            style="width:80px;font-size:12px" ${ref(latInputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('True longitude #1 (\u00b0):', html`
          <input type="number" .value=${'90'} step="any" min="0" max="360"
            style="width:80px;font-size:12px" ${ref(lon1InputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('True longitude #2 (\u00b0):', html`
          <input type="number" .value=${'180'} step="any" min="0" max="360"
            style="width:80px;font-size:12px" ${ref(lon2InputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('Time direction:', html`
          <select style="font-size:12px" ${ref(dirSelectRef)}
            @change=${scheduleCompute}>
            <option value="Past < 0">Past &lt; 0</option>
            <option value="Past > 0">Past &gt; 0</option>
          </select>
        `)}
        ${fieldRow('Time unit:', html`
          <select style="font-size:12px" ${ref(unitSelectRef)}
            @change=${scheduleCompute}>
            <option value="yr">yr</option>
            <option value="kyr" selected>kyr</option>
          </select>
        `)}
        ${fieldRow('Start:', html`
          <input type="number" .value=${'0'} step="any"
            style="width:80px;font-size:12px" ${ref(startInputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('End:', html`
          <input type="number" .value=${'1000'} step="any"
            style="width:80px;font-size:12px" ${ref(endInputRef)}
            @input=${scheduleCompute}>
        `)}
        ${fieldRow('Step:', html`
          <input type="number" .value=${'1'} step="any"
            style="width:80px;font-size:12px" ${ref(stepInputRef)}
            @input=${scheduleCompute}>
        `)}
      </div>
      <div class="as-insolation-ref">
        <div ${ref(refTextRef)}>${unsafeHTML(SOLUTION_REFS[SOLUTIONS[0]] || '')}</div>
        <div style="margin-top:8px" ${ref(rangeTextRef)}>${SOLUTION_RANGES[SOLUTIONS[0]] || ''}</div>
      </div>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleImport}>Import series</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Grab element references after render
  const typeSelect = typeSelectRef.value!;
  const solSelect = solSelectRef.value!;
  const solarInput = solarInputRef.value!;
  const latInput = latInputRef.value!;
  const lon1Input = lon1InputRef.value!;
  const lon2Input = lon2InputRef.value!;
  const dirSelect = dirSelectRef.value!;
  const unitSelect = unitSelectRef.value!;
  const startInput = startInputRef.value!;
  const endInput = endInputRef.value!;
  const stepInput = stepInputRef.value!;
  const refText = refTextRef.value!;
  const rangeText = rangeTextRef.value!;

  // Engine (must be created AFTER render)
  const engine = new PlotEngine(plotRef.value!);
  let traceId = -1;
  let currentIndex: Float64Array = new Float64Array(0);
  let currentValues: Float64Array = new Float64Array(0);
  let computing = false;

  // --- Field enable/disable logic ---
  const fieldInputs: Record<FieldKey, HTMLInputElement> = {
    solarConst: solarInput,
    latitude: latInput,
    longitude1: lon1Input,
    longitude2: lon2Input,
  };

  function updateFieldStates() {
    const selectedType = typeSelect.value;
    const enabled = getFieldEnabled(selectedType);
    for (const key of Object.keys(enabled) as FieldKey[]) {
      fieldInputs[key].disabled = !enabled[key];
    }

    // Laskar2010: only eccentricity
    const isLaskar2010 = solSelect.value.startsWith('Laskar2010');
    for (const opt of typeSelect.options) {
      if (opt.value && opt.value !== 'Eccentricity' && !opt.disabled) {
        opt.hidden = isLaskar2010;
      }
    }
    if (isLaskar2010 && typeSelect.value !== 'Eccentricity') {
      typeSelect.value = 'Eccentricity';
      updateFieldStates(); // re-run for the new type
    }
  }

  function updateRefText() {
    refText.innerHTML = SOLUTION_REFS[solSelect.value] || '';
    rangeText.textContent = SOLUTION_RANGES[solSelect.value] || '';
  }

  updateFieldStates();

  // --- Real computation ---
  async function computeReal() {
    if (computing) return;
    computing = true;

    try {
      const selectedType = typeSelect.value as InsolationType;
      const solution = solSelect.value as AstroSolution;
      const solarConst = numOrDefault(solarInput.value, 1365);
      const latitude = numOrDefault(latInput.value, 65);
      const lon1 = numOrDefault(lon1Input.value, 90);
      const lon2 = numOrDefault(lon2Input.value, 180);
      const s = numOrDefault(startInput.value, 0);
      const e = numOrDefault(endInput.value, 1000);
      const st = numOrDefault(stepInput.value, 1);
      if (st <= 0) return;

      const isReversed = dirSelect.value === 'Past > 0';
      const isYr = unitSelect.value === 'yr';

      // Build display time array
      const pts: number[] = [];
      const lo = Math.min(s, e);
      const hi = Math.max(s, e);
      for (let x = lo; x <= hi; x += st) {
        pts.push(x);
        if (pts.length > 50000) break;
      }
      if (pts.length === 0) return;

      // Convert to kyr for internal computation
      const tConvention = isReversed ? -1 : 1;
      const tScale = isYr ? 1 / 1000 : 1;
      const timeKyr = new Float64Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        timeKyr[i] = pts[i] * tConvention * tScale;
      }

      // Compute orbital parameters (may need to async-load Laskar tables)
      const orbParams = await computeOrbitalParams(solution, timeKyr);

      // Compute output values
      const values = computeInsolation(selectedType, orbParams, {
        solarConstant: solarConst,
        latitude,
        trueLongitude1: lon1,
        trueLongitude2: lon2,
      });

      // Update display
      currentIndex = new Float64Array(pts);
      currentValues = values;

      const yLabel = yLabelForType(selectedType);

      if (traceId < 0) {
        traceId = engine.addTrace({
          x: currentIndex,
          y: currentValues,
          color: '#1f77b4',
          width: 0.8,
          name: selectedType,
        });
        engine.configureAxis('x', 0, { title: `Time (${unitSelect.value})` });
        engine.configureAxis('y', 0, { title: yLabel });
      } else {
        engine.resetAxisRange('x', 0);
        engine.resetAxisRange('y', 0);
        engine.beginUpdate();
        engine.updateTrace(traceId, { x: currentIndex, y: currentValues, name: selectedType });
        engine.configureAxis('x', 0, { title: `Time (${unitSelect.value})` });
        engine.configureAxis('y', 0, { title: yLabel });
        engine.endUpdate();
      }
    } catch (err) {
      console.error('Insolation computation error:', err);
    } finally {
      computing = false;
    }
  }

  void computeReal();

  // Debounce param changes (1 second)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void computeReal();
    }, 1000);
  }

  // Import
  function handleImport() {
    const selectedType = typeSelect.value;
    const yLabel = yLabelForType(selectedType);

    const id = generateId();
    const item: SeriesItem = {
      id,
      type: 'Series',
      name: `${selectedType} (${solSelect.value})`,
      date: formatDate(),
      comment: '',
      history: `Generated ${selectedType} using ${solSelect.value}<BR>---> series <i><b>${id}</b></i>`,
      xLabel: `Time (${unitSelect.value})`,
      yLabel,
      color: generateColor(),
      index: copyF64(currentIndex),
      values: copyF64(currentValues),
    };
    callbacks.onImport(item);
  }

  return {
    id: 'insolation',
    title: 'Insolation / Astronomical Series',
    element: el,
    onClose: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      engine.destroy();
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
