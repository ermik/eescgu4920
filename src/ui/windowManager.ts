/**
 * Tab-based window manager for the main content area.
 *
 * Each "window" is a DOM element with an associated tab. One tab is visible at
 * a time. When no windows are open a placeholder message is shown.
 *
 * Batch F changes:
 * - Added tab title sync when item name changes
 * - Added closeWindowsForItem() to gracefully close windows for deleted items
 * - Added getActiveWindowId() for focus tracking
 */

import type { WorksheetItem } from '../types';

export interface ManagedWindow {
  id: string;
  title: string;
  element: HTMLElement;
  onClose?: () => void;
  syncWithItem?: (item: WorksheetItem) => void;
  /** Optional: IDs of the items this window displays, for deletion tracking. */
  itemIds?: string[];
}

export class WindowManager {
  private container: HTMLElement;
  private tabBar: HTMLElement;
  private contentArea: HTMLElement;
  private placeholder: HTMLElement;
  private windows = new Map<string, ManagedWindow>();
  private activeId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.tabBar = document.createElement('div');
    this.tabBar.className = 'as-tab-bar';
    this.container.appendChild(this.tabBar);

    this.contentArea = document.createElement('div');
    this.contentArea.className = 'as-window-content';
    this.container.appendChild(this.contentArea);

    this.placeholder = document.createElement('div');
    this.placeholder.className = 'as-placeholder';
    this.placeholder.textContent = 'Select or import a series to begin.';
    this.contentArea.appendChild(this.placeholder);
  }

  /** Open a window. Returns false if already open (focuses it instead). */
  open(win: ManagedWindow): boolean {
    if (this.windows.has(win.id)) {
      this.focus(win.id);
      return false;
    }

    this.windows.set(win.id, win);

    // Create tab
    const tab = document.createElement('div');
    tab.className = 'as-tab';
    tab.dataset.windowId = win.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'as-tab-title';
    titleSpan.textContent = win.title;
    tab.appendChild(titleSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'as-tab-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(win.id);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => this.focus(win.id));
    this.tabBar.appendChild(tab);

    // Mount content element (hidden initially)
    win.element.style.display = 'none';
    this.contentArea.appendChild(win.element);

    // Hide placeholder, focus this window
    this.placeholder.style.display = 'none';
    this.focus(win.id);
    return true;
  }

  /** Close a window by ID. */
  close(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;

    win.onClose?.();
    win.element.remove();
    this.windows.delete(id);

    // Remove tab
    const tab = this.tabBar.querySelector(`[data-window-id="${CSS.escape(id)}"]`);
    tab?.remove();

    // If the closed window was active, activate another or show placeholder
    if (this.activeId === id) {
      this.activeId = null;
      const remaining = Array.from(this.windows.keys());
      if (remaining.length > 0) {
        this.focus(remaining[remaining.length - 1]);
      } else {
        this.placeholder.style.display = '';
      }
    }
  }

  /** Close all windows. */
  closeAll(): void {
    for (const id of Array.from(this.windows.keys())) {
      this.close(id);
    }
  }

  /** Focus an existing window (bring to front). */
  focus(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;

    // Hide current active
    if (this.activeId && this.activeId !== id) {
      const prev = this.windows.get(this.activeId);
      if (prev) prev.element.style.display = 'none';
      const prevTab = this.tabBar.querySelector(`[data-window-id="${CSS.escape(this.activeId)}"]`);
      prevTab?.classList.remove('as-tab-active');
    }

    // Show target
    win.element.style.display = '';
    const tab = this.tabBar.querySelector(`[data-window-id="${CSS.escape(id)}"]`);
    tab?.classList.add('as-tab-active');
    this.activeId = id;
  }

  /**
   * Notify all windows that an item has changed.
   * Also updates tab titles if the changed item's name appears in any window.
   */
  notifyItemChanged(item: WorksheetItem): void {
    for (const [id, win] of this.windows) {
      win.syncWithItem?.(item);

      // Update tab title for single-item windows where id matches
      if (id === item.id) {
        this.updateTabTitle(id, `${item.name}`);
        win.title = `${item.name}`;
      }
    }
  }

  /**
   * Close all windows that display a given item (by item ID).
   * Used when an item is deleted from the tree.
   */
  closeWindowsForItem(itemId: string): void {
    const toClose: string[] = [];
    for (const [winId, win] of this.windows) {
      // Direct ID match (Display Single, info windows)
      if (winId === itemId || winId === 'info-' + itemId) {
        toClose.push(winId);
        continue;
      }
      // Process windows (filter-*, sample-*, interpolation-*)
      if (winId.includes(itemId)) {
        toClose.push(winId);
        continue;
      }
      // Multi-item windows (Together, Stacked) that include this item
      if (win.itemIds && win.itemIds.includes(itemId)) {
        toClose.push(winId);
        continue;
      }
      // Also check composite IDs (e.g. "Id-A+Id-B+Id-C")
      if (winId.includes('+') && winId.split('+').includes(itemId)) {
        toClose.push(winId);
      }
    }
    for (const winId of toClose) {
      this.close(winId);
    }
  }

  /** Update a tab's title text. */
  private updateTabTitle(winId: string, newTitle: string): void {
    const tab = this.tabBar.querySelector(`[data-window-id="${CSS.escape(winId)}"]`);
    if (tab) {
      const titleSpan = tab.querySelector('.as-tab-title');
      if (titleSpan) titleSpan.textContent = newTitle;
    }
  }

  /** Get a window by ID, or undefined if not open. */
  get(id: string): ManagedWindow | undefined {
    return this.windows.get(id);
  }

  /** Get the currently active window ID. */
  getActiveWindowId(): string | null {
    return this.activeId;
  }
}
