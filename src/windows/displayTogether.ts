/**
 * D2 — Display Together window.
 *
 * Multiple series on one plot with axis separation modes:
 * none, vertical (separate Y axes), horizontal (separate X axes).
 */

import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, WorksheetItem } from '../types';
import { PlotEngine } from '../plot/engine';

// ---------------------------------------------------------------------------
// Axis mode rendering
// ---------------------------------------------------------------------------

type AxisMode = 'none' | 'vertical' | 'horizontal';

function renderNone(engine: PlotEngine, items: SeriesItem[]): void {
  engine.beginUpdate();

  for (const item of items) {
    engine.addTrace({
      x: item.index,
      y: item.values,
      color: item.color,
      width: 0.8,
      name: item.yLabel,
    });
  }

  engine.configureAxis('x', 0, { title: items[0].xLabel });
  // No Y title when multiple series with potentially different labels
  engine.endUpdate();
}

function renderVertical(engine: PlotEngine, items: SeriesItem[]): void {
  engine.beginUpdate();

  // First trace on primary Y axis
  engine.addTrace({
    x: items[0].index,
    y: items[0].values,
    color: items[0].color,
    width: 0.8,
    name: items[0].yLabel,
  });
  engine.configureAxis('y', 0, {
    title: items[0].yLabel,
    titleColor: items[0].color,
  });
  engine.configureAxis('x', 0, { title: items[0].xLabel });

  // Subsequent traces on twin Y axes
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const yIdx = engine.addTwinY(0, {
      title: item.yLabel,
      titleColor: item.color,
      side: 'left',
      offset: i * 6,
    });
    engine.addTrace({
      x: item.index,
      y: item.values,
      color: item.color,
      width: 0.8,
      name: item.yLabel,
      yAxisIndex: yIdx,
    });
  }

  engine.endUpdate();
}

function renderHorizontal(engine: PlotEngine, items: SeriesItem[]): void {
  engine.beginUpdate();

  // First trace on primary X axis
  engine.addTrace({
    x: items[0].index,
    y: items[0].values,
    color: items[0].color,
    width: 0.8,
    name: items[0].yLabel,
  });
  engine.configureAxis('x', 0, {
    title: items[0].xLabel,
    titleColor: items[0].color,
  });

  // Subsequent traces on twin X axes
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const xIdx = engine.addTwinX(0, {
      title: item.xLabel,
      titleColor: item.color,
      side: 'bottom',
      offset: i * 6,
    });
    engine.addTrace({
      x: item.index,
      y: item.values,
      color: item.color,
      width: 0.8,
      name: item.yLabel,
      xAxisIndex: xIdx,
    });
  }

  engine.endUpdate();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDisplayTogetherWindow(items: SeriesItem[]): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-display-together-window';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'as-display-toolbar';

  const label = document.createElement('label');
  label.textContent = 'Separated axis:';

  const select = document.createElement('select');
  for (const val of ['none', 'vertical', 'horizontal'] as const) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    select.appendChild(opt);
  }

  toolbar.appendChild(label);
  toolbar.appendChild(select);

  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  el.appendChild(toolbar);
  el.appendChild(plotContainer);

  const engine = new PlotEngine(plotContainer);
  let currentMode: AxisMode = 'none';

  function renderMode(mode: AxisMode) {
    currentMode = mode;
    engine.clear();
    switch (mode) {
      case 'none':
        renderNone(engine, items);
        break;
      case 'vertical':
        renderVertical(engine, items);
        break;
      case 'horizontal':
        renderHorizontal(engine, items);
        break;
    }
  }

  // Initial render
  renderMode('none');

  select.addEventListener('change', () => {
    renderMode(select.value as AxisMode);
  });

  // Window ID: sorted item IDs joined with +
  const id = items
    .map((i) => i.id)
    .sort()
    .join('+');

  return {
    id,
    title: `Together: ${items.map((i) => i.name).join(', ')}`,
    element: el,
    onClose: () => {
      engine.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (items.some((i) => i.id === changed.id)) {
        renderMode(currentMode);
      }
    },
  };
}
