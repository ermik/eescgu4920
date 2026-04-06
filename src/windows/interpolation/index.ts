/**
 * Define Interpolation Window — the signature feature of AnalySeries.
 *
 * Provides a dual-subplot view where the user places tie-points between
 * a reference series and a distorted series, then interpolates to produce
 * an age model.
 *
 * Public API: createDefineInterpolationWindow()
 */

import type { ManagedWindow } from '../../ui/windowManager.js';
import type { SeriesItem, InterpolationItem, WorksheetItem } from '../../types.js';
import type { InterpolationCallbacks } from './types.js';
import { InterpolationState } from './state.js';
import { setupInterpolationPlot } from './plotSetup.js';
import {
  placePointerAtX,
  placePointerSnapped,
} from './pointerInteraction.js';
import {
  createConnection,
  disconnectByOverlayId,
  clearAllConnections,
  toggleLastConnection,
  loadExistingConnections,
} from './connectionManager.js';
import { OverlayManager } from './interpolatedOverlay.js';
import { createPointersTable, updatePointersTable } from './pointersTable.js';
import { PointersPlotManager } from './pointersPlot.js';
import {
  createInterpolationItem,
  createInterpolatedSeries,
} from './saveApply.js';
import type { InterpolationMode } from './types.js';

// Re-export for menu actions
export { applyInterpolation } from './saveApply.js';

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

export function createDefineInterpolationWindow(
  seriesItems: SeriesItem[],
  callbacks: InterpolationCallbacks,
  existingInterp?: InterpolationItem,
): ManagedWindow {
  // Initial ref/dist assignment (first two selected series)
  const initialRef = seriesItems[0];
  const initialDist = seriesItems.length > 1 ? seriesItems[1] : seriesItems[0];

  const state = new InterpolationState(initialRef, initialDist);

  // --- DOM structure -------------------------------------------------------

  const el = document.createElement('div');
  el.className = 'as-window as-define-interpolation-window';
  el.tabIndex = 0; // make focusable for keyboard events

  // Tabs
  const tabBar = document.createElement('div');
  tabBar.className = 'as-tab-bar';

  const tabPlots = createTab('Plots');
  const tabPointers = createTab('Pointers');
  const tabPointersPlot = createTab('Pointers Plot');
  tabBar.appendChild(tabPlots);
  tabBar.appendChild(tabPointers);
  tabBar.appendChild(tabPointersPlot);

  // Tab content containers
  const plotsPane = document.createElement('div');
  plotsPane.className = 'as-tab-pane';

  const plotContainer = document.createElement('div');
  plotContainer.className = 'as-plot-container';
  plotsPane.appendChild(plotContainer);

  const pointersPane = document.createElement('div');
  pointersPane.className = 'as-tab-pane';
  pointersPane.style.display = 'none';

  const pointersPlotPane = document.createElement('div');
  pointersPlotPane.className = 'as-tab-pane';
  pointersPlotPane.style.display = 'none';

  const ptrPlotContainer = document.createElement('div');
  ptrPlotContainer.className = 'as-plot-container';
  pointersPlotPane.appendChild(ptrPlotContainer);

  // Pointers table
  const pointersTableEl = createPointersTable();
  pointersPane.appendChild(pointersTableEl);

  // Tab switching
  const tabs = [tabPlots, tabPointers, tabPointersPlot];
  const panes = [plotsPane, pointersPane, pointersPlotPane];
  let activeTab = 0;
  let pointersPlotInitialised = false;

  function switchTab(index: number) {
    tabs[activeTab].classList.remove('as-tab-active');
    panes[activeTab].style.display = 'none';
    activeTab = index;
    tabs[activeTab].classList.add('as-tab-active');
    panes[activeTab].style.display = 'flex';

    // Lazy-init pointers plot
    if (index === 2 && !pointersPlotInitialised) {
      pointersPlotInitialised = true;
      ptrPlotMgr.createPointersPlot(ptrPlotContainer);
      ptrPlotMgr.updatePointersPlot(state);
    }

    // Refresh when switching to plots tab
    if (index === 0) {
      engine.refresh();
    }
    if (index === 2) {
      ptrPlotMgr.updatePointersPlot(state);
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => switchTab(i));
  });
  tabPlots.classList.add('as-tab-active');

  // --- Controls: series dropdowns ------------------------------------------

  const controlsRow1 = document.createElement('div');
  controlsRow1.className = 'as-control-row';

  const refLabel = document.createElement('label');
  refLabel.textContent = 'Reference series:';
  refLabel.style.width = '130px';

  const refSelect = document.createElement('select');
  refSelect.style.fontFamily = 'monospace';
  refSelect.style.flex = '1';

  const distLabel = document.createElement('label');
  distLabel.textContent = 'Distorted series:';
  distLabel.style.width = '130px';

  const distSelect = document.createElement('select');
  distSelect.style.fontFamily = 'monospace';
  distSelect.style.flex = '1';

  for (let i = 0; i < seriesItems.length; i++) {
    const s = seriesItems[i];
    const text = `${i + 1} — ${s.id}: ${s.xLabel} / ${s.yLabel}`;
    refSelect.add(new Option(text, String(i)));
    distSelect.add(new Option(text, String(i)));
  }
  refSelect.selectedIndex = 0;
  distSelect.selectedIndex = seriesItems.length > 1 ? 1 : 0;

  const row1a = document.createElement('div');
  row1a.style.display = 'flex';
  row1a.style.gap = '4px';
  row1a.style.alignItems = 'center';
  row1a.appendChild(refLabel);
  row1a.appendChild(refSelect);

  const row1b = document.createElement('div');
  row1b.style.display = 'flex';
  row1b.style.gap = '4px';
  row1b.style.alignItems = 'center';
  row1b.appendChild(distLabel);
  row1b.appendChild(distSelect);

  controlsRow1.appendChild(row1a);
  controlsRow1.appendChild(row1b);

  // --- Controls: mode, checkbox, undo, buttons -----------------------------

  const controlsRow2 = document.createElement('div');
  controlsRow2.className = 'as-control-row';
  controlsRow2.style.display = 'flex';
  controlsRow2.style.alignItems = 'center';
  controlsRow2.style.gap = '12px';
  controlsRow2.style.flexWrap = 'wrap';

  const interpLabel = document.createElement('label');
  interpLabel.textContent = 'Interpolation:';

  const interpSelect = document.createElement('select');
  interpSelect.add(new Option('Linear', 'Linear'));
  interpSelect.add(new Option('PCHIP', 'PCHIP'));

  const showInterpCb = document.createElement('input');
  showInterpCb.type = 'checkbox';
  showInterpCb.checked = true;
  showInterpCb.id = 'show-interp-cb';

  const showInterpLabel = document.createElement('label');
  showInterpLabel.htmlFor = 'show-interp-cb';
  showInterpLabel.textContent = 'Show interpolated curve';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'as-btn';
  undoBtn.textContent = 'Remove last connection';
  undoBtn.title = 'Keyboard: U';
  undoBtn.disabled = true;

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.flex = '1';

  const btnSave = document.createElement('button');
  btnSave.className = 'as-btn';
  btnSave.textContent = 'Save interpolation';

  const btnSaveBoth = document.createElement('button');
  btnSaveBoth.className = 'as-btn';
  btnSaveBoth.textContent = 'Save interpolation and series';

  const btnClose = document.createElement('button');
  btnClose.className = 'as-btn';
  btnClose.textContent = 'Close';

  controlsRow2.appendChild(interpLabel);
  controlsRow2.appendChild(interpSelect);
  controlsRow2.appendChild(showInterpCb);
  controlsRow2.appendChild(showInterpLabel);
  controlsRow2.appendChild(undoBtn);
  controlsRow2.appendChild(spacer);
  controlsRow2.appendChild(btnSave);
  controlsRow2.appendChild(btnSaveBoth);
  controlsRow2.appendChild(btnClose);

  // --- Status bar ----------------------------------------------------------

  const statusBar = document.createElement('div');
  statusBar.className = 'as-status-msg';
  statusBar.style.padding = '2px 8px';
  statusBar.style.fontSize = '12px';
  statusBar.style.color = '#666';
  statusBar.style.minHeight = '18px';

  function showStatus(msg: string, duration = 5000) {
    statusBar.textContent = msg;
    if (duration > 0) {
      setTimeout(() => {
        if (statusBar.textContent === msg) statusBar.textContent = '';
      }, duration);
    }
  }

  // --- Assemble layout -----------------------------------------------------

  el.appendChild(tabBar);
  el.appendChild(plotsPane);
  el.appendChild(pointersPane);
  el.appendChild(pointersPlotPane);
  el.appendChild(controlsRow1);
  el.appendChild(controlsRow2);
  el.appendChild(statusBar);

  // --- Per-instance managers for overlay and pointers plot ----------------

  const overlayMgr = new OverlayManager();
  const ptrPlotMgr = new PointersPlotManager();

  // --- Plot engine ---------------------------------------------------------

  const { engine, overlay, refTraceId, distTraceId } = setupInterpolationPlot(
    plotContainer,
    state,
  );

  // Load existing interpolation if provided
  if (existingInterp) {
    loadExistingConnections(
      state,
      engine,
      overlay,
      existingInterp.x1Coords,
      existingInterp.x2Coords,
    );
    undoBtn.disabled = false;
    refreshAll();
  }

  // --- Interaction helpers -------------------------------------------------

  function refreshAll() {
    overlayMgr.updateOverlay(state, engine);
    updatePointersTable(pointersTableEl, state);
    if (pointersPlotInitialised) {
      ptrPlotMgr.updatePointersPlot(state);
    }
    undoBtn.disabled = !state.lastConnection;
    undoBtn.textContent = state.lastConnectionRemoved
      ? 'Restore last connection'
      : 'Remove last connection';
  }

  // --- Keyboard events -----------------------------------------------------

  let xHeld = false;

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'x' && !e.shiftKey) { xHeld = true; return; }

    if (e.key === 'c' || e.key === 'C') {
      if (e.shiftKey) return; // Shift+C not used
      // Connect
      const msg = createConnection(state, engine, overlay);
      if (msg) {
        showStatus(msg);
      } else {
        refreshAll();
      }
      return;
    }

    if (e.key === 'u' || e.key === 'U') {
      // Undo/redo last connection
      toggleLastConnection(state, engine, overlay);
      refreshAll();
      return;
    }

    if (e.key === 'X') {
      // Clear all — ask for confirmation
      if (state.connections.length === 0) return;
      if (!confirm('Are you sure you want to delete all pointers?')) return;
      clearAllConnections(state, engine, overlay);
      overlayMgr.resetOverlayState(engine);
      refreshAll();
      return;
    }
  });

  el.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'x') xHeld = false;
  });

  // --- Mouse click on plot -------------------------------------------------

  engine.on('plotly_click', (eventData: unknown) => {
    const data = eventData as {
      points?: Array<{
        x: number;
        y: number;
        xaxis: { _id: string };
        curveNumber: number;
      }>;
      event?: MouseEvent;
    };
    if (!data.points || data.points.length === 0) return;

    const pt = data.points[0];
    const mouseEvent = data.event;
    if (!mouseEvent) return;

    // Determine subplot from the xaxis
    const xAxisId = pt.xaxis._id; // "x" or "x2"
    const subplot: 0 | 1 = xAxisId === 'x' ? 0 : 1;

    if (mouseEvent.shiftKey) {
      placePointerAtX(state, engine, subplot, pt.x);
      el.focus();
      return;
    }

    if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
      placePointerSnapped(state, engine, subplot, pt.x);
      el.focus();
      return;
    }
  });

  // --- Connection overlay click (x+click to disconnect) --------------------

  overlay.onClick((connectionId: string) => {
    if (xHeld) {
      disconnectByOverlayId(state, engine, overlay, connectionId);
      refreshAll();
    }
  });

  // --- Connection overlay hover (highlight) --------------------------------

  let hoveredConnectionId: string | null = null;
  overlay.onHover((connectionId: string | null) => {
    if (hoveredConnectionId) {
      overlay.setHighlight(hoveredConnectionId, false);
    }
    hoveredConnectionId = connectionId;
    if (connectionId) {
      overlay.setHighlight(connectionId, true);
    }
  });

  // --- Interpolation mode change -------------------------------------------

  interpSelect.addEventListener('change', () => {
    const mode = interpSelect.value as InterpolationMode;
    state.setInterpolationMode(mode);
    refreshAll();
  });

  // --- Show interpolated checkbox ------------------------------------------

  showInterpCb.addEventListener('change', () => {
    state.showInterpolated = showInterpCb.checked;
    if (!state.canInterpolate) {
      showStatus('Warning: interpolation function not defined (not enough pointers)');
      return;
    }
    overlayMgr.updateOverlay(state, engine);
  });

  // --- Series selection change ---------------------------------------------

  function handleSeriesChange() {
    const newRef = seriesItems[refSelect.selectedIndex];
    const newDist = seriesItems[distSelect.selectedIndex];

    // Clear everything
    clearAllConnections(state, engine, overlay);
    overlayMgr.resetOverlayState(engine);

    state.switchSeries(newRef, newDist);

    // Update traces
    engine.beginUpdate();
    engine.updateTrace(refTraceId, {
      x: newRef.index,
      y: newRef.values,
      color: newRef.color,
      name: newRef.name,
    });
    engine.configureAxis('x', 0, { title: newRef.xLabel });
    engine.configureAxis('y', 0, { title: newRef.yLabel });

    engine.updateTrace(distTraceId, {
      x: newDist.index,
      y: newDist.values,
      color: newDist.color,
      name: newDist.name,
    });
    engine.configureAxis('x', 1, { title: newDist.xLabel });
    engine.configureAxis('y', 1, { title: newDist.yLabel });
    engine.endUpdate();

    refreshAll();
  }

  refSelect.addEventListener('change', handleSeriesChange);
  distSelect.addEventListener('change', handleSeriesChange);

  // --- Save buttons --------------------------------------------------------

  btnSave.addEventListener('click', () => {
    const item = createInterpolationItem(state);
    if (!item) {
      showStatus('Warning: interpolation not defined (not enough pointers)');
      return;
    }
    callbacks.onSaveInterpolation(item);
    showStatus('Interpolation saved.');
  });

  btnSaveBoth.addEventListener('click', () => {
    const interpItem = createInterpolationItem(state);
    if (!interpItem) {
      showStatus('Warning: interpolation not defined (not enough pointers)');
      return;
    }
    const seriesItem = createInterpolatedSeries(state, interpItem.id);
    if (!seriesItem) return;
    callbacks.onSaveInterpolationAndSeries(interpItem, seriesItem);
    showStatus('Interpolation and series saved.');
  });

  // --- Close button --------------------------------------------------------

  let closeCallback: (() => void) | null = null;
  btnClose.addEventListener('click', () => {
    closeCallback?.();
  });

  // --- ManagedWindow return ------------------------------------------------

  const winId = 'interpolation-' + initialRef.id + '-' + initialDist.id;

  return {
    id: winId,
    title: `Interpolation: ${initialRef.name} ↔ ${initialDist.name}`,
    element: el,
    onClose: () => {
      overlayMgr.resetOverlayState();
      engine.destroy();
      overlay.destroy();
      ptrPlotMgr.destroyPointersPlot();
    },
    syncWithItem: (changed: WorksheetItem) => {
      // If one of our series changed, update
      if (changed.id === state.refItem.id) {
        const s = changed as SeriesItem;
        state.refItem = s;
        engine.updateTrace(refTraceId, {
          x: s.index, y: s.values, color: s.color,
        });
        engine.configureAxis('x', 0, { title: s.xLabel });
        engine.configureAxis('y', 0, { title: s.yLabel });
        refreshAll();
      }
      if (changed.id === state.distItem.id) {
        const s = changed as SeriesItem;
        state.distItem = s;
        engine.updateTrace(distTraceId, {
          x: s.index, y: s.values, color: s.color,
        });
        engine.configureAxis('x', 1, { title: s.xLabel });
        engine.configureAxis('y', 1, { title: s.yLabel });
        refreshAll();
      }
    },
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTab(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'as-tab';
  btn.textContent = label;
  return btn;
}
