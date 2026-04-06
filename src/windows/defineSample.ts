/**
 * D5 — Define Sample window.
 *
 * Resampling with various interpolation methods and optional integration.
 */

import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, SampleItem, WorksheetItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { resample, type InterpKind } from '../math/sample';
import { generateId, generateColor, appendHistory } from '../utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateStepPoints(
  min: number,
  max: number,
  step: number,
): number[] {
  if (step <= 0 || !isFinite(step)) return [];
  const pts: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let x = start; x <= max; x += step) {
    pts.push(x);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineSampleWindow(
  items: SeriesItem[],
  callbacks: {
    onSaveSample: (sample: SampleItem) => void;
    onSaveSampleAndSeries: (sample: SampleItem, series: SeriesItem) => void;
  },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-sample-window';

  // Track which is target vs reference
  let targetIdx = 0;
  const hasRef = items.length >= 2;

  function getTarget(): SeriesItem { return items[targetIdx]; }
  function getRef(): SeriesItem | null { return hasRef ? items[1 - targetIdx] : null; }

  // Params group
  const params = document.createElement('div');
  params.className = 'as-params-group';

  // Series dropdown (only if 2 items)
  let seriesSelect: HTMLSelectElement | null = null;
  if (hasRef) {
    const sLabel = document.createElement('label');
    sLabel.textContent = 'Sample series:';
    params.appendChild(sLabel);

    seriesSelect = document.createElement('select');
    for (let i = 0; i < items.length; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = items[i].name;
      seriesSelect.appendChild(opt);
    }
    params.appendChild(seriesSelect);
  }

  // Radio: step mode (unique name per window to avoid cross-window collisions)
  const radioGroupName = 'sample-mode-' + items[0].id;
  const radioStep = document.createElement('input');
  radioStep.type = 'radio';
  radioStep.name = radioGroupName;
  radioStep.value = 'step';
  radioStep.checked = true;
  radioStep.id = 'radio-step';
  const radioStepLabel = document.createElement('label');
  radioStepLabel.htmlFor = 'radio-step';
  radioStepLabel.textContent = 'Sampling with step:';

  const stepInput = document.createElement('input');
  stepInput.type = 'number';
  stepInput.value = '25';
  stepInput.min = '0.001';
  stepInput.step = 'any';

  params.appendChild(radioStep);
  params.appendChild(radioStepLabel);
  params.appendChild(stepInput);

  // Radio: x values mode
  const radioXvals = document.createElement('input');
  radioXvals.type = 'radio';
  radioXvals.name = radioGroupName;
  radioXvals.value = 'xvals';
  radioXvals.id = 'radio-xvals';
  radioXvals.disabled = !hasRef;
  const radioXvalsLabel = document.createElement('label');
  radioXvalsLabel.htmlFor = 'radio-xvals';
  radioXvalsLabel.textContent = hasRef
    ? `Using x values of: ${items[1].name}`
    : 'Using x values of series (select 2 series)';

  params.appendChild(radioXvals);
  params.appendChild(radioXvalsLabel);

  // Kind dropdown
  const kindLabel = document.createElement('label');
  kindLabel.textContent = 'Kind:';
  const kindSelect = document.createElement('select');
  for (const k of ['nearest', 'zero', 'linear', 'quadratic', 'cubic'] as const) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    if (k === 'linear') opt.selected = true;
    kindSelect.appendChild(opt);
  }
  params.appendChild(kindLabel);
  params.appendChild(kindSelect);

  // Integration checkbox
  const intCheck = document.createElement('input');
  intCheck.type = 'checkbox';
  intCheck.id = 'sample-int';
  const intLabel = document.createElement('label');
  intLabel.htmlFor = 'sample-int';
  intLabel.textContent = 'Integration';
  params.appendChild(intCheck);
  params.appendChild(intLabel);

  // Plot
  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  // Button bar
  const buttonBar = document.createElement('div');
  buttonBar.className = 'as-button-bar';

  const btnSaveSample = document.createElement('button');
  btnSaveSample.className = 'as-btn';
  btnSaveSample.textContent = 'Save sample';

  const btnSaveBoth = document.createElement('button');
  btnSaveBoth.className = 'as-btn';
  btnSaveBoth.textContent = 'Save sample and series sampled';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  buttonBar.appendChild(btnSaveSample);
  buttonBar.appendChild(btnSaveBoth);
  buttonBar.appendChild(btnClose);

  el.appendChild(params);
  el.appendChild(plotContainer);
  el.appendChild(buttonBar);

  // PlotEngine
  const engine = new PlotEngine(plotContainer);
  let originalTraceId = -1;
  let sampledTraceId = -1;
  let vertLineIds: string[] = [];

  function initTraces() {
    const target = getTarget();
    engine.beginUpdate();
    originalTraceId = engine.addTrace({
      x: target.index,
      y: target.values,
      color: target.color,
      width: 0.8,
      name: 'Original',
    });
    sampledTraceId = engine.addTrace({
      x: new Float64Array(0),
      y: new Float64Array(0),
      color: '#000000',
      width: 0.8,
      opacity: 0.4,
      name: 'Sampled',
    });
    engine.configureAxis('x', 0, { title: target.xLabel });
    engine.configureAxis('y', 0, { title: target.yLabel });
    engine.endUpdate();
  }

  initTraces();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSampledResult: { index: Float64Array; values: Float64Array } | null = null;

  function doResample() {
    const target = getTarget();
    const ref = getRef();
    const kind = kindSelect.value as InterpKind;
    const integrated = intCheck.checked;
    const useStep = radioStep.checked;

    let samplePoints: number[];
    if (useStep) {
      const step = parseFloat(stepInput.value);
      if (!isFinite(step) || step <= 0) return;
      const min = target.index[0];
      const max = target.index[target.index.length - 1];
      samplePoints = generateStepPoints(min, max, step);
    } else {
      if (!ref) return;
      samplePoints = Array.from(ref.index);
    }

    if (samplePoints.length === 0) {
      lastSampledResult = null;
      engine.updateTrace(sampledTraceId, {
        x: new Float64Array(0),
        y: new Float64Array(0),
      });
      clearVLines();
      return;
    }

    try {
      lastSampledResult = resample(target.index, target.values, samplePoints, kind, integrated);
      engine.updateTrace(sampledTraceId, {
        x: lastSampledResult.index,
        y: lastSampledResult.values,
      });
    } catch {
      lastSampledResult = null;
      engine.updateTrace(sampledTraceId, {
        x: new Float64Array(0),
        y: new Float64Array(0),
      });
    }

    // Vertical lines for integration
    clearVLines();
    if (integrated && samplePoints.length > 0) {
      vertLineIds = engine.addVerticalLines(samplePoints, 0, {
        color: 'blue',
        dash: 'dash',
        width: 0.5,
        opacity: 0.4,
      });
    }
  }

  function clearVLines() {
    if (vertLineIds.length > 0) {
      engine.removeShapes(vertLineIds);
      vertLineIds = [];
    }
  }

  function scheduleResample() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      doResample();
    }, 300);
  }

  function immediateResample() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
    doResample();
  }

  // Initial resample
  doResample();

  // Wire events
  stepInput.addEventListener('input', scheduleResample);
  radioStep.addEventListener('change', immediateResample);
  radioXvals.addEventListener('change', immediateResample);
  kindSelect.addEventListener('change', immediateResample);
  intCheck.addEventListener('change', immediateResample);

  if (seriesSelect) {
    seriesSelect.addEventListener('change', () => {
      targetIdx = parseInt(seriesSelect!.value, 10);
      radioXvalsLabel.textContent = `Using x values of: ${getRef()?.name ?? ''}`;
      // Rebuild original trace
      engine.updateTrace(originalTraceId, {
        x: getTarget().index,
        y: getTarget().values,
        color: getTarget().color,
      });
      engine.configureAxis('x', 0, { title: getTarget().xLabel });
      engine.configureAxis('y', 0, { title: getTarget().yLabel });
      immediateResample();
    });
  }

  // Save
  // Batch F: history format includes ID reference and structured parameters
  function makeSampleItem(): SampleItem {
    const useStep = radioStep.checked;
    const kind = kindSelect.value as InterpKind;
    const integrated = intCheck.checked;
    const ref = getRef();
    const id = generateId();

    const paramsHtml = useStep
      ? `<li>Sampling with step : ${stepInput.value}<li>Kind : ${kind}<li>Integrated : ${integrated}`
      : `<li>Using x-values of series ${ref?.name ?? 'ref'}<li>Kind : ${kind}<li>Integrated : ${integrated}`;

    return {
      id,
      type: 'SAMPLE',
      name: useStep
        ? `Sample (step=${stepInput.value}, ${kind})`
        : `Sample (x-values, ${kind})`,
      date: formatDate(),
      comment: '',
      history: `SAMPLE <i><b>${id}</b></i> with parameters :<ul>${paramsHtml}</ul>`,
      step: useStep ? parseFloat(stepInput.value) : null,
      kind,
      integrated,
      xCoords: useStep ? null : (ref ? Array.from(ref.index) : null),
    };
  }

  btnSaveSample.addEventListener('click', () => {
    callbacks.onSaveSample(makeSampleItem());
  });

  btnSaveBoth.addEventListener('click', () => {
    const sampleItem = makeSampleItem();
    if (!lastSampledResult) return;
    const target = getTarget();

    // Batch F: history format includes source and sample IDs per Python spec
    const seriesId = generateId();
    const seriesItem: SeriesItem = {
      id: seriesId,
      type: 'Series sampled',
      name: `${target.name} sampled`,
      date: formatDate(),
      comment: '',
      history: appendHistory(
        target.history,
        `Series <i><b>${target.id}</b></i> sampled with SAMPLE <i><b>${sampleItem.id}</b></i> with method ${sampleItem.kind}${sampleItem.integrated ? ' (integrated)' : ''}<BR>---> series <i><b>${seriesId}</b></i>`,
      ),
      xLabel: target.xLabel,
      yLabel: target.yLabel,
      color: generateColor(target.color),
      index: lastSampledResult.index,
      values: lastSampledResult.values,
    };
    callbacks.onSaveSampleAndSeries(sampleItem, seriesItem);
  });

  let closeCallback: (() => void) | null = null;
  btnClose.addEventListener('click', () => {
    closeCallback?.();
  });

  const id = 'sample-' + items[0].id;

  return {
    id,
    title: `Sample: ${items[0].name}`,
    element: el,
    onClose: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      engine.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (items.some((i) => i.id === changed.id)) {
        const target = getTarget();
        engine.updateTrace(originalTraceId, {
          x: target.index,
          y: target.values,
          color: target.color,
        });
        immediateResample();
      }
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
