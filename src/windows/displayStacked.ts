/**
 * D3 — Display Stacked window.
 *
 * Multiple series each in its own subplot, with optional shared X axis
 * for subplots that have the same xLabel.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, WorksheetItem } from '../types';
import { PlotEngine, subplotToLayoutKey } from '../plot/engine';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDisplayStackedWindow(items: SeriesItem[]): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-display-stacked-window';

  const plotRef = createRef<HTMLDivElement>();
  const checkboxRef = createRef<HTMLInputElement>();

  const template = html`
    <div class="as-display-toolbar">
      <input type="checkbox" id="shared-x-checkbox" ${ref(checkboxRef)}
        @change=${() => {
          if (checkboxRef.value!.checked) bindRelayout();
        }}>
      <label for="shared-x-checkbox">Shared horizontal axis</label>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
  `;

  render(template, el);

  const engine = new PlotEngine(plotRef.value!, { rows: items.length });

  // Render traces
  function renderAll() {
    engine.beginUpdate();
    for (let i = 0; i < items.length; i++) {
      engine.addTrace({
        x: items[i].index,
        y: items[i].values,
        color: items[i].color,
        width: 0.8,
        name: items[i].name,
        subplot: i,
      });
      engine.configureAxis('x', i, { title: items[i].xLabel });
      engine.configureAxis('y', i, { title: items[i].yLabel });
    }
    engine.endUpdate();
  }

  renderAll();

  // Shared X axis logic
  let relayoutBound = false;
  let updatingSharedRange = false;

  function buildXLabelGroups(): Map<string, number[]> {
    const groups = new Map<string, number[]>();
    for (let i = 0; i < items.length; i++) {
      const lbl = items[i].xLabel;
      if (!groups.has(lbl)) groups.set(lbl, []);
      groups.get(lbl)!.push(i);
    }
    return groups;
  }

  function handleSharedRelayout(eventData: Record<string, unknown>) {
    if (updatingSharedRange || !checkboxRef.value!.checked) return;

    const groups = buildXLabelGroups();
    const updates: Record<string, unknown> = {};
    let hasUpdates = false;

    for (let i = 0; i < items.length; i++) {
      const axisKey = subplotToLayoutKey(i, 'x');
      const rangeKey0 = `${axisKey}.range[0]`;
      const rangeKey1 = `${axisKey}.range[1]`;
      const autoKey = `${axisKey}.autorange`;

      if (rangeKey0 in eventData && rangeKey1 in eventData) {
        const range = [eventData[rangeKey0] as number, eventData[rangeKey1] as number];
        for (const [, group] of groups) {
          if (group.length < 2 || !group.includes(i)) continue;
          for (const j of group) {
            if (j === i) continue;
            const otherKey = subplotToLayoutKey(j, 'x');
            updates[`${otherKey}.range[0]`] = range[0];
            updates[`${otherKey}.range[1]`] = range[1];
            updates[`${otherKey}.autorange`] = false;
            hasUpdates = true;
          }
        }
      } else if (autoKey in eventData && eventData[autoKey] === true) {
        for (const [, group] of groups) {
          if (group.length < 2 || !group.includes(i)) continue;
          for (const j of group) {
            if (j === i) continue;
            const otherKey = subplotToLayoutKey(j, 'x');
            updates[`${otherKey}.autorange`] = true;
            hasUpdates = true;
          }
        }
      }
    }

    if (hasUpdates) {
      updatingSharedRange = true;
      engine.relayout(updates).finally(() => {
        updatingSharedRange = false;
      });
    }
  }

  function bindRelayout() {
    if (!relayoutBound) {
      engine.on('plotly_relayout', handleSharedRelayout as (...args: unknown[]) => void);
      relayoutBound = true;
    }
  }

  // Window ID: sorted item IDs joined with +
  const id = items
    .map((i) => i.id)
    .sort()
    .join('+');

  return {
    id,
    title: `Stacked: ${items.map((i) => i.name).join(', ')}`,
    element: el,
    onClose: () => {
      engine.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (items.some((i) => i.id === changed.id)) {
        engine.clear();
        renderAll();
      }
    },
  };
}
