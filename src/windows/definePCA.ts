/**
 * PCA (Principal Component Analysis) window.
 * Spec: PDF §8.2.
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { PlotEngine } from '../plot/engine';
import { generateId, generateColor } from '../utils';
import { pca } from '../math/pca';

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createDefinePCAWindow(
  items: SeriesItem[],
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-pca-window';
  const plotRef = createRef<HTMLDivElement>();
  let closeCallback: (() => void) | null = null;
  let result: ReturnType<typeof pca> | null = null;

  const template = html`
    <div style="padding:8px">
      <div style="font-size:12px;margin-bottom:4px">
        Series: ${items.map(i => i.name).join(', ')} (${items.length} variables, ${items[0].index.length} pts)
      </div>
    </div>
    <div class="as-plot-container" ${ref(plotRef)}></div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${doImport}>Import PCs</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>`;
  render(template, el);

  const engine = new PlotEngine(plotRef.value!);
  engine.configureAxis('x', 0, { title: items[0].xLabel });
  engine.configureAxis('y', 0, { title: 'PC score' });

  // Compute immediately
  try {
    const valuesArrays = items.map(i => i.values);
    result = pca(valuesArrays);
    // Plot first 2 PCs
    const nPlot = Math.min(result.scores.length, 2);
    const colors = ['#d62728', '#1f77b4', '#2ca02c', '#ff7f0e'];
    for (let c = 0; c < nPlot; c++) {
      engine.addTrace({
        x: items[0].index,
        y: new Float64Array(result.scores[c]),
        color: colors[c % colors.length],
        width: 1,
        name: `PC${c + 1} (${(result.varianceFraction[c] * 100).toFixed(1)}%)`,
      });
    }
  } catch (e) {
    console.error('PCA error:', e);
  }

  function doImport() {
    if (!result) return;
    for (let c = 0; c < result.scores.length; c++) {
      const id = generateId();
      callbacks.onImport({
        id, type: 'Series',
        name: `PC${c + 1} (${(result.varianceFraction[c] * 100).toFixed(1)}%)`,
        date: formatDate(), comment: '',
        history: `PCA component ${c + 1} from ${items.map(i => `<i><b>${i.id}</b></i>`).join(', ')}<BR>---> series <i><b>${id}</b></i>`,
        xLabel: items[0].xLabel, yLabel: `PC${c + 1}`,
        color: generateColor(),
        index: new Float64Array(items[0].index),
        values: new Float64Array(result.scores[c]),
      });
    }
  }

  return {
    id: 'pca-' + items.map(i => i.id).sort().join('+'),
    title: `PCA — ${items.length} series`,
    element: el,
    onClose: () => { engine.destroy(); },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
