/**
 * D4 — Define Filter window.
 *
 * Moving average smoothing with preview plot and save actions.
 */

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

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'as-display-toolbar';

  const wsLabel = document.createElement('label');
  wsLabel.textContent = 'Window size:';

  const wsInput = document.createElement('input');
  wsInput.type = 'number';
  wsInput.min = '1';
  wsInput.max = '33';
  wsInput.step = '2';
  wsInput.value = '3';

  toolbar.appendChild(wsLabel);
  toolbar.appendChild(wsInput);

  // Plot
  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  // Button bar
  const buttonBar = document.createElement('div');
  buttonBar.className = 'as-button-bar';

  const btnSaveFilter = document.createElement('button');
  btnSaveFilter.className = 'as-btn';
  btnSaveFilter.textContent = 'Save filter';

  const btnSaveBoth = document.createElement('button');
  btnSaveBoth.className = 'as-btn';
  btnSaveBoth.textContent = 'Save filter and series filtered';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  buttonBar.appendChild(btnSaveFilter);
  buttonBar.appendChild(btnSaveBoth);
  buttonBar.appendChild(btnClose);

  el.appendChild(toolbar);
  el.appendChild(plotContainer);
  el.appendChild(buttonBar);

  // PlotEngine
  const engine = new PlotEngine(plotContainer);
  engine.beginUpdate();

  const originalTraceId = engine.addTrace({
    x: item.index,
    y: item.values,
    color: item.color,
    width: 0.8,
    name: 'Original',
  });

  // Compute initial filtered
  let windowSize = 3;
  let filteredResult = computeFiltered(item, windowSize);

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

  function updateFiltered() {
    filteredResult = computeFiltered(item, windowSize);
    engine.updateTrace(filteredTraceId, {
      x: filteredResult?.index ?? new Float64Array(0),
      y: filteredResult?.values ?? new Float64Array(0),
    });
  }

  wsInput.addEventListener('input', () => {
    let val = parseInt(wsInput.value, 10);
    if (isNaN(val)) return;
    val = ensureOdd(val);
    windowSize = val;
    updateFiltered();
  });

  wsInput.addEventListener('change', () => {
    let val = parseInt(wsInput.value, 10);
    if (isNaN(val)) val = 3;
    val = ensureOdd(val);
    windowSize = val;
    wsInput.value = String(val);
    updateFiltered();
  });

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

  btnSaveFilter.addEventListener('click', () => {
    callbacks.onSaveFilter(makeFilterItem());
  });

  btnSaveBoth.addEventListener('click', () => {
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
  });

  let closeCallback: (() => void) | null = null;
  btnClose.addEventListener('click', () => {
    closeCallback?.();
  });

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
