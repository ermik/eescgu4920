/**
 * D4 — Define Filter window.
 *
 * Moving average smoothing with preview plot and save actions.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, FilterItem, WorksheetItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { movingAverage } from '../math/filter';
import { generateId, generateColor, appendHistory } from '../utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ensureOdd(n: number): number {
  n = Math.round(n);
  if (n < 1) return 1;
  if (n > 33) return 33;
  return n % 2 === 0 ? n + 1 : n;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDefineFilterWindow(
  item: SeriesItem,
  callbacks: {
    onSaveFilter: (filter: FilterItem) => void;
    onSaveFilterAndSeries: (filter: FilterItem, series: SeriesItem) => void;
  },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-filter-window';

  const wsRef = createRef<HTMLInputElement>();
  const plotRef = createRef<HTMLDivElement>();

  let closeCallback: (() => void) | null = null;

  function computeFiltered(
    src: SeriesItem,
    ws: number,
  ): { index: Float64Array; values: Float64Array } | null {
    try {
      return movingAverage(src.index, src.values, ws);
    } catch {
      return null;
    }
  }

  let windowSize = 3;
  let filteredResult = computeFiltered(item, windowSize);

  function handleInput() {
    let val = parseInt(wsRef.value!.value, 10);
    if (isNaN(val)) return;
    val = ensureOdd(val);
    windowSize = val;
    updateFiltered();
  }

  function handleChange() {
    let val = parseInt(wsRef.value!.value, 10);
    if (isNaN(val)) val = 3;
    val = ensureOdd(val);
    windowSize = val;
    wsRef.value!.value = String(val);
    updateFiltered();
  }

  // Batch F: history format matches Python `saveFilter` — includes ID and
  // structured parameter list.
  function makeFilterItem(): FilterItem {
    const id = generateId();
    return {
      id,
      type: 'FILTER',
      name: `Filter (${windowSize})`,
      date: formatDate(),
      comment: '',
      history: `FILTER <i><b>${id}</b></i> with parameters :<ul><li>Moving average size : ${windowSize}</ul>`,
      windowSize,
    };
  }

  function handleSaveFilter() {
    callbacks.onSaveFilter(makeFilterItem());
  }

  function handleSaveBoth() {
    const filterItem = makeFilterItem();
    const result = computeFiltered(item, windowSize);
    if (!result) return;

    // Batch F: history format includes source and filter IDs per Python spec
    const seriesId = generateId();
    const seriesItem: SeriesItem = {
      id: seriesId,
      type: 'Series filtered',
      name: `${item.name} filtered(${windowSize})`,
      date: formatDate(),
      comment: '',
      history: appendHistory(
        item.history,
        `Series <i><b>${item.id}</b></i> filtered with FILTER <i><b>${filterItem.id}</b></i> with a moving average of size ${windowSize}<BR>---> series <i><b>${seriesId}</b></i>`,
      ),
      xLabel: item.xLabel,
      yLabel: item.yLabel,
      color: generateColor(item.color),
      index: result.index,
      values: result.values,
    };
    callbacks.onSaveFilterAndSeries(filterItem, seriesItem);
  }

  const template = html`
    <div class="as-display-toolbar">
      <label>Window size:</label>
      <input type="number" min="1" max="33" step="2" value="3"
        ${ref(wsRef)} @input=${handleInput} @change=${handleChange}>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${handleSaveFilter}>Save filter</button>
      <button class="as-btn" @click=${handleSaveBoth}>Save filter and series filtered</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>
  `;

  render(template, el);

  // PlotEngine — must be created AFTER render() so plotRef.value! is available
  const engine = new PlotEngine(plotRef.value!);
  engine.beginUpdate();

  const originalTraceId = engine.addTrace({
    x: item.index,
    y: item.values,
    color: item.color,
    width: 0.8,
    name: 'Original',
  });

  const filteredTraceId = engine.addTrace({
    x: filteredResult?.index ?? new Float64Array(0),
    y: filteredResult?.values ?? new Float64Array(0),
    color: '#000000',
    width: 0.8,
    opacity: 0.4,
    name: 'Filtered',
  });

  engine.configureAxis('x', 0, { title: item.xLabel });
  engine.configureAxis('y', 0, { title: item.yLabel });
  engine.endUpdate();

  function updateFiltered() {
    filteredResult = computeFiltered(item, windowSize);
    engine.updateTrace(filteredTraceId, {
      x: filteredResult?.index ?? new Float64Array(0),
      y: filteredResult?.values ?? new Float64Array(0),
    });
  }

  return {
    id: 'filter-' + item.id,
    title: `Filter: ${item.name}`,
    element: el,
    onClose: () => {
      engine.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (changed.id !== item.id) return;
      const s = changed as SeriesItem;
      engine.beginUpdate();
      engine.updateTrace(originalTraceId, {
        x: s.index,
        y: s.values,
        color: s.color,
      });
      engine.configureAxis('x', 0, { title: s.xLabel });
      engine.configureAxis('y', 0, { title: s.yLabel });
      engine.endUpdate();
      updateFiltered();
    },
    // Expose close hook for the Close button
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
