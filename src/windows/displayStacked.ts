/**
 * D3 — Display Stacked window.
 *
 * Multiple series each in its own subplot, with optional shared X axis
 * for subplots that have the same xLabel.
 */

import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, WorksheetItem } from '../types';
import { PlotEngine, subplotToLayoutKey } from '../plot/engine';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDisplayStackedWindow(items: SeriesItem[]): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-display-stacked-window';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'as-display-toolbar';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'shared-x-checkbox';

  const label = document.createElement('label');
  label.htmlFor = 'shared-x-checkbox';
  label.textContent = 'Shared horizontal axis';

  toolbar.appendChild(checkbox);
  toolbar.appendChild(label);

  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';

  el.appendChild(toolbar);
  el.appendChild(plotContainer);

  const engine = new PlotEngine(plotContainer, { rows: items.length });

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

  // Shared X axis logic — syncs zoom/pan across subplots that share an xLabel.
  // Uses a synchronous approach: read the changed range from the relayout event
  // and immediately push it to sibling axes via engine.relayout. A simple
  // boolean guard prevents the recursive event from re-entering.
  let relayoutBound = false;
  let updatingSharedRange = false;

  // Build groups of subplots that share the same xLabel
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
    if (updatingSharedRange || !checkbox.checked) return;

    const groups = buildXLabelGroups();
    const updates: Record<string, unknown> = {};
    let hasUpdates = false;

    // Detect which subplot's x-axis changed and propagate to its group
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
      // Set the guard synchronously. Plotly.relayout is async but the guard
      // will be released after the microtask completes, which is before the
      // next user-initiated pan event.
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

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      bindRelayout();
    }
    // When unchecked, the handler checks the checkbox state and no-ops
  });

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
