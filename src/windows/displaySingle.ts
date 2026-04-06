/**
 * D1 — Display Single Series window.
 *
 * Four tabs: Data, Stats, Plot, Info.
 */

import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem, WorksheetItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { computeStats, type SeriesStats } from '../math/stats';
import { createLinearInterpFn } from '../math/interp';
import { createPchipInterpFn } from '../math/pchip';
import { formatNumber } from '../utils';

// ---------------------------------------------------------------------------
// Tab helper
// ---------------------------------------------------------------------------

function buildTabs(
  tabs: { id: string; label: string; content: HTMLElement }[],
): { el: HTMLElement; switchTo: (id: string) => void } {
  const root = document.createElement('div');
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.flex = '1';
  root.style.minHeight = '0';

  const bar = document.createElement('div');
  bar.className = 'as-tab-inner-bar';

  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.minHeight = '0';
  content.style.overflow = 'hidden';

  const buttons: HTMLButtonElement[] = [];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'as-tab-inner';
    btn.textContent = tab.label;
    btn.dataset.tabId = tab.id;
    bar.appendChild(btn);
    buttons.push(btn);

    tab.content.className += ' as-tab-inner-panel';
    tab.content.dataset.tabId = tab.id;
    content.appendChild(tab.content);
  }

  function switchTo(id: string) {
    for (const b of buttons) {
      b.classList.toggle('as-tab-inner-active', b.dataset.tabId === id);
    }
    for (const panel of content.children) {
      const el = panel as HTMLElement;
      el.classList.toggle('as-tab-inner-panel-active', el.dataset.tabId === id);
    }
  }

  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.as-tab-inner') as HTMLElement | null;
    if (btn?.dataset.tabId) switchTo(btn.dataset.tabId);
  });

  root.appendChild(bar);
  root.appendChild(content);

  // Activate first tab
  if (tabs.length > 0) switchTo(tabs[0].id);

  return { el: root, switchTo };
}

// ---------------------------------------------------------------------------
// Stats formatting
// ---------------------------------------------------------------------------

const STAT_LABELS: [keyof SeriesStats, string, 'int' | 'num' | 'pval'][] = [
  ['count', 'Count', 'int'],
  ['replicateCount', 'Replicates', 'int'],
  ['missingCount', 'Missing', 'int'],
  ['mean', 'Mean', 'num'],
  ['median', 'Median', 'num'],
  ['min', 'Min', 'num'],
  ['max', 'Max', 'num'],
  ['std', 'Std Dev', 'num'],
  ['variance', 'Variance', 'num'],
  ['q25', 'Q25', 'num'],
  ['q50', 'Q50', 'num'],
  ['q75', 'Q75', 'num'],
  ['iqr', 'IQR', 'num'],
  ['pearson', 'Pearson r', 'num'],
  ['pearsonPValue', 'Pearson p-value', 'pval'],
  ['spearman', 'Spearman rho', 'num'],
  ['spearmanPValue', 'Spearman p-value', 'pval'],
];

function formatStat(value: number, fmt: 'int' | 'num' | 'pval'): string {
  if (isNaN(value)) return 'NaN';
  if (fmt === 'int') return String(Math.round(value));
  if (fmt === 'pval') return value.toExponential(2);
  return formatNumber(value, 2);
}

// ---------------------------------------------------------------------------
// Data tab helpers
// ---------------------------------------------------------------------------

function findDuplicateIndices(index: Float64Array): Set<number> {
  const counts = new Map<number, number>();
  for (let i = 0; i < index.length; i++) {
    counts.set(index[i], (counts.get(index[i]) ?? 0) + 1);
  }
  const dups = new Set<number>();
  for (const [val, count] of counts) {
    if (count > 1) dups.add(val);
  }
  return dups;
}

// Batch F: Cap rows at 1000 for very large series (F8 edge case #5).
// Rendering 100k+ rows freezes the browser.
const DATA_TABLE_ROW_CAP = 1000;

function buildDataTable(item: SeriesItem): HTMLElement {
  const container = document.createElement('div');
  container.style.overflow = 'auto';
  container.style.flex = '1';

  if (item.index.length === 0) {
    container.innerHTML = '<div class="as-no-data">No data</div>';
    return container;
  }

  const total = item.index.length;
  const capped = total > DATA_TABLE_ROW_CAP;
  const displayCount = capped ? DATA_TABLE_ROW_CAP : total;

  if (capped) {
    const notice = document.createElement('div');
    notice.style.padding = '4px 8px';
    notice.style.fontSize = '12px';
    notice.style.color = '#888';
    notice.style.background = '#fffbe6';
    notice.style.borderBottom = '1px solid #eee';
    notice.textContent = `Showing ${displayCount.toLocaleString()} of ${total.toLocaleString()} rows.`;
    container.appendChild(notice);
  }

  const table = document.createElement('table');
  table.className = 'as-data-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thX = document.createElement('th');
  thX.textContent = item.xLabel;
  thX.className = 'as-data-th-x';
  const thY = document.createElement('th');
  thY.textContent = item.yLabel;
  thY.className = 'as-data-th-y';
  headerRow.appendChild(thX);
  headerRow.appendChild(thY);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const dups = findDuplicateIndices(item.index);

  for (let i = 0; i < displayCount; i++) {
    const tr = document.createElement('tr');
    if (dups.has(item.index[i])) tr.className = 'as-row-duplicate';

    const tdX = document.createElement('td');
    tdX.textContent = formatNumber(item.index[i], 6);
    tr.appendChild(tdX);

    const tdY = document.createElement('td');
    tdY.textContent = formatNumber(item.values[i], 6);
    if (isNaN(item.values[i])) tdY.className = 'as-cell-nan';
    tr.appendChild(tdY);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);

  // Ctrl+C to copy as TSV (copies ALL data, not just displayed rows)
  container.tabIndex = 0;
  container.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      const sel = document.getSelection();
      if (sel && sel.toString().length > 0) return; // let browser handle text selection copy

      e.preventDefault();
      const lines: string[] = [`${item.xLabel}\t${item.yLabel}`];
      for (let i = 0; i < item.index.length; i++) {
        lines.push(`${formatNumber(item.index[i], 6)}\t${formatNumber(item.values[i], 6)}`);
      }
      void navigator.clipboard.writeText(lines.join('\n'));
    }
  });

  return container;
}

function buildStatsTable(item: SeriesItem): HTMLElement {
  const container = document.createElement('div');
  container.style.overflow = 'auto';
  container.style.flex = '1';

  const stats = computeStats(item.index, item.values);
  const table = document.createElement('table');
  table.className = 'as-stats-table';
  const tbody = document.createElement('tbody');

  for (const [key, label, fmt] of STAT_LABELS) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = label;
    const tdVal = document.createElement('td');
    tdVal.textContent = formatStat(stats[key], fmt);
    tr.appendChild(tdName);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function buildInfoPanel(item: SeriesItem): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'as-info-section';

  const name = document.createElement('p');
  name.innerHTML = `<b>${escapeHtml(item.name)}</b>`;
  panel.appendChild(name);

  const date = document.createElement('p');
  date.textContent = item.date;
  panel.appendChild(date);

  const histLabel = document.createElement('p');
  histLabel.innerHTML = '<b>History</b>';
  panel.appendChild(histLabel);

  const history = document.createElement('div');
  history.className = 'as-info-history';
  history.innerHTML = item.history || '<i>No history</i>';
  panel.appendChild(history);

  const commentLabel = document.createElement('p');
  commentLabel.innerHTML = '<b>Comment</b>';
  panel.appendChild(commentLabel);

  const comment = document.createElement('textarea');
  comment.className = 'as-info-comment';
  comment.value = item.comment;
  comment.addEventListener('input', () => {
    item.comment = comment.value;
  });
  panel.appendChild(comment);

  return panel;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createDisplaySingleWindow(item: SeriesItem): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-display-single-window';

  // Build tabs
  const dataPanel = buildDataTable(item);
  const statsPanel = buildStatsTable(item);
  const plotPanel = document.createElement('div');
  plotPanel.className = 'as-plot-container';
  const infoPanel = buildInfoPanel(item);

  const { el: tabsEl, switchTo } = buildTabs([
    { id: 'data', label: 'Data', content: dataPanel },
    { id: 'stats', label: 'Stats', content: statsPanel },
    { id: 'plot', label: 'Plot', content: plotPanel },
    { id: 'info', label: 'Info', content: infoPanel },
  ]);

  el.appendChild(tabsEl);

  // Plot — initialized lazily when the Plot tab is shown
  let engine: PlotEngine | null = null;
  let traceId = -1;
  let plotInitialized = false;

  function initPlot() {
    if (plotInitialized) return;
    plotInitialized = true;
    engine = new PlotEngine(plotPanel);
    engine.beginUpdate();
    traceId = engine.addTrace({
      x: item.index,
      y: item.values,
      color: item.color,
      width: 0.8,
      name: item.yLabel,
    });
    engine.configureAxis('x', 0, { title: item.xLabel });
    engine.configureAxis('y', 0, { title: item.yLabel });

    // Secondary X axis for interpolated series
    if (item.interpolation) {
      const overlay = item.interpolation;
      const interpFn =
        overlay.interpolationMode === 'PCHIP'
          ? createPchipInterpFn(overlay.x1Coords, overlay.x2Coords)
          : createLinearInterpFn(overlay.x1Coords, overlay.x2Coords);
      engine.addSecondaryXAxis(0, interpFn, overlay.xOriginalLabel);
    }
    engine.endUpdate();
  }

  // Intercept tab clicks to lazily init the plot when the Plot tab is shown.
  // Uses capture phase + stopImmediatePropagation to prevent the default
  // handler inside buildTabs from firing a redundant second switchTo.
  tabsEl.querySelector('.as-tab-inner-bar')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.as-tab-inner') as HTMLElement | null;
    if (!btn?.dataset.tabId) return;
    e.stopImmediatePropagation();
    switchTo(btn.dataset.tabId);
    if (btn.dataset.tabId === 'plot') {
      initPlot();
      engine?.refresh();
    }
  }, true);

  return {
    id: item.id,
    title: `${item.name}`,
    element: el,
    onClose: () => {
      engine?.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (changed.id !== item.id) return;
      const s = changed as SeriesItem;

      // Update plot
      if (engine && traceId >= 0) {
        engine.beginUpdate();
        engine.updateTrace(traceId, {
          x: s.index,
          y: s.values,
          color: s.color,
          name: s.yLabel,
        });
        engine.configureAxis('x', 0, { title: s.xLabel });
        engine.configureAxis('y', 0, { title: s.yLabel });
        engine.endUpdate();
      }

      // Update data tab headers
      const thX = dataPanel.querySelector('.as-data-th-x');
      const thY = dataPanel.querySelector('.as-data-th-y');
      if (thX) thX.textContent = s.xLabel;
      if (thY) thY.textContent = s.yLabel;
    },
  };
}
