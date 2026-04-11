/**
 * D5 — Define Sample window.
 *
 * Resampling with various interpolation methods and optional integration.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
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

  // Unique radio group name per window instance
  const radioGroupName = 'sample-mode-' + items[0].id;

  // Refs for elements that need JS access
  const seriesSelectRef = createRef<HTMLSelectElement>();
  const radioStepRef = createRef<HTMLInputElement>();
  const radioXvalsRef = createRef<HTMLInputElement>();
  const radioXvalsLabelRef = createRef<HTMLLabelElement>();
  const stepInputRef = createRef<HTMLInputElement>();
  const kindSelectRef = createRef<HTMLSelectElement>();
  const intCheckRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;

  const template = html`
    <div class="as-params-group">
      ${hasRef ? html`
        <label>Sample series:</label>
        <select ${ref(seriesSelectRef)} @change=${onSeriesChange}>
          ${items.map((item, i) => html`
            <option value=${String(i)}>${item.name}</option>
          `)}
        </select>
      ` : ''}
      <input type="radio" name=${radioGroupName} value="step" id="radio-step"
        .checked=${true} ${ref(radioStepRef)} @change=${immediateResample}>
      <label for="radio-step">Sampling with step:</label>
      <input type="number" value="25" min="0.001" step="any"
        ${ref(stepInputRef)} @input=${scheduleResample}>
      <input type="radio" name=${radioGroupName} value="xvals" id="radio-xvals"
        .disabled=${!hasRef} ${ref(radioXvalsRef)} @change=${immediateResample}>
      <label for="radio-xvals" ${ref(radioXvalsLabelRef)}>${hasRef
        ? `Using x values of: ${items[1].name}`
        : 'Using x values of series (select 2 series)'}</label>
      <label>Kind:</label>
      <select ${ref(kindSelectRef)} @change=${immediateResample}>
        ${(['nearest', 'zero', 'linear', 'quadratic', 'cubic'] as const).map(k => html`
          <option value=${k} .selected=${k === 'linear'}>${k}</option>
        `)}
      </select>
      <input type="checkbox" id="sample-int" ${ref(intCheckRef)} @change=${immediateResample}>
      <label for="sample-int">Integration</label>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${onSaveSample}>Save sample</button>
      <button class="as-btn" @click=${onSaveBoth}>Save sample and series sampled</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // Access elements via refs after render
  const stepInput = stepInputRef.value!;
  const radioStep = radioStepRef.value!;
  const radioXvalsLabel = radioXvalsLabelRef.value!;
  const kindSelect = kindSelectRef.value!;
  const intCheck = intCheckRef.value!;
  const seriesSelect = hasRef ? seriesSelectRef.value! : null;

  // PlotEngine — must be created AFTER render()
  const engine = new PlotEngine(plotRef.value!);
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
    const refItem = getRef();
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
      if (!refItem) return;
      samplePoints = Array.from(refItem.index);
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

  function onSeriesChange() {
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
  }

  // Save
  // Batch F: history format includes ID reference and structured parameters
  function makeSampleItem(): SampleItem {
    const useStep = radioStep.checked;
    const kind = kindSelect.value as InterpKind;
    const integrated = intCheck.checked;
    const refItem = getRef();
    const id = generateId();

    const paramsHtml = useStep
      ? `<li>Sampling with step : ${stepInput.value}<li>Kind : ${kind}<li>Integrated : ${integrated}`
      : `<li>Using x-values of series ${refItem?.name ?? 'ref'}<li>Kind : ${kind}<li>Integrated : ${integrated}`;

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
      xCoords: useStep ? null : (refItem ? Array.from(refItem.index) : null),
    };
  }

  function onSaveSample() {
    callbacks.onSaveSample(makeSampleItem());
  }

  function onSaveBoth() {
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
  }

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
