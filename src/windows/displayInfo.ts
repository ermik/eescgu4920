/**
 * D6 — Info Display Panels for FILTER, SAMPLE, and INTERPOLATION items.
 *
 * Read-only info windows opened when double-clicking a non-series item.
 */

import { html, render } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { ManagedWindow } from '../ui/windowManager';
import type {
  WorksheetItem,
  FilterItem,
  SampleItem,
  InterpolationItem,
} from '../types';
import { PlotEngine } from '../plot/engine';
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

  const contentArea = document.createElement('div');
  contentArea.style.flex = '1';
  contentArea.style.display = 'flex';
  contentArea.style.flexDirection = 'column';
  contentArea.style.minHeight = '0';
  contentArea.style.overflow = 'hidden';

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
    contentArea.appendChild(tab.content);
  }

  function switchTo(id: string) {
    for (const b of buttons) b.classList.toggle('as-tab-inner-active', b.dataset.tabId === id);
    for (const panel of contentArea.children) {
      (panel as HTMLElement).classList.toggle('as-tab-inner-panel-active', (panel as HTMLElement).dataset.tabId === id);
    }
  }

  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.as-tab-inner') as HTMLElement | null;
    if (btn?.dataset.tabId) switchTo(btn.dataset.tabId);
  });

  root.appendChild(bar);
  root.appendChild(contentArea);
  if (tabs.length > 0) switchTo(tabs[0].id);

  return { el: root, switchTo };
}

// ---------------------------------------------------------------------------
// Shared info panel builder
// ---------------------------------------------------------------------------

function buildInfoPanel(item: WorksheetItem): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'as-info-section';

  render(html`
    <p><b>${item.name}</b></p>
    <p>${item.date}</p>
    <p><b>History</b></p>
    <div class="as-info-history">
      ${item.history ? unsafeHTML(item.history) : html`<i>No history</i>`}
    </div>
    <p><b>Comment</b></p>
    <textarea class="as-info-comment" .value=${item.comment}
      @input=${(e: Event) => { item.comment = (e.target as HTMLTextAreaElement).value; }}
    ></textarea>
  `, panel);

  return panel;
}

// ---------------------------------------------------------------------------
// FILTER info
// ---------------------------------------------------------------------------

function buildFilterWindow(item: FilterItem): HTMLElement {
  const paramsPanel = document.createElement('div');
  paramsPanel.className = 'as-info-section';
  render(html`
    <p><b>Parameters</b></p>
    <p>Moving average window size: <b>${item.windowSize}</b></p>
  `, paramsPanel);

  const { el } = buildTabs([
    { id: 'params', label: 'Parameters', content: paramsPanel },
    { id: 'info', label: 'Info', content: buildInfoPanel(item) },
  ]);
  return el;
}

// ---------------------------------------------------------------------------
// SAMPLE info
// ---------------------------------------------------------------------------

function buildSampleWindow(item: SampleItem): HTMLElement {
  const paramsPanel = document.createElement('div');
  paramsPanel.className = 'as-info-section';

  render(html`
    <p><b>Parameters</b></p>
    ${item.step !== null
      ? html`<p>Sampling with step: <b>${item.step}</b></p>`
      : html`<p>Sampling using x-values of series</p>`}
    <p>Kind: <b>${item.kind}</b></p>
    <p>Integration: <b>${item.integrated ? 'yes' : 'no'}</b></p>
  `, paramsPanel);

  const tabs: { id: string; label: string; content: HTMLElement }[] = [
    { id: 'params', label: 'Parameters', content: paramsPanel },
  ];

  // X sampling coordinates tab
  if (item.xCoords && item.xCoords.length > 0) {
    const coordsPanel = document.createElement('div');
    coordsPanel.style.overflow = 'auto';
    coordsPanel.style.flex = '1';

    render(html`
      <table class="as-data-table">
        <thead><tr><th>X Coordinate</th></tr></thead>
        <tbody>
          ${item.xCoords.map((x) => html`
            <tr><td>${formatNumber(x, 6)}</td></tr>
          `)}
        </tbody>
      </table>
    `, coordsPanel);

    tabs.push({ id: 'coords', label: 'X Sampling Coordinates', content: coordsPanel });
  }

  tabs.push({ id: 'info', label: 'Info', content: buildInfoPanel(item) });

  const { el } = buildTabs(tabs);
  return el;
}

// ---------------------------------------------------------------------------
// INTERPOLATION info
// ---------------------------------------------------------------------------

function buildInterpolationWindow(item: InterpolationItem): HTMLElement {
  // Pointers table
  const pointersPanel = document.createElement('div');
  pointersPanel.style.overflow = 'auto';
  pointersPanel.style.flex = '1';

  render(html`
    <table class="as-pointers-table">
      <thead>
        <tr>
          <th>Distorted: X</th>
          <th>Reference: ${item.x1Name}</th>
        </tr>
      </thead>
      <tbody>
        ${item.x2Coords.map((x2, i) => html`
          <tr>
            <td>${formatNumber(x2, 6)}</td>
            <td>${formatNumber(item.x1Coords[i], 6)}</td>
          </tr>
        `)}
      </tbody>
    </table>
  `, pointersPanel);

  // Pointers plot
  const plotPanel = document.createElement('div');
  plotPanel.className = 'as-plot-container';

  let plotEngine: PlotEngine | null = null;
  let plotInitialized = false;

  function initPointersPlot() {
    if (plotInitialized) return;
    plotInitialized = true;
    plotEngine = new PlotEngine(plotPanel);
    plotEngine.beginUpdate();

    // Main trace: x2 vs x1
    plotEngine.addTrace({
      x: item.x2Coords,
      y: item.x1Coords,
      color: 'steelblue',
      width: 1.5,
      showMarkers: true,
      name: `${item.x1Name} vs X`,
    });

    plotEngine.configureAxis('x', 0, { title: 'X' });
    plotEngine.configureAxis('y', 0, { title: item.x1Name });

    // Compute gradients
    if (item.x1Coords.length >= 2) {
      const nPts = 100;
      const x2Min = Math.min(...item.x2Coords);
      const x2Max = Math.max(...item.x2Coords);
      const step = (x2Max - x2Min) / nPts;

      const xs: number[] = [];
      for (let i = 0; i <= nPts; i++) xs.push(x2Min + i * step);

      // Sort tie points for interp functions
      const sortedPairs = item.x1Coords.map((v, i) => ({
        x2: item.x2Coords[i],
        x1: v,
      })).sort((a, b) => a.x2 - b.x2);
      const sx2 = sortedPairs.map((p) => p.x2);
      const sx1 = sortedPairs.map((p) => p.x1);

      const linearFn = createLinearInterpFn(sx2, sx1);
      const pchipFn = createPchipInterpFn(sx2, sx1);

      const h = step * 0.01;
      const linearGrads: number[] = [];
      const pchipGrads: number[] = [];
      for (const x of xs) {
        const dlx1 = linearFn(x + h) - linearFn(x - h);
        const dpx1 = pchipFn(x + h) - pchipFn(x - h);
        linearGrads.push(Math.abs(dlx1) < 1e-15 ? NaN : (2 * h) / dlx1);
        pchipGrads.push(Math.abs(dpx1) < 1e-15 ? NaN : (2 * h) / dpx1);
      }

      const twinYIdx = plotEngine.addTwinY(0, {
        title: 'Gradients (dx/dy)',
        titleColor: 'darkorange',
        side: 'right',
      });

      plotEngine.addTrace({
        x: xs,
        y: linearGrads,
        color: 'darkorange',
        width: 1,
        opacity: 0.8,
        name: 'Linear',
        yAxisIndex: twinYIdx,
      });

      plotEngine.addTrace({
        x: xs,
        y: pchipGrads,
        color: 'darkorange',
        width: 1,
        opacity: 0.5,
        name: 'PCHIP',
        yAxisIndex: twinYIdx,
      });
    }

    plotEngine.endUpdate();
  }

  const { el } = buildTabs([
    { id: 'pointers', label: 'Pointers', content: pointersPanel },
    { id: 'plot', label: 'Pointers Plot', content: plotPanel },
    { id: 'info', label: 'Info', content: buildInfoPanel(item) },
  ]);

  // Lazy init plot when tab is shown
  el.querySelector('.as-tab-inner-bar')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.as-tab-inner') as HTMLElement | null;
    if (btn?.dataset.tabId === 'plot') {
      initPointersPlot();
      plotEngine?.refresh();
    }
  }, true);

  // Store engine ref for cleanup
  (el as HTMLElement & { _plotEngine?: PlotEngine })._plotEngine = undefined as unknown as PlotEngine;
  const origEl = el;
  Object.defineProperty(origEl, '_plotEngine', {
    get: () => plotEngine,
    configurable: true,
  });

  return el;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// Batch F: Added syncWithItem for name display updates (F2)
export function createDisplayInfoWindow(item: WorksheetItem): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-display-info-window';

  let contentEl: HTMLElement;
  switch (item.type) {
    case 'FILTER':
      contentEl = buildFilterWindow(item as FilterItem);
      break;
    case 'SAMPLE':
      contentEl = buildSampleWindow(item as SampleItem);
      break;
    case 'INTERPOLATION':
      contentEl = buildInterpolationWindow(item as InterpolationItem);
      break;
    default:
      contentEl = document.createElement('div');
      contentEl.textContent = 'Unknown item type.';
  }

  el.appendChild(contentEl);

  return {
    id: 'info-' + item.id,
    title: `${item.type}: ${item.name}`,
    element: el,
    onClose: () => {
      const pe = (contentEl as HTMLElement & { _plotEngine?: PlotEngine })._plotEngine;
      if (pe) pe.destroy();
    },
    syncWithItem: (changed: WorksheetItem) => {
      if (changed.id !== item.id) return;
      const nameEl = contentEl.querySelector('.as-info-section p b');
      if (nameEl) nameEl.textContent = changed.name;
    },
  };
}
