/**
 * Cut / copy / paste data store for worksheet items.
 *
 * Stores references (not deep copies) matching the Python behaviour.
 * The caller (main.ts) is responsible for DOM/tree mutations.
 */

import type { Worksheet, WorksheetItem } from '../types';

export interface ClipboardEntry {
  wsId: string;
  item: WorksheetItem;
}

export class Clipboard {
  private items: ClipboardEntry[] = [];
  private wasCut = false;

  /** Store references to items (non-destructive). */
  copy(items: ClipboardEntry[]): void {
    this.items = [...items];
    this.wasCut = false;
  }

  /** Store references and flag as cut (caller removes from source). */
  cut(items: ClipboardEntry[]): void {
    this.items = [...items];
    this.wasCut = true;
  }

  /** Whether the stored items came from a cut operation. */
  isCut(): boolean {
    return this.wasCut;
  }

  /** Return the stored items (caller adds to target worksheet). */
  getItems(): ClipboardEntry[] {
    return this.items;
  }

  /** Check whether an item ID already exists in a worksheet. */
  isItemInWorksheet(ws: Worksheet, itemId: string): boolean {
    return ws.items.some(i => i.id === itemId);
  }

  /** Clear the clipboard. */
  clear(): void {
    this.items = [];
    this.wasCut = false;
  }
}
