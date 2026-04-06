/**
 * Tree widget — collapsible sidebar tree showing worksheets (parents)
 * and their items (children) with selection, inline editing, drag-reorder,
 * context menu, and tooltips.
 */

import type { Worksheet, WorksheetItem, SeriesItem } from '../types';

// ---------------------------------------------------------------------------
// SVG icons (16x16 viewBox)
// ---------------------------------------------------------------------------

const ICON_WORKSHEET = `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M1 2h5l2 2h7v10H1z" fill="#e8a838" stroke="#b07818" stroke-width="0.5"/></svg>`;

const ICON_SERIES = `<svg viewBox="0 0 16 16" width="16" height="16"><polyline points="1,14 4,8 7,11 10,4 14,2" fill="none" stroke="#1f77b4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_SERIES_DUPLICATED = `<svg viewBox="0 0 16 16" width="16" height="16"><polyline points="1,14 4,8 7,11 10,4 14,2" fill="none" stroke="#1f77b4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="1,15 4,9 7,12 10,5 14,3" fill="none" stroke="#aec7e8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_FILTER = `<svg viewBox="0 0 16 16" width="16" height="16"><polygon points="1,1 15,1 10,7 10,14 6,14 6,7" fill="#9467bd" stroke="#7b4f9e" stroke-width="0.5"/></svg>`;

const ICON_SAMPLE = `<svg viewBox="0 0 16 16" width="16" height="16"><line x1="2" y1="14" x2="14" y2="14" stroke="#2ca02c" stroke-width="1"/><line x1="2" y1="2" x2="2" y2="14" stroke="#2ca02c" stroke-width="1"/><circle cx="4" cy="10" r="1.5" fill="#2ca02c"/><circle cx="7" cy="6" r="1.5" fill="#2ca02c"/><circle cx="10" cy="8" r="1.5" fill="#2ca02c"/><circle cx="13" cy="4" r="1.5" fill="#2ca02c"/></svg>`;

const ICON_INTERPOLATION = `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2,12 C5,12 5,4 8,4 C11,4 11,12 14,12" fill="none" stroke="#d62728" stroke-width="1.5" stroke-linecap="round"/><circle cx="2" cy="12" r="1.5" fill="#d62728"/><circle cx="14" cy="12" r="1.5" fill="#d62728"/></svg>`;

const CHEVRON_DOWN = `<svg viewBox="0 0 16 16" width="12" height="12"><polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHEVRON_RIGHT = `<svg viewBox="0 0 16 16" width="12" height="12"><polyline points="6,4 10,8 6,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TreeEvent = 'selectionChange' | 'itemDoubleClick' | 'itemChanged' | 'worksheetChanged' | 'itemRemoved';
type TreeCallback = (...args: unknown[]) => void;

interface WsEntry {
  ws: Worksheet;
  el: HTMLElement;
  headerEl: HTMLElement;
  itemsEl: HTMLElement;
  nameEl: HTMLElement;
  toggleEl: HTMLElement;
  itemEls: Map<string, HTMLElement>;
  expanded: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSeries(item: WorksheetItem): item is SeriesItem {
  return item.type === 'Series' || item.type === 'Series filtered'
    || item.type === 'Series sampled' || item.type === 'Series interpolated';
}

function hasDuplicateIndex(item: SeriesItem): boolean {
  const idx = item.index;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] === idx[i - 1]) return true;
  }
  return false;
}

function iconForItem(item: WorksheetItem): string {
  if (isSeries(item)) {
    return hasDuplicateIndex(item) ? ICON_SERIES_DUPLICATED : ICON_SERIES;
  }
  switch (item.type) {
    case 'FILTER': return ICON_FILTER;
    case 'SAMPLE': return ICON_SAMPLE;
    case 'INTERPOLATION': return ICON_INTERPOLATION;
  }
}

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// TreeWidget
// ---------------------------------------------------------------------------

export class TreeWidget {
  private container: HTMLElement;
  private treeEl: HTMLElement;
  private entries = new Map<string, WsEntry>();
  private selected = new Set<string>(); // "wsId:itemId"
  private listeners = new Map<TreeEvent, TreeCallback[]>();
  private suppressEvents = false;
  private lastClickedKey: string | null = null;
  private contextMenuEl: HTMLElement;
  private tooltipEl: HTMLElement;
  private colorInput: HTMLInputElement;

  // Drag state
  private dragSourceWsId: string | null = null;
  private dragSourceItemId: string | null = null;

  // Color picker state — stored to remove stale listener on re-open
  private colorHandler: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.treeEl = document.createElement('div');
    this.treeEl.className = 'as-tree';
    this.container.appendChild(this.treeEl);

    // Shared context menu
    this.contextMenuEl = document.createElement('div');
    this.contextMenuEl.className = 'as-context-menu';
    this.contextMenuEl.style.display = 'none';
    document.body.appendChild(this.contextMenuEl);

    // Shared tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'as-tooltip';
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);

    // Shared hidden color input
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.style.position = 'absolute';
    this.colorInput.style.visibility = 'hidden';
    this.colorInput.style.width = '0';
    this.colorInput.style.height = '0';
    document.body.appendChild(this.colorInput);

    // Dismiss context menu on outside click
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideContextMenu();
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  addWorksheet(ws: Worksheet): void {
    const el = document.createElement('div');
    el.className = 'as-tree-ws';
    el.dataset.wsId = ws.id;

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'as-tree-ws-header';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'as-tree-item-icon';
    iconSpan.innerHTML = ICON_WORKSHEET;
    headerEl.appendChild(iconSpan);

    const nameEl = document.createElement('span');
    nameEl.className = 'as-tree-ws-name';
    nameEl.textContent = ws.name + (ws.modified ? ' *' : '');
    headerEl.appendChild(nameEl);

    const toggleEl = document.createElement('span');
    toggleEl.className = 'as-tree-ws-toggle';
    toggleEl.innerHTML = CHEVRON_DOWN;
    headerEl.appendChild(toggleEl);

    el.appendChild(headerEl);

    // Items container
    const itemsEl = document.createElement('div');
    itemsEl.className = 'as-tree-ws-items';
    el.appendChild(itemsEl);

    const entry: WsEntry = {
      ws, el, headerEl, itemsEl, nameEl, toggleEl,
      itemEls: new Map(),
      expanded: true,
    };
    this.entries.set(ws.id, entry);
    this.treeEl.appendChild(el);

    // Toggle expand/collapse on single click
    headerEl.addEventListener('click', () => {
      entry.expanded = !entry.expanded;
      itemsEl.style.display = entry.expanded ? '' : 'none';
      toggleEl.innerHTML = entry.expanded ? CHEVRON_DOWN : CHEVRON_RIGHT;
    });

    // Rename on double-click
    headerEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.startEditWorksheetName(ws.id);
    });

    // Context menu on right-click
    headerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(ws.id, e.clientX, e.clientY);
    });

    // Add existing items
    this.suppressEvents = true;
    for (const item of ws.items) {
      this.buildItemRow(ws.id, item, entry);
    }
    this.suppressEvents = false;
  }

  removeWorksheet(wsId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    // Deselect all items in this worksheet
    for (const itemId of entry.itemEls.keys()) {
      this.selected.delete(`${wsId}:${itemId}`);
    }

    entry.el.remove();
    this.entries.delete(wsId);
    this.emit('selectionChange');
  }

  addItem(wsId: string, item: WorksheetItem, position?: number): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    // Add to data model if not already present
    if (!entry.ws.items.some(i => i.id === item.id)) {
      if (position !== undefined && position >= 0 && position <= entry.ws.items.length) {
        entry.ws.items.splice(position, 0, item);
      } else {
        entry.ws.items.push(item);
      }
    }

    this.buildItemRow(wsId, item, entry, position);
    this.emit('itemChanged', wsId, item);
  }

  removeItem(wsId: string, itemId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    const rowEl = entry.itemEls.get(itemId);
    if (rowEl) rowEl.remove();
    entry.itemEls.delete(itemId);

    entry.ws.items = entry.ws.items.filter(i => i.id !== itemId);
    this.selected.delete(`${wsId}:${itemId}`);
    this.emit('selectionChange');
  }

  getSelectedItems(): { wsId: string; item: WorksheetItem }[] {
    const result: { wsId: string; item: WorksheetItem }[] = [];
    for (const key of this.selected) {
      const [wsId, itemId] = key.split(':');
      const entry = this.entries.get(wsId);
      if (!entry) continue;
      const item = entry.ws.items.find(i => i.id === itemId);
      if (item) result.push({ wsId, item });
    }
    return result;
  }

  getUniqueSelectedItems(): { wsId: string; item: WorksheetItem }[] {
    const seen = new Set<string>();
    const result: { wsId: string; item: WorksheetItem }[] = [];
    for (const entry of this.getSelectedItems()) {
      if (!seen.has(entry.item.id)) {
        seen.add(entry.item.id);
        result.push(entry);
      }
    }
    return result;
  }

  on(event: TreeEvent, callback: TreeCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  markModified(wsId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;
    entry.ws.modified = true;
    this.updateWsNameDisplay(entry);
  }

  clearModified(wsId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;
    entry.ws.modified = false;
    this.updateWsNameDisplay(entry);
  }

  /** Get the worksheet ID that contains the first selected item, or the first worksheet. */
  getCurrentWsId(): string | null {
    const sel = this.getSelectedItems();
    if (sel.length > 0) return sel[0].wsId;
    const first = this.entries.keys().next();
    return first.done ? null : first.value;
  }

  /** Get all worksheet entries. */
  getWorksheetIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Get the Worksheet object by ID. */
  getWorksheet(wsId: string): Worksheet | undefined {
    return this.entries.get(wsId)?.ws;
  }

  /** Refresh an item row's display (after external data change). */
  refreshItem(wsId: string, itemId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;
    const item = entry.ws.items.find(i => i.id === itemId);
    if (!item) return;
    const rowEl = entry.itemEls.get(itemId);
    if (!rowEl) return;
    this.updateItemRowContent(rowEl, item);
  }

  // -------------------------------------------------------------------------
  // Private — DOM building
  // -------------------------------------------------------------------------

  private buildItemRow(wsId: string, item: WorksheetItem, entry: WsEntry, position?: number): void {
    const row = document.createElement('div');
    row.className = 'as-tree-item';
    row.dataset.wsId = wsId;
    row.dataset.itemId = item.id;
    row.draggable = true;

    this.updateItemRowContent(row, item);

    // Insert at position or append
    if (position !== undefined && position >= 0) {
      const children = Array.from(entry.itemsEl.children);
      if (position < children.length) {
        entry.itemsEl.insertBefore(row, children[position]);
      } else {
        entry.itemsEl.appendChild(row);
      }
    } else {
      entry.itemsEl.appendChild(row);
    }

    entry.itemEls.set(item.id, row);

    // Selection
    row.addEventListener('click', (e) => {
      this.handleItemClick(wsId, item.id, e);
    });

    // Double-click for inline editing
    row.addEventListener('dblclick', (e) => {
      this.handleItemDblClick(wsId, item, e);
    });

    // Right-click context menu for items
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showItemContextMenu(wsId, item.id, e.clientX, e.clientY);
    });

    // Drag-reorder
    row.addEventListener('dragstart', (e) => {
      this.dragSourceWsId = wsId;
      this.dragSourceItemId = item.id;
      e.dataTransfer?.setData('text/plain', item.id);
      row.classList.add('as-tree-item-dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('as-tree-item-dragging');
      this.dragSourceWsId = null;
      this.dragSourceItemId = null;
      // Remove all drag-over indicators
      entry.itemsEl.querySelectorAll('.as-tree-item-drag-over').forEach(el => {
        el.classList.remove('as-tree-item-drag-over');
      });
    });

    row.addEventListener('dragover', (e) => {
      if (this.dragSourceWsId !== wsId) return;
      if (this.dragSourceItemId === item.id) return;
      e.preventDefault();
      row.classList.add('as-tree-item-drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('as-tree-item-drag-over');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('as-tree-item-drag-over');
      if (this.dragSourceWsId !== wsId || !this.dragSourceItemId) return;
      this.handleDrop(wsId, this.dragSourceItemId, item.id);
    });
  }

  private updateItemRowContent(row: HTMLElement, item: WorksheetItem): void {
    row.innerHTML = '';

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'as-tree-item-icon';
    iconSpan.innerHTML = iconForItem(item);
    row.appendChild(iconSpan);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'as-tree-item-name';
    nameSpan.textContent = item.name;
    nameSpan.dataset.col = 'name';
    row.appendChild(nameSpan);

    // Id (monospace, read-only, tooltip trigger)
    const idSpan = document.createElement('span');
    idSpan.className = 'as-tree-item-id';
    idSpan.textContent = item.id;
    idSpan.addEventListener('mouseenter', (e) => this.showTooltip(item, e));
    idSpan.addEventListener('mousemove', (e) => this.moveTooltip(e));
    idSpan.addEventListener('mouseleave', () => this.hideTooltip());
    row.appendChild(idSpan);

    // Type
    const typeSpan = document.createElement('span');
    typeSpan.className = 'as-tree-item-type';
    typeSpan.textContent = item.type;
    row.appendChild(typeSpan);

    // X
    const xSpan = document.createElement('span');
    xSpan.className = 'as-tree-item-x';
    if (isSeries(item)) {
      xSpan.textContent = item.xLabel;
      xSpan.dataset.col = 'x';
    } else if (item.type === 'INTERPOLATION') {
      xSpan.textContent = item.x1Name;
      xSpan.dataset.col = 'x';
    }
    row.appendChild(xSpan);

    // Y
    const ySpan = document.createElement('span');
    ySpan.className = 'as-tree-item-y';
    if (isSeries(item)) {
      ySpan.textContent = item.yLabel;
      ySpan.dataset.col = 'y';
    }
    row.appendChild(ySpan);

    // Color (series only)
    const colorSpan = document.createElement('span');
    colorSpan.className = 'as-tree-item-color';
    if (isSeries(item)) {
      const colorBtn = document.createElement('button');
      colorBtn.className = 'as-color-btn';
      colorBtn.style.backgroundColor = item.color;
      colorBtn.title = item.color;
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openColorPicker(item as SeriesItem, colorBtn, row.dataset.wsId!);
      });
      colorSpan.appendChild(colorBtn);
    }
    row.appendChild(colorSpan);
  }

  // -------------------------------------------------------------------------
  // Private — selection
  // -------------------------------------------------------------------------

  private handleItemClick(wsId: string, itemId: string, e: MouseEvent): void {
    const key = `${wsId}:${itemId}`;

    if (e.ctrlKey || e.metaKey) {
      // Toggle
      if (this.selected.has(key)) {
        this.selected.delete(key);
      } else {
        this.selected.add(key);
      }
    } else if (e.shiftKey && this.lastClickedKey) {
      // Range select
      this.selectRange(this.lastClickedKey, key);
    } else {
      // Single select
      this.selected.clear();
      this.selected.add(key);
    }

    this.lastClickedKey = key;
    this.updateSelectionDisplay();
    this.emit('selectionChange');
  }

  private selectRange(fromKey: string, toKey: string): void {
    // Build an ordered list of all item keys
    const allKeys: string[] = [];
    for (const [entryWsId, entry] of this.entries) {
      for (const item of entry.ws.items) {
        allKeys.push(`${entryWsId}:${item.id}`);
      }
    }

    const fromIdx = allKeys.indexOf(fromKey);
    const toIdx = allKeys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;

    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);

    this.selected.clear();
    for (let i = start; i <= end; i++) {
      this.selected.add(allKeys[i]);
    }
  }

  private updateSelectionDisplay(): void {
    // Track which worksheets contain a selected item
    const focusedWsIds = new Set<string>();

    for (const [wsId, entry] of this.entries) {
      for (const [itemId, rowEl] of entry.itemEls) {
        const key = `${wsId}:${itemId}`;
        const isSel = this.selected.has(key);
        rowEl.classList.toggle('as-tree-item-selected', isSel);
        if (isSel) focusedWsIds.add(wsId);
      }
    }

    // Highlight worksheet headers that contain selected items
    for (const [wsId, entry] of this.entries) {
      entry.headerEl.classList.toggle('as-tree-ws-focused', focusedWsIds.has(wsId));
    }
  }

  // -------------------------------------------------------------------------
  // Private — inline editing
  // -------------------------------------------------------------------------

  private handleItemDblClick(wsId: string, item: WorksheetItem, e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const col = target.dataset.col;

    if (col === 'name') {
      this.startEditCell(target, item.name, (val) => {
        item.name = val;
        target.textContent = val;
        this.emit('itemChanged', wsId, item);
      });
    } else if (col === 'x' && (isSeries(item) || item.type === 'INTERPOLATION')) {
      const currentVal = isSeries(item) ? item.xLabel : item.x1Name;
      this.startEditCell(target, currentVal, (val) => {
        if (isSeries(item)) {
          item.xLabel = val;
        } else if (item.type === 'INTERPOLATION') {
          item.x1Name = val;
        }
        target.textContent = val;
        this.emit('itemChanged', wsId, item);
      });
    } else if (col === 'y' && isSeries(item)) {
      this.startEditCell(target, item.yLabel, (val) => {
        item.yLabel = val;
        target.textContent = val;
        this.emit('itemChanged', wsId, item);
      });
    } else {
      // No editable column hit — emit double-click event
      this.emit('itemDoubleClick', wsId, item);
    }
  }

  private startEditCell(span: HTMLElement, currentValue: string, onCommit: (val: string) => void): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'as-tree-inline-input';
    input.value = currentValue;

    const originalText = span.textContent;
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      input.remove();
      if (val && val !== currentValue) {
        onCommit(val);
      } else {
        span.textContent = originalText;
      }
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      input.remove();
      span.textContent = originalText;
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  private startEditWorksheetName(wsId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    const currentName = entry.ws.name;
    const span = entry.nameEl;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'as-tree-inline-input';
    input.value = currentName;

    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      input.remove();
      if (val && val !== currentName) {
        // Check for duplicate names
        for (const [id, e] of this.entries) {
          if (id !== wsId && e.ws.name === val) {
            // Duplicate — revert
            this.updateWsNameDisplay(entry);
            return;
          }
        }
        entry.ws.name = val;
        this.updateWsNameDisplay(entry);
        this.emit('worksheetChanged', wsId, val);
      } else {
        this.updateWsNameDisplay(entry);
      }
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      input.remove();
      this.updateWsNameDisplay(entry);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  // -------------------------------------------------------------------------
  // Private — color picker
  // -------------------------------------------------------------------------

  private openColorPicker(item: SeriesItem, btn: HTMLElement, wsId: string): void {
    // Remove stale handlers from a previous open that was cancelled
    if (this.colorHandler) {
      this.colorInput.removeEventListener('input', this.colorHandler);
      this.colorInput.removeEventListener('change', this.colorHandler);
      this.colorHandler = null;
    }

    this.colorInput.value = item.color;

    // Live-preview: update on every drag through the palette
    const onInput = () => {
      item.color = this.colorInput.value;
      btn.style.backgroundColor = item.color;
      btn.title = item.color;
      this.emit('itemChanged', wsId, item);
    };

    // Clean up when the picker is closed
    const onChange = () => {
      this.colorInput.removeEventListener('input', onInput);
      this.colorInput.removeEventListener('change', onChange);
      this.colorHandler = null;
    };

    // Track the input handler so we can remove it if the picker is
    // reopened for a different item without triggering change
    this.colorHandler = onInput;
    this.colorInput.addEventListener('input', onInput);
    this.colorInput.addEventListener('change', onChange);
    this.colorInput.click();
  }

  // -------------------------------------------------------------------------
  // Private — drag-reorder
  // -------------------------------------------------------------------------

  private handleDrop(wsId: string, sourceItemId: string, targetItemId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    const items = entry.ws.items;
    const srcIdx = items.findIndex(i => i.id === sourceItemId);
    const tgtIdx = items.findIndex(i => i.id === targetItemId);
    if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return;

    // Remove source, then adjust target index for the shift caused by removal
    const [moved] = items.splice(srcIdx, 1);
    const adjustedTgt = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
    items.splice(adjustedTgt, 0, moved);

    // Re-render items
    this.rerenderItems(wsId);
    this.emit('itemChanged', wsId, moved);
  }

  private rerenderItems(wsId: string): void {
    const entry = this.entries.get(wsId);
    if (!entry) return;

    // Remove old rows
    entry.itemsEl.innerHTML = '';
    entry.itemEls.clear();

    // Rebuild
    this.suppressEvents = true;
    for (const item of entry.ws.items) {
      this.buildItemRow(wsId, item, entry);
    }
    this.suppressEvents = false;

    // Restore selection display
    this.updateSelectionDisplay();
  }

  // -------------------------------------------------------------------------
  // Private — context menu
  // -------------------------------------------------------------------------

  private showContextMenu(wsId: string, x: number, y: number): void {
    this.contextMenuEl.innerHTML = '';
    this.contextMenuEl.style.display = 'block';

    const items: { label: string; action: () => void; separator?: boolean }[] = [
      { label: 'Move Up', action: () => this.moveWorksheet(wsId, -1) },
      { label: 'Move Down', action: () => this.moveWorksheet(wsId, 1) },
      { label: '', action: () => {}, separator: true },
      { label: 'Remove', action: () => this.removeWorksheet(wsId) },
    ];

    for (const mi of items) {
      if (mi.separator) {
        const sep = document.createElement('div');
        sep.className = 'as-context-menu-separator';
        this.contextMenuEl.appendChild(sep);
        continue;
      }
      const btn = document.createElement('div');
      btn.className = 'as-context-menu-item';
      btn.textContent = mi.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideContextMenu();
        mi.action();
      });
      this.contextMenuEl.appendChild(btn);
    }

    // Clamp position to viewport
    const menuWidth = 160;
    const menuHeight = items.length * 28;
    this.contextMenuEl.style.left = Math.min(x, window.innerWidth - menuWidth) + 'px';
    this.contextMenuEl.style.top = Math.min(y, window.innerHeight - menuHeight) + 'px';
  }

  private showItemContextMenu(wsId: string, itemId: string, x: number, y: number): void {
    this.contextMenuEl.innerHTML = '';
    this.contextMenuEl.style.display = 'block';

    const items: { label: string; action: () => void; separator?: boolean }[] = [
      {
        label: 'Delete',
        action: () => {
          this.removeItem(wsId, itemId);
          this.emit('itemRemoved', wsId, itemId);
        },
      },
    ];

    for (const mi of items) {
      if (mi.separator) {
        const sep = document.createElement('div');
        sep.className = 'as-context-menu-separator';
        this.contextMenuEl.appendChild(sep);
        continue;
      }
      const btn = document.createElement('div');
      btn.className = 'as-context-menu-item';
      btn.textContent = mi.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideContextMenu();
        mi.action();
      });
      this.contextMenuEl.appendChild(btn);
    }

    const menuWidth = 160;
    const menuHeight = items.length * 28;
    this.contextMenuEl.style.left = Math.min(x, window.innerWidth - menuWidth) + 'px';
    this.contextMenuEl.style.top = Math.min(y, window.innerHeight - menuHeight) + 'px';
  }

  private hideContextMenu(): void {
    this.contextMenuEl.style.display = 'none';
  }

  private moveWorksheet(wsId: string, direction: number): void {
    const wsIds = Array.from(this.entries.keys());
    const idx = wsIds.indexOf(wsId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= wsIds.length) return;

    // Swap in entries map (rebuild to maintain order)
    const entriesArr = Array.from(this.entries.entries());
    [entriesArr[idx], entriesArr[newIdx]] = [entriesArr[newIdx], entriesArr[idx]];
    this.entries = new Map(entriesArr);

    // Swap DOM order
    const entry = this.entries.get(wsId)!;
    if (direction === -1) {
      const prevEntry = this.entries.get(wsIds[newIdx])!;
      this.treeEl.insertBefore(entry.el, prevEntry.el);
    } else {
      const nextEntry = this.entries.get(wsIds[newIdx])!;
      this.treeEl.insertBefore(nextEntry.el, entry.el);
    }
  }

  // -------------------------------------------------------------------------
  // Private — tooltip
  // -------------------------------------------------------------------------

  private showTooltip(item: WorksheetItem, e: MouseEvent): void {
    this.tooltipEl.innerHTML = '';

    const addLine = (label: string, value: string, isHtml = false) => {
      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = label + ': ';
      div.appendChild(strong);
      if (isHtml) {
        const span = document.createElement('span');
        span.innerHTML = value;
        div.appendChild(span);
      } else {
        div.appendChild(document.createTextNode(value));
      }
      this.tooltipEl.appendChild(div);
    };

    addLine('Date', item.date);
    if (item.history) addLine('History', item.history, true);
    if (item.comment) addLine('Comment', item.comment);

    this.tooltipEl.style.display = 'block';
    this.moveTooltip(e);
  }

  private moveTooltip(e: MouseEvent): void {
    this.tooltipEl.style.left = (e.clientX + 12) + 'px';
    this.tooltipEl.style.top = (e.clientY + 12) + 'px';
  }

  private hideTooltip(): void {
    this.tooltipEl.style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // Private — helpers
  // -------------------------------------------------------------------------

  private updateWsNameDisplay(entry: WsEntry): void {
    entry.nameEl.textContent = entry.ws.name + (entry.ws.modified ? ' *' : '');
  }

  private emit(event: TreeEvent, ...args: unknown[]): void {
    if (this.suppressEvents) return;
    for (const cb of this.listeners.get(event) ?? []) {
      cb(...args);
    }
  }
}

export { formatDate };
