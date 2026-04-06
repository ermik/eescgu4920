/**
 * Batch-C visual demo — renders six test sections for manual verification.
 *
 * To use: temporarily import and call `runBatchCDemo(document.getElementById('app')!)`
 * from main.ts, then run `npm run dev`.
 */

import { PlotEngine } from '../engine.js';
import { ConnectionOverlay } from '../connectionOverlay.js';
// Note: imports unchanged — engine.ts and connectionOverlay.ts still exist
// at the same relative paths within src/plot/.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSection(
  parent: HTMLElement,
  title: string,
  description: string,
  height = '400px',
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '30px';

  const h2 = document.createElement('h2');
  h2.textContent = title;
  h2.style.margin = '0 0 4px';
  wrapper.appendChild(h2);

  const p = document.createElement('p');
  p.textContent = description;
  p.style.color = '#666';
  p.style.margin = '0 0 8px';
  wrapper.appendChild(p);

  const plotContainer = document.createElement('div');
  plotContainer.style.width = '100%';
  plotContainer.style.height = height;
  plotContainer.style.border = '1px solid #ccc';
  wrapper.appendChild(plotContainer);

  parent.appendChild(wrapper);
  return plotContainer;
}

function generateSine(n: number, freq = 1, phase = 0): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = (i / n) * Math.PI * 2 * 5;
    y[i] = Math.sin(x[i] * freq + phase);
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

export function runBatchCDemo(container: HTMLElement): void {
  container.innerHTML = '';
  container.style.padding = '20px';
  container.style.overflowY = 'auto';
  container.style.fontFamily = 'system-ui, sans-serif';

  // ========================================================================
  // 1. Single plot — sine wave
  // ========================================================================
  const c1 = createSection(
    container,
    '1. Single Plot — 1000-point Sine Wave',
    'Verify: pan (drag), zoom (scroll), hover tooltip, legend toggle, ' +
      'double-click to autosize.',
  );
  const engine1 = new PlotEngine(c1);
  const sine = generateSine(1000);
  engine1.addTrace({ x: sine.x, y: sine.y, name: 'sin(x)', color: '#1f77b4' });

  // ========================================================================
  // 2. Two subplots — sine and cosine
  // ========================================================================
  const c2 = createSection(
    container,
    '2. Two Subplots — Sine & Cosine',
    'Verify: independent zoom per subplot.',
    '500px',
  );
  const engine2 = new PlotEngine(c2, { rows: 2 });
  const s2 = generateSine(1000);
  engine2.addTrace({
    x: s2.x,
    y: s2.y,
    name: 'sin(x)',
    color: '#1f77b4',
    subplot: 0,
  });
  const cosY = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) cosY[i] = Math.cos(s2.x[i]);
  engine2.addTrace({
    x: s2.x,
    y: cosY,
    name: 'cos(x)',
    color: '#ff7f0e',
    subplot: 1,
  });

  // ========================================================================
  // 3. Twin Y axes
  // ========================================================================
  const c3 = createSection(
    container,
    '3. Twin Y Axes — Different Scales',
    'Verify: both traces visible, left axis labelled blue, right axis ' +
      'labelled orange, Y axes independent.',
  );
  const engine3 = new PlotEngine(c3);
  const s3 = generateSine(1000);
  engine3.addTrace({
    x: s3.x,
    y: s3.y,
    name: 'sin(x)',
    color: '#1f77b4',
  });
  engine3.configureAxis('y', 0, { title: 'Sine Scale', titleColor: '#1f77b4' });
  const twinIdx = engine3.addTwinY(0, {
    title: 'Cosine × 100 + 50',
    titleColor: '#ff7f0e',
    side: 'right',
  });
  const scaledCos = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    scaledCos[i] = Math.cos(s3.x[i]) * 100 + 50;
  }
  engine3.addTrace({
    x: s3.x,
    y: scaledCos,
    name: 'cos(x)×100+50',
    color: '#ff7f0e',
    yAxisIndex: twinIdx,
  });

  // ========================================================================
  // 4. Secondary X axis — age ↔ depth transform
  // ========================================================================
  const c4 = createSection(
    container,
    '4. Secondary X Axis — Age → Depth',
    'Verify: top axis shows "Depth (m)" values computed as age×2.5+10. ' +
      'Labels update when zooming.',
  );
  const engine4 = new PlotEngine(c4);
  const ageX = new Float64Array(200);
  const proxyY = new Float64Array(200);
  for (let i = 0; i < 200; i++) {
    ageX[i] = i * 0.5;
    proxyY[i] = Math.sin(ageX[i] * 0.1) * 3 + Math.random() * 0.5;
  }
  engine4.addTrace({ x: ageX, y: proxyY, name: 'Proxy', color: '#2ca02c' });
  engine4.configureAxis('x', 0, { title: 'Age (ka)' });
  engine4.configureAxis('y', 0, { title: 'δ¹⁸O (‰)' });
  engine4.addSecondaryXAxis(0, (x) => x * 2.5 + 10, 'Depth (m)');

  // ========================================================================
  // 5. Connection overlay
  // ========================================================================
  const c5 = createSection(
    container,
    '5. Connection Overlay — Tie-point Lines',
    'Verify: lines connect correct X positions between subplots. ' +
      'Hover highlights red, click logs to console. Pan either subplot — lines follow.',
    '500px',
  );
  const engine5 = new PlotEngine(c5, { rows: 2, verticalSpacing: 0.15 });

  const refX = new Float64Array(100);
  const refY = new Float64Array(100);
  for (let i = 0; i < 100; i++) {
    refX[i] = i;
    refY[i] = Math.sin(i * 0.1);
  }
  engine5.addTrace({
    x: refX,
    y: refY,
    name: 'Reference',
    color: '#1f77b4',
    subplot: 0,
  });

  const distX = new Float64Array(100);
  const distY = new Float64Array(100);
  for (let i = 0; i < 100; i++) {
    distX[i] = i * 1.2 + 5;
    distY[i] = Math.sin(i * 0.1);
  }
  engine5.addTrace({
    x: distX,
    y: distY,
    name: 'Distorted',
    color: '#ff7f0e',
    subplot: 1,
  });

  const overlay = new ConnectionOverlay(engine5, 0, 1);
  overlay.addConnection(20, 29);
  overlay.addConnection(50, 65);
  overlay.addConnection(80, 101);

  overlay.onHover((id) => {
    if (id) {
      overlay.setHighlight(id, true);
    } else {
      for (const c of overlay.getConnections()) {
        overlay.setHighlight(c.id, false);
      }
    }
  });
  overlay.onClick((id) => {
    console.log('Connection clicked:', id);
  });

  // ========================================================================
  // 6. Large dataset — 50,000 points (WebGL)
  // ========================================================================
  const c6 = createSection(
    container,
    '6. Large Dataset — 50,000 Points (WebGL)',
    'Verify: scattergl auto-activated (check browser DevTools Network or ' +
      'Plotly trace type), smooth pan/zoom.',
  );
  const engine6 = new PlotEngine(c6);
  const bigX = new Float64Array(50_000);
  const bigY = new Float64Array(50_000);
  for (let i = 0; i < 50_000; i++) {
    bigX[i] = i * 0.001;
    bigY[i] = Math.sin(bigX[i] * 2) + Math.random() * 0.3;
  }
  engine6.addTrace({
    x: bigX,
    y: bigY,
    name: '50K points',
    color: '#9467bd',
  });
}
