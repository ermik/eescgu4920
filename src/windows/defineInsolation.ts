/**
 * D8 / G1 — Insolation / Astronomical Series window.
 *
 * Full UI with real orbital computation via src/astro module.
 */

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
  if (type.includes('Precession')) return type + ' [degrees]';
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

  // Two-column layout
  const layout = document.createElement('div');
  layout.className = 'as-insolation-layout';

  const leftCol = document.createElement('div');
  const rightCol = document.createElement('div');
  rightCol.className = 'as-insolation-ref';

  // --- Left column: form fields ---

  function addField(parent: HTMLElement, label: string, inputEl: HTMLElement): void {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '4px';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.fontSize = '12px';
    lbl.style.minWidth = '120px';
    row.appendChild(lbl);
    row.appendChild(inputEl);
    parent.appendChild(row);
  }

  // Type dropdown
  const typeSelect = document.createElement('select');
  typeSelect.style.width = '100%';
  typeSelect.style.fontSize = '12px';
  for (const t of TYPES) {
    if (t === '---') {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = '────────────';
      typeSelect.appendChild(opt);
    } else {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    }
  }
  addField(leftCol, 'Type:', typeSelect);

  // Solution dropdown
  const solSelect = document.createElement('select');
  solSelect.style.width = '100%';
  solSelect.style.fontSize = '12px';
  for (const s of SOLUTIONS) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    solSelect.appendChild(opt);
  }
  addField(leftCol, 'Solution:', solSelect);

  // Numeric params
  function makeNumInput(value: string, min?: string, max?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.step = 'any';
    input.style.width = '80px';
    input.style.fontSize = '12px';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    return input;
  }

  const solarInput = makeNumInput('1365', '1000', '1500');
  addField(leftCol, 'Solar constant (W/m\u00b2):', solarInput);

  const latInput = makeNumInput('65', '-90', '90');
  addField(leftCol, 'Latitude (\u00b0):', latInput);

  const lon1Input = makeNumInput('90', '0', '360');
  addField(leftCol, 'True longitude #1 (\u00b0):', lon1Input);

  const lon2Input = makeNumInput('180', '0', '360');
  addField(leftCol, 'True longitude #2 (\u00b0):', lon2Input);

  // Time direction
  const dirSelect = document.createElement('select');
  dirSelect.style.fontSize = '12px';
  for (const d of ['Past < 0', 'Past > 0']) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dirSelect.appendChild(opt);
  }
  addField(leftCol, 'Time direction:', dirSelect);

  // Time unit
  const unitSelect = document.createElement('select');
  unitSelect.style.fontSize = '12px';
  for (const u of ['yr', 'kyr']) {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    unitSelect.appendChild(opt);
  }
  unitSelect.value = 'kyr';
  addField(leftCol, 'Time unit:', unitSelect);

  // Start / End / Step
  const startInput = makeNumInput('0');
  addField(leftCol, 'Start:', startInput);
  const endInput = makeNumInput('1000');
  addField(leftCol, 'End:', endInput);
  const stepInput = makeNumInput('1');
  addField(leftCol, 'Step:', stepInput);

  // --- Right column: reference info ---
  const refText = document.createElement('div');
  refText.innerHTML = SOLUTION_REFS[solSelect.value] || '';
  rightCol.appendChild(refText);

  const rangeText = document.createElement('div');
  rangeText.style.marginTop = '8px';
  rangeText.textContent = SOLUTION_RANGES[solSelect.value] || '';
  rightCol.appendChild(rangeText);

  layout.appendChild(leftCol);
  layout.appendChild(rightCol);

  // Plot
  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  // Button bar
  const buttonBar = document.createElement('div');
  buttonBar.className = 'as-button-bar';

  const btnImport = document.createElement('button');
  btnImport.className = 'as-btn';
  btnImport.textContent = 'Import series';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  buttonBar.appendChild(btnImport);
  buttonBar.appendChild(btnClose);

  el.appendChild(layout);
  el.appendChild(plotContainer);
  el.appendChild(buttonBar);

  // Engine
  const engine = new PlotEngine(plotContainer);
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

  typeSelect.addEventListener('change', updateFieldStates);
  solSelect.addEventListener('change', () => {
    updateFieldStates();
    updateRefText();
  });

  updateFieldStates();

  // --- Real computation ---
  async function computeReal() {
    if (computing) return;
    computing = true;

    try {
      const selectedType = typeSelect.value as InsolationType;
      const solution = solSelect.value as AstroSolution;
      const solarConst = parseFloat(solarInput.value) || 1365;
      const latitude = parseFloat(latInput.value) || 65;
      const lon1 = parseFloat(lon1Input.value) || 90;
      const lon2 = parseFloat(lon2Input.value) || 180;
      const s = parseFloat(startInput.value) || 0;
      const e = parseFloat(endInput.value) || 1000;
      const st = parseFloat(stepInput.value) || 1;
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
        engine.updateTrace(traceId, { x: currentIndex, y: currentValues, name: selectedType });
        engine.configureAxis('x', 0, { title: `Time (${unitSelect.value})` });
        engine.configureAxis('y', 0, { title: yLabel });
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

  for (const input of [solarInput, latInput, lon1Input, lon2Input, startInput, endInput, stepInput]) {
    input.addEventListener('input', scheduleCompute);
  }
  typeSelect.addEventListener('change', scheduleCompute);
  solSelect.addEventListener('change', scheduleCompute);
  dirSelect.addEventListener('change', scheduleCompute);
  unitSelect.addEventListener('change', scheduleCompute);

  // Import
  btnImport.addEventListener('click', () => {
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
  });

  let closeCallback: (() => void) | null = null;
  btnClose.addEventListener('click', () => closeCallback?.());

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
