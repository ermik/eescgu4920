/**
 * Application entry point — builds the shell layout and wires all modules.
 *
 * Batch F changes:
 * - F1: Complete menu wiring — Exit with confirmation dialog, Open Worksheet
 *       from JSON file, Save Worksheet As (export), Display Together fallback
 *       to Single when exactly 1 series, max 8 series guard
 * - F2: Cross-worksheet item sync, window close for deleted items
 * - F3: History format fixes for Apply Filter/Sample (ID references)
 * - F4: JSON file open/export via serialization module
 * - F5: About dialog
 * - F6: Status bar messages for all operations
 * - F7: Keyboard shortcut guards (handled in menu.ts)
 * - F8: Edge cases — empty worksheet ops, rapid-fire guards, concurrent
 *        worksheet warnings
 */

import './style.css';
import type { Worksheet, WorksheetItem, SeriesItem } from './types';
import type { ManagedWindow } from './ui/windowManager';
import { generateId, generateColor, appendHistory } from './utils';
import { initDB, loadAllWorksheets, saveWorksheet, deleteWorksheet } from './db';
import { createStatusBar } from './ui/status';
import { TreeWidget } from './ui/tree';
import { MenuBar, type MenuAction } from './ui/menu';
import { Clipboard } from './ui/clipboard';
import { WindowManager } from './ui/windowManager';
import { showImportDialog } from './ui/importDialog';
import { showAboutDialog } from './ui/aboutDialog';
import { downloadWorksheet, deserializeWorksheet } from './io/serialization';
import {
  validateDisplaySelection,
  validateFilterSelection,
  validateApplyFilter,
  validateSampleSelection,
  validateApplySample,
  validateInterpolationSelection,
  validateApplyInterpolation,
} from './ui/selectionHelpers';
import { movingAverage } from './math/filter';
import { resample } from './math/sample';
import { createDisplaySingleWindow } from './windows/displaySingle';
import { createDisplayTogetherWindow } from './windows/displayTogether';
import { createDisplayStackedWindow } from './windows/displayStacked';
import { createDefineFilterWindow } from './windows/defineFilter';
import { createDefineSampleWindow } from './windows/defineSample';
import { createDisplayInfoWindow } from './windows/displayInfo';
import { createDefineRandomWindow } from './windows/defineRandom';
import { createDefineSinusoidalWindow } from './windows/defineSinusoidal';
import { createDefineInsolationWindow } from './windows/defineInsolation';
import { createDefineCorrelationWindow } from './windows/defineCorrelation';
import { createDefineSpectralWindow } from './windows/defineSpectral';
import { createDefineFreqFilterWindow } from './windows/defineFreqFilter';
import { createDefineFittingWindow } from './windows/defineFitting';
import { createDefineNoiseWindow } from './windows/defineNoise';
import { createDefineIceVolumeWindow } from './windows/defineIceVolume';
import { createDefineHistogramWindow } from './windows/defineHistogram';
import { createDefineSimpleFunctionWindow } from './windows/defineSimpleFunction';
import { createDefineSSAWindow } from './windows/defineSSA';
import { createDefinePCAWindow } from './windows/definePCA';
import { createDefineInterpolationWindow, applyInterpolation } from './windows/interpolation/index';
import { importExcelWorksheet, exportExcelWorksheet } from './io/excel';

// ---------------------------------------------------------------------------
// In-memory worksheet store (single source of truth)
// ---------------------------------------------------------------------------

const worksheets = new Map<string, Worksheet>();

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const app = document.getElementById('app')!;

  // — Shell layout —
  const menuBarEl = document.createElement('nav');
  menuBarEl.className = 'as-menubar';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'as-body';

  const sidebarEl = document.createElement('div');
  sidebarEl.className = 'as-sidebar';

  const mainEl = document.createElement('div');
  mainEl.className = 'as-main';

  // Resize handle between sidebar and main area
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'as-sidebar-resize';

  bodyEl.appendChild(sidebarEl);
  bodyEl.appendChild(resizeHandle);
  bodyEl.appendChild(mainEl);

  // Sidebar drag-resize
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizeHandle.classList.add('as-resizing');
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(ev.clientX, window.innerWidth - 200));
      sidebarEl.style.width = newWidth + 'px';
    };
    const onMouseUp = () => {
      resizeHandle.classList.remove('as-resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  app.appendChild(menuBarEl);
  app.appendChild(bodyEl);

  // Status bar — createStatusBar appends its element to the given container
  const { showMessage: setStatus } = createStatusBar(app);

  // — Persistence —
  try {
    await initDB();
  } catch (err) {
    console.error('Failed to initialise IndexedDB:', err);
    setStatus('Warning: database unavailable, changes will not persist.');
  }

  let loadedWorksheets: Worksheet[] = [];
  try {
    loadedWorksheets = await loadAllWorksheets();
  } catch (err) {
    console.error('Failed to load worksheets:', err);
  }

  // — Components —
  const tree = new TreeWidget(sidebarEl);
  const menuBar = new MenuBar(menuBarEl);
  const clipboard = new Clipboard();
  const windowManager = new WindowManager(mainEl);

  // Populate from IndexedDB
  for (const ws of loadedWorksheets) {
    ws.modified = false;
    worksheets.set(ws.id, ws);
    tree.addWorksheet(ws);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function getOrCreateCurrentWs(): Worksheet {
    const wsId = tree.getCurrentWsId();
    if (wsId) {
      const ws = worksheets.get(wsId);
      if (ws) return ws;
    }
    // No worksheet — create one
    return createNewWorksheet();
  }

  function createNewWorksheet(): Worksheet {
    // Generate unique name — also checks IndexedDB-loaded worksheets since
    // they are already in the in-memory map
    let num = 1;
    const existingNames = new Set(Array.from(worksheets.values()).map(w => w.name));
    while (existingNames.has(`new_${String(num).padStart(2, '0')}`)) num++;
    const name = `new_${String(num).padStart(2, '0')}`;

    const ws: Worksheet = {
      id: generateId(),
      name,
      items: [],
      modified: true,
    };
    worksheets.set(ws.id, ws);
    tree.addWorksheet(ws);
    tree.markModified(ws.id);
    setStatus(`Created worksheet "${name}".`);
    return ws;
  }

  async function saveCurrentWorksheet(): Promise<void> {
    // If a series is selected, save its parent worksheet
    const wsId = tree.getCurrentWsId();
    if (!wsId) { setStatus('No worksheet selected.'); return; }
    const ws = worksheets.get(wsId);
    if (!ws) return;
    ws.modified = false;
    try {
      await saveWorksheet(ws);
      tree.clearModified(wsId);
      setStatus(`Saved "${ws.name}".`);
    } catch (err) {
      console.error('Save failed:', err);
      setStatus('Error saving worksheet.');
      ws.modified = true;
      tree.markModified(wsId);
    }
  }

  async function saveAllWorksheets(): Promise<void> {
    let count = 0;
    for (const [wsId, ws] of worksheets) {
      if (!ws.modified) continue;
      ws.modified = false;
      try {
        await saveWorksheet(ws);
        tree.clearModified(wsId);
        count++;
      } catch (err) {
        console.error('Save failed:', err);
        ws.modified = true;
        tree.markModified(wsId);
      }
    }
    setStatus(count > 0 ? `Saved ${count} worksheet(s).` : 'No modified worksheets to save.');
  }

  function formatDate(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Check if any worksheet has unsaved changes. */
  function hasModifiedWorksheets(): boolean {
    for (const ws of worksheets.values()) {
      if (ws.modified) return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // F1: Exit handler with confirmation
  // -----------------------------------------------------------------------

  function handleExit(): void {
    if (!hasModifiedWorksheets()) {
      if (confirm('Are you sure you want to exit?')) {
        window.close();
      }
      return;
    }

    // Build confirmation dialog with three options
    const backdrop = document.createElement('div');
    backdrop.className = 'as-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'as-modal';
    modal.style.maxWidth = '420px';
    modal.style.padding = '20px';
    modal.style.textAlign = 'center';

    const msg = document.createElement('p');
    msg.textContent = 'Some worksheets have unsaved changes.';
    modal.appendChild(msg);

    const btnBar = document.createElement('div');
    btnBar.style.display = 'flex';
    btnBar.style.gap = '8px';
    btnBar.style.justifyContent = 'center';
    btnBar.style.marginTop = '16px';

    const btnSaveClose = document.createElement('button');
    btnSaveClose.className = 'as-btn';
    btnSaveClose.textContent = 'Save all and close';
    btnSaveClose.addEventListener('click', () => {
      backdrop.remove();
      void saveAllWorksheets().then(() => window.close());
    });

    const btnClose = document.createElement('button');
    btnClose.className = 'as-btn';
    btnClose.textContent = 'Close without saving';
    btnClose.addEventListener('click', () => {
      backdrop.remove();
      window.close();
    });

    const btnCancel = document.createElement('button');
    btnCancel.className = 'as-btn';
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => backdrop.remove());

    btnBar.appendChild(btnSaveClose);
    btnBar.appendChild(btnClose);
    btnBar.appendChild(btnCancel);
    modal.appendChild(btnBar);
    backdrop.appendChild(modal);

    // Escape to cancel
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') backdrop.remove();
    });
    document.body.appendChild(backdrop);
    btnCancel.focus();
  }

  // -----------------------------------------------------------------------
  // F4: Open Worksheet from JSON file
  // -----------------------------------------------------------------------

  async function handleOpenWorksheet(): Promise<void> {
    setStatus('Opening worksheet...');
    const existingIds = new Set(worksheets.keys());

    // Accept both .json and .xlsx files
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.analyseries.json,.xlsx';

    const result = await new Promise<Worksheet | null>((resolve) => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }

        try {
          let ws: Worksheet;
          if (file.name.endsWith('.xlsx')) {
            ws = await importExcelWorksheet(file);
          } else {
            // JSON import
            const text = await file.text();
            ws = deserializeWorksheet(text);
          }
          if (existingIds.has(ws.id)) {
            (ws as { id: string }).id = generateId();
          }
          ws.modified = true;
          resolve(ws);
        } catch (err) {
          console.error('Failed to open worksheet:', err);
          resolve(null);
        }
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });

    if (!result) {
      setStatus('Open cancelled or failed.');
      return;
    }
    worksheets.set(result.id, result);
    tree.addWorksheet(result);
    tree.markModified(result.id);
    setStatus(`Opened worksheet "${result.name}".`);
  }

  // -----------------------------------------------------------------------
  // F4: Export Worksheet to JSON file
  // -----------------------------------------------------------------------

  function handleExportWorksheet(): void {
    const wsId = tree.getCurrentWsId();
    if (!wsId) { setStatus('No worksheet selected.'); return; }
    const ws = worksheets.get(wsId);
    if (!ws) return;
    downloadWorksheet(ws);
    setStatus(`Exported "${ws.name}".`);
  }

  function handleExportExcel(): void {
    const wsId = tree.getCurrentWsId();
    if (!wsId) { setStatus('No worksheet selected.'); return; }
    const ws = worksheets.get(wsId);
    if (!ws) return;
    const blob = exportExcelWorksheet(ws);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ws.name}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Exported "${ws.name}" as Excel.`);
  }

  // -----------------------------------------------------------------------
  // Menu definitions
  // -----------------------------------------------------------------------

  const sep: MenuAction = { label: '', action: () => {}, separator: true };

  menuBar.addMenu('File', [
    { label: 'New Worksheet', shortcut: 'Ctrl+N', action: () => createNewWorksheet() },
    { label: 'Open Worksheet...', shortcut: 'Ctrl+O', action: () => { void handleOpenWorksheet(); } },
    { label: 'Save Worksheet', shortcut: 'Ctrl+S', action: () => { void saveCurrentWorksheet(); } },
    { label: 'Save All Worksheets', shortcut: 'Ctrl+Shift+S', action: () => { void saveAllWorksheets(); } },
    sep,
    { label: 'Export Worksheet (JSON)...', action: () => handleExportWorksheet() },
    { label: 'Export Worksheet (Excel)...', action: () => handleExportExcel() },
    sep,
    { label: 'Exit', shortcut: 'Q', action: () => handleExit() },
  ]);

  menuBar.addMenu('Edit', [
    {
      label: 'Cut', shortcut: 'Ctrl+X',
      action: () => handleCut(),
      enabled: () => tree.getSelectedItems().length > 0,
    },
    {
      label: 'Copy', shortcut: 'Ctrl+C',
      action: () => handleCopy(),
      enabled: () => tree.getSelectedItems().length > 0,
    },
    {
      label: 'Paste', shortcut: 'Ctrl+V',
      action: () => handlePaste(),
      enabled: () => clipboard.getItems().length > 0,
    },
  ]);

  menuBar.addMenu('Create', [
    { label: 'Import Data...', shortcut: 'Ctrl+M', action: () => openImportDialog() },
    sep,
    { label: 'Random Series', action: () => openGeneratorWindow('random') },
    { label: 'Sinusoidal Series', action: () => openGeneratorWindow('sinusoidal') },
    { label: 'Noise Series', action: () => openGeneratorWindow('noise') },
    { label: 'Insolation / Astronomical Series', action: () => openGeneratorWindow('insolation') },
    sep,
    { label: 'Ice Volume Model...', action: () => handleDefineIceVolume() },
  ]);

  menuBar.addMenu('Display', [
    { label: 'Display Single', shortcut: 'Ctrl+D', action: () => handleDisplaySingle() },
    { label: 'Display Together', shortcut: 'Ctrl+T', action: () => handleDisplayTogether() },
    { label: 'Display Stacked', shortcut: 'Ctrl+K', action: () => handleDisplayStacked() },
    sep,
    { label: 'Close All Windows', action: () => windowManager.closeAll() },
  ]);

  menuBar.addMenu('Process', [
    { label: 'Define Filter', shortcut: 'Ctrl+F', action: () => handleDefineFilter() },
    { label: 'Apply Filter', action: () => handleApplyFilter() },
    sep,
    { label: 'Frequency Filter...', action: () => handleDefineFreqFilter() },
    sep,
    { label: 'Define Sampling', shortcut: 'Ctrl+A', action: () => handleDefineSampling() },
    { label: 'Apply Sampling', action: () => handleApplySampling() },
    sep,
    { label: 'Define Interpolation', shortcut: 'Ctrl+I', action: () => handleDefineInterpolation() },
    { label: 'Apply Interpolation (Linear)', action: () => handleApplyInterpolation('Linear') },
    { label: 'Apply Interpolation (PCHIP)', action: () => handleApplyInterpolation('PCHIP') },
    sep,
    { label: 'Define Correlation', shortcut: 'Ctrl+R', action: () => handleDefineCorrelation() },
    sep,
    { label: 'Fitting...', action: () => handleDefineFitting() },
    { label: 'Simple Function...', action: () => handleDefineSimpleFunction() },
    { label: 'Histogram...', action: () => handleDefineHistogram() },
    sep,
    { label: 'Spectral Analysis...', action: () => handleDefineSpectral() },
    { label: 'SSA...', action: () => handleDefineSSA() },
    { label: 'PCA...', action: () => handleDefinePCA() },
  ]);

  menuBar.addMenu('Help', [
    { label: 'About', action: () => showAboutDialog() },
  ]);

  // -----------------------------------------------------------------------
  // Clipboard handlers
  // -----------------------------------------------------------------------

  function handleCopy(): void {
    const selected = tree.getSelectedItems();
    if (selected.length === 0) { setStatus('Nothing selected.'); return; }
    clipboard.copy(selected);
    setStatus(`Copied ${selected.length} item(s).`);
  }

  function handleCut(): void {
    const selected = tree.getSelectedItems();
    if (selected.length === 0) { setStatus('Nothing selected.'); return; }
    clipboard.cut(selected);

    // Remove from source worksheets
    for (const { wsId, item } of selected) {
      // Close any windows displaying this item before removing
      windowManager.closeWindowsForItem(item.id);
      tree.removeItem(wsId, item.id);
      const ws = worksheets.get(wsId);
      if (ws) {
        ws.modified = true;
        tree.markModified(wsId);
      }
    }
    setStatus(`Cut ${selected.length} item(s).`);
  }

  function handlePaste(): void {
    const entries = clipboard.getItems();
    if (entries.length === 0) { setStatus('Clipboard is empty.'); return; }

    const targetWs = getOrCreateCurrentWs();
    let added = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (clipboard.isItemInWorksheet(targetWs, entry.item.id)) {
        skipped++;
        continue;
      }
      // tree.addItem also pushes to ws.items
      tree.addItem(targetWs.id, entry.item);
      added++;
    }

    if (added > 0) {
      targetWs.modified = true;
      tree.markModified(targetWs.id);
    }

    if (skipped > 0) {
      setStatus(`Pasted ${added} item(s). ${skipped} already present — skipped.`);
    } else {
      setStatus(`Pasted ${added} item(s).`);
    }

    // If it was a cut, clear clipboard
    if (clipboard.isCut()) {
      clipboard.clear();
    }
  }

  // -----------------------------------------------------------------------
  // Import dialog
  // -----------------------------------------------------------------------

  function openImportDialog(): void {
    showImportDialog({
      onImportSeries: (items) => {
        const ws = getOrCreateCurrentWs();
        for (const item of items) {
          tree.addItem(ws.id, item);
        }
        ws.modified = true;
        tree.markModified(ws.id);
        setStatus(`${items.length} series imported into "${ws.name}".`);
      },
      onImportPointers: (item) => {
        const ws = getOrCreateCurrentWs();
        tree.addItem(ws.id, item);
        ws.modified = true;
        tree.markModified(ws.id);
        setStatus(`Pointers imported into "${ws.name}".`);
      },
    });
  }

  // -----------------------------------------------------------------------
  // Display handlers
  // -----------------------------------------------------------------------

  function handleDisplaySingle(): void {
    const series = validateDisplaySelection(tree, setStatus);
    if (!series) return;
    for (const item of series) {
      if (windowManager.get(item.id)) {
        windowManager.focus(item.id);
      } else {
        windowManager.open(createDisplaySingleWindow(item));
      }
    }
  }

  function handleDisplayTogether(): void {
    const series = validateDisplaySelection(tree, setStatus);
    if (!series) return;

    // Fall back to Display Single if exactly 1 selected (match Python behavior)
    if (series.length === 1) {
      if (windowManager.get(series[0].id)) {
        windowManager.focus(series[0].id);
      } else {
        windowManager.open(createDisplaySingleWindow(series[0]));
      }
      return;
    }

    // Maximum 8 series
    if (series.length > 8) {
      setStatus('Display Together supports at most 8 series.');
      return;
    }

    const id = series.map(s => s.id).sort().join('+');
    if (windowManager.get(id)) { windowManager.focus(id); return; }
    windowManager.open(createDisplayTogetherWindow(series));
  }

  function handleDisplayStacked(): void {
    const series = validateDisplaySelection(tree, setStatus);
    if (!series) return;

    // Fall back to Display Single if exactly 1 selected
    if (series.length === 1) {
      if (windowManager.get(series[0].id)) {
        windowManager.focus(series[0].id);
      } else {
        windowManager.open(createDisplaySingleWindow(series[0]));
      }
      return;
    }

    // Maximum 8 series
    if (series.length > 8) {
      setStatus('Display Stacked supports at most 8 series.');
      return;
    }

    const id = series.map(s => s.id).sort().join('+');
    if (windowManager.get(id)) { windowManager.focus(id); return; }
    windowManager.open(createDisplayStackedWindow(series));
  }

  // -----------------------------------------------------------------------
  // Process handlers
  // -----------------------------------------------------------------------

  function handleDefineFilter(): void {
    const result = validateFilterSelection(tree, setStatus);
    if (!result) return;
    const { wsId, item } = result;

    const winId = 'filter-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const win = createDefineFilterWindow(item, {
      onSaveFilter: (filter) => {
        const ws = worksheets.get(wsId);
        if (!ws) return;
        tree.addItem(wsId, filter);
        ws.modified = true;
        tree.markModified(wsId);
        setStatus(`Filter saved: ${filter.name}`);
      },
      onSaveFilterAndSeries: (filter, series) => {
        const ws = worksheets.get(wsId);
        if (!ws) return;
        // Add filter after source item
        const srcIdx = ws.items.findIndex(i => i.id === item.id);
        tree.addItem(wsId, filter, srcIdx >= 0 ? srcIdx + 1 : undefined);
        tree.addItem(wsId, series, srcIdx >= 0 ? srcIdx + 2 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        setStatus(`Filter and filtered series saved.`);
      },
    });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  function handleApplyFilter(): void {
    const result = validateApplyFilter(tree, setStatus);
    if (!result) return;
    const { filter, series } = result;

    if (!confirm(`Apply filter (window=${filter.windowSize}) to ${series.length} series?`)) return;

    let count = 0;
    for (const { wsId, item: srcItem } of series) {
      try {
        const filtered = movingAverage(srcItem.index, srcItem.values, filter.windowSize);
        const newId = generateId();
        const newItem: SeriesItem = {
          id: newId,
          type: 'Series filtered',
          name: `${srcItem.name} filtered(${filter.windowSize})`,
          date: formatDate(),
          comment: '',
          history: appendHistory(
            srcItem.history,
            `Series <i><b>${srcItem.id}</b></i> filtered with FILTER <i><b>${filter.id}</b></i> with a moving average of size ${filter.windowSize}<BR>---> series <i><b>${newId}</b></i>`,
          ),
          xLabel: srcItem.xLabel,
          yLabel: srcItem.yLabel,
          color: generateColor(srcItem.color),
          index: filtered.index,
          values: filtered.values,
        };
        const ws = worksheets.get(wsId);
        if (!ws) continue;
        const srcIdx = ws.items.findIndex(i => i.id === srcItem.id);
        tree.addItem(wsId, newItem, srcIdx >= 0 ? srcIdx + 1 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        count++;
      } catch (err) {
        setStatus(`Filter failed for ${srcItem.name}: ${(err as Error).message}`);
      }
    }
    if (count > 0) setStatus(`Applied filter to ${count} series.`);
  }

  function handleDefineSampling(): void {
    const result = validateSampleSelection(tree, setStatus);
    if (!result) return;
    const { wsId, items: seriesItems } = result;

    const winId = 'sample-' + seriesItems[0].id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const win = createDefineSampleWindow(seriesItems, {
      onSaveSample: (sample) => {
        const ws = worksheets.get(wsId);
        if (!ws) return;
        tree.addItem(wsId, sample);
        ws.modified = true;
        tree.markModified(wsId);
        setStatus(`Sample saved: ${sample.name}`);
      },
      onSaveSampleAndSeries: (sample, series) => {
        const ws = worksheets.get(wsId);
        if (!ws) return;
        const srcIdx = ws.items.findIndex(i => i.id === seriesItems[0].id);
        tree.addItem(wsId, sample, srcIdx >= 0 ? srcIdx + 1 : undefined);
        tree.addItem(wsId, series, srcIdx >= 0 ? srcIdx + 2 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        setStatus(`Sample and sampled series saved.`);
      },
    });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  function handleApplySampling(): void {
    const result = validateApplySample(tree, setStatus);
    if (!result) return;
    const { sample, series } = result;

    if (!confirm(`Apply sampling (${sample.kind}${sample.integrated ? ', integrated' : ''}) to ${series.length} series?`)) return;

    let count = 0;
    for (const { wsId, item: srcItem } of series) {
      try {
        // Compute sample points
        let samplePoints: number[];
        if (sample.step !== null) {
          samplePoints = [];
          const min = srcItem.index[0];
          const max = srcItem.index[srcItem.index.length - 1];
          const start = Math.ceil(min / sample.step) * sample.step;
          for (let x = start; x <= max; x += sample.step) samplePoints.push(x);
        } else if (sample.xCoords) {
          samplePoints = sample.xCoords;
        } else {
          continue;
        }

        const sampled = resample(srcItem.index, srcItem.values, samplePoints, sample.kind, sample.integrated);
        const newId = generateId();
        const newItem: SeriesItem = {
          id: newId,
          type: 'Series sampled',
          name: `${srcItem.name} sampled`,
          date: formatDate(),
          comment: '',
          history: appendHistory(
            srcItem.history,
            `Series <i><b>${srcItem.id}</b></i> sampled with SAMPLE <i><b>${sample.id}</b></i> with method ${sample.kind}${sample.integrated ? ' (integrated)' : ''}<BR>---> series <i><b>${newId}</b></i>`,
          ),
          xLabel: srcItem.xLabel,
          yLabel: srcItem.yLabel,
          color: generateColor(srcItem.color),
          index: sampled.index,
          values: sampled.values,
        };
        const ws = worksheets.get(wsId);
        if (!ws) continue;
        const srcIdx = ws.items.findIndex(i => i.id === srcItem.id);
        tree.addItem(wsId, newItem, srcIdx >= 0 ? srcIdx + 1 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        count++;
      } catch (err) {
        setStatus(`Sampling failed for ${srcItem.name}: ${(err as Error).message}`);
      }
    }
    if (count > 0) setStatus(`Applied sampling to ${count} series.`);
  }

  // -----------------------------------------------------------------------
  // Interpolation handlers
  // -----------------------------------------------------------------------

  function handleDefineInterpolation(): void {
    const result = validateInterpolationSelection(tree, setStatus);
    if (!result) return;
    const { wsId, items: seriesItems, existingInterp } = result;

    const winId = 'interpolation-' + seriesItems[0].id + '-' + seriesItems[1].id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const win = createDefineInterpolationWindow(
      seriesItems,
      {
        onSaveInterpolation: (interp) => {
          const ws = worksheets.get(wsId);
          if (!ws) return;
          tree.addItem(wsId, interp);
          ws.modified = true;
          tree.markModified(wsId);
          setStatus(`Interpolation saved: ${interp.name}`);
        },
        onSaveInterpolationAndSeries: (interp, series) => {
          const ws = worksheets.get(wsId);
          if (!ws) return;
          const srcIdx = ws.items.findIndex(i => i.id === seriesItems[1].id);
          tree.addItem(wsId, interp, srcIdx >= 0 ? srcIdx + 1 : undefined);
          tree.addItem(wsId, series, srcIdx >= 0 ? srcIdx + 2 : undefined);
          ws.modified = true;
          tree.markModified(wsId);
          setStatus(`Interpolation and interpolated series saved.`);
        },
      },
      existingInterp ?? undefined,
    );
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  function handleApplyInterpolation(mode: 'Linear' | 'PCHIP'): void {
    const result = validateApplyInterpolation(tree, setStatus);
    if (!result) return;
    const { interp, series } = result;

    if (!confirm(`Apply interpolation (${mode}) to ${series.length} series?`)) return;

    let count = 0;
    for (const { wsId, item: srcItem } of series) {
      try {
        const newItem = applyInterpolation(interp, srcItem, mode);
        const ws = worksheets.get(wsId);
        if (!ws) continue;
        const srcIdx = ws.items.findIndex(i => i.id === srcItem.id);
        tree.addItem(wsId, newItem, srcIdx >= 0 ? srcIdx + 1 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        count++;
      } catch (err) {
        setStatus(`Interpolation failed for ${srcItem.name}: ${(err as Error).message}`);
      }
    }
    if (count > 0) setStatus(`Applied interpolation (${mode}) to ${count} series.`);
  }

  // -----------------------------------------------------------------------
  // Correlation handler
  // -----------------------------------------------------------------------

  function handleDefineCorrelation(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length < 1 || seriesItems.length > 2) {
      setStatus('Select 1 series (auto-correlation) or 2 series (cross-correlation).');
      return;
    }

    const items = seriesItems.map(s => s.item as SeriesItem);
    const winId = items.length === 1
      ? 'correlation-' + items[0].id
      : 'correlation-' + items[0].id + '-' + items[1].id;

    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (item: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, item);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${item.name}" into "${ws.name}".`);
    };

    const win = createDefineCorrelationWindow(items, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Spectral analysis handler
  // -----------------------------------------------------------------------

  function handleDefineSpectral(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 series for spectral analysis.');
      return;
    }

    const item = seriesItems[0].item as SeriesItem;
    const winId = 'spectral-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };

    const win = createDefineSpectralWindow([item], { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Histogram handler
  // -----------------------------------------------------------------------

  function handleDefineHistogram(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 series for histogram.');
      return;
    }
    const item = seriesItems[0].item as SeriesItem;
    const winId = 'histogram-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };
    const win = createDefineHistogramWindow(item, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => { windowManager.close(winId); };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Simple Function handler
  // -----------------------------------------------------------------------

  function handleDefineSimpleFunction(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length < 1 || seriesItems.length > 2) {
      setStatus('Select 1 or 2 series for Simple Function.');
      return;
    }
    const items = seriesItems.map(s => s.item as SeriesItem);
    const winId = 'simplefn-' + items.map(i => i.id).join('-');
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };
    const win = createDefineSimpleFunctionWindow(items, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => { windowManager.close(winId); };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // SSA handler
  // -----------------------------------------------------------------------

  function handleDefineSSA(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 series for SSA.');
      return;
    }
    const item = seriesItems[0].item as SeriesItem;
    const winId = 'ssa-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };
    const win = createDefineSSAWindow(item, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => { windowManager.close(winId); };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // PCA handler
  // -----------------------------------------------------------------------

  function handleDefinePCA(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length < 2) {
      setStatus('Select at least 2 series for PCA.');
      return;
    }
    const items = seriesItems.map(s => s.item as SeriesItem);
    const winId = 'pca-' + items.map(i => i.id).sort().join('+');
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };
    const win = createDefinePCAWindow(items, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => { windowManager.close(winId); };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Fitting handler
  // -----------------------------------------------------------------------

  function handleDefineFitting(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 series for fitting.');
      return;
    }

    const item = seriesItems[0].item as SeriesItem;
    const winId = 'fitting-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };

    const win = createDefineFittingWindow(item, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Ice volume handler
  // -----------------------------------------------------------------------

  function handleDefineIceVolume(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 insolation series for ice volume model.');
      return;
    }

    const item = seriesItems[0].item as SeriesItem;
    const winId = 'icevol-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const onImport = (newItem: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, newItem);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${newItem.name}" into "${ws.name}".`);
    };

    const win = createDefineIceVolumeWindow(item, { onImport });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Frequency filter handler
  // -----------------------------------------------------------------------

  function handleDefineFreqFilter(): void {
    const selected = tree.getSelectedItems();
    const seriesItems = selected.filter(
      s => s.item.type === 'Series' || s.item.type === 'Series filtered'
        || s.item.type === 'Series sampled' || s.item.type === 'Series interpolated',
    );
    if (seriesItems.length !== 1) {
      setStatus('Select exactly 1 series for frequency filtering.');
      return;
    }

    const item = seriesItems[0].item as SeriesItem;
    const wsId = seriesItems[0].wsId;
    const winId = 'freqfilter-' + item.id;
    if (windowManager.get(winId)) { windowManager.focus(winId); return; }

    const win = createDefineFreqFilterWindow(item, {
      onSaveFiltered: (newItem: SeriesItem) => {
        const ws = worksheets.get(wsId);
        if (!ws) return;
        const srcIdx = ws.items.findIndex(i => i.id === item.id);
        tree.addItem(wsId, newItem, srcIdx >= 0 ? srcIdx + 1 : undefined);
        ws.modified = true;
        tree.markModified(wsId);
        setStatus(`Filtered series saved: ${newItem.name}`);
      },
    });
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(winId);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Generator windows
  // -----------------------------------------------------------------------

  function openGeneratorWindow(type: 'random' | 'sinusoidal' | 'insolation' | 'noise'): void {
    if (windowManager.get(type)) { windowManager.focus(type); return; }

    const onImport = (item: SeriesItem) => {
      const ws = getOrCreateCurrentWs();
      tree.addItem(ws.id, item);
      ws.modified = true;
      tree.markModified(ws.id);
      setStatus(`Imported "${item.name}" into "${ws.name}".`);
    };

    let win: ManagedWindow;
    switch (type) {
      case 'random':
        win = createDefineRandomWindow({ onImport });
        break;
      case 'sinusoidal':
        win = createDefineSinusoidalWindow({ onImport });
        break;
      case 'insolation':
        win = createDefineInsolationWindow({ onImport });
        break;
      case 'noise':
        win = createDefineNoiseWindow({ onImport });
        break;
    }
    (win as ManagedWindow & { _closeCallback: (() => void) | null })._closeCallback = () => {
      windowManager.close(type);
    };
    windowManager.open(win);
  }

  // -----------------------------------------------------------------------
  // Tree event wiring (F2: item sync)
  // -----------------------------------------------------------------------

  tree.on('itemChanged', (wsId: unknown, item: unknown) => {
    const id = wsId as string;
    const ws = worksheets.get(id);
    if (ws) {
      ws.modified = true;
      tree.markModified(id);
    }

    const changedItem = item as WorksheetItem;

    // F2: Cross-worksheet sync — refresh display for the same item in other
    // worksheets (they share the same item reference via copy+paste)
    for (const [otherWsId, otherWs] of worksheets) {
      if (otherWsId === id) continue;
      for (const otherItem of otherWs.items) {
        if (otherItem.id === changedItem.id) {
          tree.refreshItem(otherWsId, otherItem.id);
        }
      }
    }

    windowManager.notifyItemChanged(changedItem);
  });

  tree.on('worksheetChanged', (wsId: unknown, newName: unknown) => {
    const id = wsId as string;
    const ws = worksheets.get(id);
    if (ws) {
      ws.name = newName as string;
      ws.modified = true;
      tree.markModified(id);
    }
  });

  tree.on('itemDoubleClick', (_wsId: unknown, item: unknown) => {
    const it = item as WorksheetItem;
    if (it.type === 'FILTER' || it.type === 'SAMPLE' || it.type === 'INTERPOLATION') {
      const winId = 'info-' + it.id;
      if (windowManager.get(winId)) { windowManager.focus(winId); return; }
      windowManager.open(createDisplayInfoWindow(it));
    } else {
      const s = it as SeriesItem;
      if (windowManager.get(s.id)) { windowManager.focus(s.id); return; }
      windowManager.open(createDisplaySingleWindow(s));
    }
  });

  tree.on('itemRemoved', (wsId: unknown, itemId: unknown) => {
    const id = wsId as string;
    const ws = worksheets.get(id);
    if (ws) {
      ws.modified = true;
      tree.markModified(id);
    }
    // F8: Close any windows displaying the deleted item
    if (typeof itemId === 'string') {
      windowManager.closeWindowsForItem(itemId);
    }
    setStatus('Item deleted.');
  });

  tree.on('selectionChange', () => {
    // Plumbing for future batches
  });

  // Handle worksheet removal from context menu
  const originalRemoveWorksheet = tree.removeWorksheet.bind(tree);
  tree.removeWorksheet = (wsId: string) => {
    // Close all windows for items in this worksheet before removing
    const ws = worksheets.get(wsId);
    if (ws) {
      for (const item of ws.items) {
        windowManager.closeWindowsForItem(item.id);
      }
    }
    worksheets.delete(wsId);
    originalRemoveWorksheet(wsId);
    void deleteWorksheet(wsId).catch(console.error);
    setStatus('Worksheet removed.');
  };

  // — Ready —
  setStatus('AnalySeries ready.');
}

main().catch(console.error);
