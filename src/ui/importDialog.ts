/**
 * Data import dialog — modal for importing series or pointers from pasted
 * tab-separated data or file upload (.txt, .csv, .tsv).
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import Papa from 'papaparse';
import type { SeriesItem, InterpolationItem } from '../types';
import { generateId, generateColor, isMonotonicIncreasing } from '../utils';
import { formatDate } from './tree';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function showImportDialog(options: {
  onImportSeries: (items: SeriesItem[]) => void;
  onImportPointers: (item: InterpolationItem) => void;
}): void {
  const dialog = new ImportDialog(options);
  dialog.show();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

class ImportDialog {
  private backdrop: HTMLElement;
  private modal: HTMLElement;
  private statusEl: HTMLElement;
  private tableContainer: HTMLElement;
  private dropMissingCb!: HTMLInputElement;

  private headers: string[] = [];
  private data: string[][] = [];
  private columnOrder: number[] = [];

  private onImportSeries: (items: SeriesItem[]) => void;
  private onImportPointers: (item: InterpolationItem) => void;

  constructor(options: {
    onImportSeries: (items: SeriesItem[]) => void;
    onImportPointers: (item: InterpolationItem) => void;
  }) {
    this.onImportSeries = options.onImportSeries;
    this.onImportPointers = options.onImportPointers;

    // Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'as-modal-backdrop';

    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'as-modal';
    this.backdrop.appendChild(this.modal);

    const fileInputRef = createRef<HTMLInputElement>();
    const dropZoneRef = createRef<HTMLDivElement>();
    const dropMissingRef = createRef<HTMLInputElement>();
    const tableRef = createRef<HTMLDivElement>();
    const statusRef = createRef<HTMLDivElement>();

    render(html`
      <div class="as-import-header">Paste tab-separated data with Ctrl+V, or drop a .txt/.csv/.tsv file.</div>
      <div class="as-import-dropzone" ${ref(dropZoneRef)}
        @click=${() => fileInputRef.value!.click()}
        @dragover=${(e: DragEvent) => { e.preventDefault(); dropZoneRef.value!.classList.add('as-import-dropzone-active'); }}
        @dragleave=${() => dropZoneRef.value!.classList.remove('as-import-dropzone-active')}
        @drop=${(e: DragEvent) => {
          e.preventDefault();
          dropZoneRef.value!.classList.remove('as-import-dropzone-active');
          const file = e.dataTransfer?.files[0];
          if (file) this.readFile(file);
        }}>Drop file here or click to browse</div>
      <input type="file" accept=".txt,.csv,.tsv" style="display:none" ${ref(fileInputRef)}
        @change=${() => {
          const file = fileInputRef.value!.files?.[0];
          if (file) this.readFile(file);
        }}>
      <div class="as-import-table-container" ${ref(tableRef)}></div>
      <div class="as-import-controls">
        <label class="as-import-checkbox-label">
          <input type="checkbox" checked ${ref(dropMissingRef)}> Drop missing values
        </label>
        <button class="as-btn" @click=${() => this.handleImportSeries()}>Import series</button>
        <button class="as-btn" @click=${() => this.handleImportPointers()}>Import pointers</button>
        <button class="as-btn" @click=${() => this.close()}>Close</button>
      </div>
      <div class="as-import-status" ${ref(statusRef)}></div>
    `, this.modal);

    this.tableContainer = tableRef.value!;
    this.statusEl = statusRef.value!;
    this.dropMissingCb = dropMissingRef.value!;

    // Paste handler on modal
    this.modal.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        e.stopPropagation();
        this.parseText(text);
      }
    });

    // Make modal focusable for paste events
    this.modal.tabIndex = -1;

    // Escape to close
    this.backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  show(): void {
    document.body.appendChild(this.backdrop);
    this.modal.focus();
  }

  private close(): void {
    this.backdrop.remove();
  }

  // -------------------------------------------------------------------------
  // Parsing
  // -------------------------------------------------------------------------

  private readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.parseText(reader.result);
      }
    };
    reader.readAsText(file);
  }

  private parseText(text: string): void {
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const rows = result.data;
    if (rows.length < 2) {
      this.showStatus('Error: need at least a header row and one data row.');
      return;
    }

    this.headers = rows[0].map(h => h.trim());
    this.data = rows.slice(1).map(row => row.map(c => c.trim()));

    this.columnOrder = this.headers.map((_, i) => i);
    this.renderTable();
    this.showStatus(`Parsed ${this.data.length} rows, ${this.headers.length} columns.`);
  }

  // -------------------------------------------------------------------------
  // Table rendering
  // -------------------------------------------------------------------------

  private renderTable(): void {
    if (this.headers.length === 0) {
      render(html``, this.tableContainer);
      return;
    }

    const handleDragStart = (e: DragEvent, colIdx: number) => {
      e.dataTransfer?.setData('text/plain', String(colIdx));
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).classList.add('as-import-th-drag-over');
    };
    const handleDragLeave = (e: DragEvent) => {
      (e.currentTarget as HTMLElement).classList.remove('as-import-th-drag-over');
    };
    const handleDrop = (e: DragEvent, toColIdx: number) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).classList.remove('as-import-th-drag-over');
      const fromIdx = parseInt(e.dataTransfer?.getData('text/plain') ?? '', 10);
      if (isNaN(fromIdx)) return;
      this.reorderColumn(fromIdx, toColIdx);
    };

    render(html`
      <table class="as-import-table">
        <thead>
          <tr>
            ${this.columnOrder.map((colIdx) => html`
              <th draggable="true" data-col-idx=${colIdx}
                @dragstart=${(e: DragEvent) => handleDragStart(e, colIdx)}
                @dragover=${handleDragOver}
                @dragleave=${handleDragLeave}
                @drop=${(e: DragEvent) => handleDrop(e, colIdx)}>
                ${this.headers[colIdx]}
              </th>
            `)}
          </tr>
        </thead>
        <tbody>
          ${this.data.map((row) => html`
            <tr>
              ${this.columnOrder.map((colIdx) => {
                const cellVal = row[colIdx] ?? '';
                return html`<td class=${cellVal === '' ? 'as-import-cell-empty' : ''}>${cellVal}</td>`;
              })}
            </tr>
          `)}
        </tbody>
      </table>
    `, this.tableContainer);
  }

  private reorderColumn(fromColIdx: number, toColIdx: number): void {
    const fromPos = this.columnOrder.indexOf(fromColIdx);
    const toPos = this.columnOrder.indexOf(toColIdx);
    if (fromPos === -1 || toPos === -1 || fromPos === toPos) return;

    this.columnOrder.splice(fromPos, 1);
    this.columnOrder.splice(toPos, 0, fromColIdx);
    this.renderTable();
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private validateHeaders(): boolean {
    for (const h of this.headers) {
      if (!isNaN(Number(h)) && h.trim() !== '') {
        this.showStatus('Error: headers must be non-numeric text.');
        return false;
      }
    }
    return true;
  }

  private parseNumericColumn(colIdx: number): { values: number[]; valid: boolean } {
    const values: number[] = [];
    for (const row of this.data) {
      const cell = row[colIdx] ?? '';
      if (cell === '' || cell.toLowerCase() === 'nan') {
        values.push(NaN);
      } else {
        const n = Number(cell);
        if (isNaN(n)) {
          this.showStatus(`Error: non-numeric value "${cell}" in column "${this.headers[colIdx]}".`);
          return { values: [], valid: false };
        }
        values.push(n);
      }
    }
    return { values, valid: true };
  }

  // -------------------------------------------------------------------------
  // Import handlers
  // -------------------------------------------------------------------------

  private handleImportSeries(): void {
    if (this.headers.length < 2) {
      this.showStatus('Error: need at least 2 columns (X and Y).');
      return;
    }
    if (!this.validateHeaders()) return;

    const order = this.columnOrder;
    const xColIdx = order[0];
    const xResult = this.parseNumericColumn(xColIdx);
    if (!xResult.valid) return;

    const items: SeriesItem[] = [];
    let prevColor: string | undefined;

    for (let c = 1; c < order.length; c++) {
      const yColIdx = order[c];
      const yResult = this.parseNumericColumn(yColIdx);
      if (!yResult.valid) return;

      // Build paired arrays
      const xVals: number[] = [];
      const yVals: number[] = [];

      for (let r = 0; r < this.data.length; r++) {
        const x = xResult.values[r];
        const y = yResult.values[r];

        // Skip rows where X is NaN
        if (isNaN(x)) continue;

        if (this.dropMissingCb.checked && isNaN(y)) continue;

        xVals.push(x);
        yVals.push(y);
      }

      if (xVals.length === 0) {
        this.showStatus(`Warning: column "${this.headers[yColIdx]}" has no valid data.`);
        continue;
      }

      // Sort by X
      const indices = xVals.map((_, i) => i);
      indices.sort((a, b) => xVals[a] - xVals[b]);

      const sortedX = new Float64Array(indices.length);
      const sortedY = new Float64Array(indices.length);
      for (let i = 0; i < indices.length; i++) {
        sortedX[i] = xVals[indices[i]];
        sortedY[i] = yVals[indices[i]];
      }

      const id = generateId();
      const color = generateColor(prevColor);
      prevColor = color;

      // Check for duplicate X values (replicates)
      let hasDuplicates = false;
      for (let i = 1; i < sortedX.length; i++) {
        if (sortedX[i] === sortedX[i - 1]) { hasDuplicates = true; break; }
      }

      if (hasDuplicates) {
        const groups = new Map<number, number[]>();
        for (let i = 0; i < sortedX.length; i++) {
          const key = sortedX[i];
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(sortedY[i]);
        }
        const avgX = new Float64Array(groups.size);
        const avgY = new Float64Array(groups.size);
        let gi = 0;
        for (const [x, ys] of groups) {
          avgX[gi] = x;
          avgY[gi] = ys.reduce((a, b) => a + b, 0) / ys.length;
          gi++;
        }

        const avgId = generateId();
        const avgColor = color;
        items.push({
          id: avgId,
          type: 'Series',
          name: this.headers[yColIdx] + ' (averaged)',
          date: formatDate(),
          comment: '',
          history: `Imported series with replicates (averaged)<BR>---> series <i><b>${avgId}</b></i>`,
          xLabel: this.headers[xColIdx],
          yLabel: this.headers[yColIdx],
          color: avgColor,
          hasReplicates: true,
          index: avgX,
          values: avgY,
        });

        const origId = generateId();
        const origColor = generateColor(avgColor);
        prevColor = origColor;
        items.push({
          id: origId,
          type: 'Series',
          name: this.headers[yColIdx] + ' (replicates)',
          date: formatDate(),
          comment: '',
          history: `Imported series with replicates (original)<BR>---> series <i><b>${origId}</b></i>`,
          xLabel: this.headers[xColIdx],
          yLabel: this.headers[yColIdx],
          color: origColor,
          hasReplicates: true,
          index: sortedX,
          values: sortedY,
        });
      } else {
        const item: SeriesItem = {
          id,
          type: 'Series',
          name: this.headers[yColIdx],
          date: formatDate(),
          comment: '',
          history: `Imported series <BR>---> series <i><b>${id}</b></i>`,
          xLabel: this.headers[xColIdx],
          yLabel: this.headers[yColIdx],
          color,
          index: sortedX,
          values: sortedY,
        };
        items.push(item);
      }
    }

    if (items.length === 0) {
      this.showStatus('Error: no valid series to import.');
      return;
    }

    this.onImportSeries(items);
    this.close();
  }

  private handleImportPointers(): void {
    if (this.columnOrder.length !== 2) {
      this.showStatus('Error: pointers import requires exactly 2 columns.');
      return;
    }
    if (!this.validateHeaders()) return;

    const col1Idx = this.columnOrder[0]; // distorted (x2)
    const col2Idx = this.columnOrder[1]; // reference (x1)

    const col1Result = this.parseNumericColumn(col1Idx);
    if (!col1Result.valid) return;
    const col2Result = this.parseNumericColumn(col2Idx);
    if (!col2Result.valid) return;

    // Filter out rows with NaN
    const x2: number[] = [];
    const x1: number[] = [];
    for (let r = 0; r < this.data.length; r++) {
      const v1 = col1Result.values[r];
      const v2 = col2Result.values[r];
      if (isNaN(v1) || isNaN(v2)) continue;
      x2.push(v1);
      x1.push(v2);
    }

    if (x1.length < 2) {
      this.showStatus('Error: need at least 2 valid tie-point pairs.');
      return;
    }

    if (!isMonotonicIncreasing(x1)) {
      this.showStatus(`Error: column "${this.headers[col2Idx]}" values must be strictly monotonic increasing.`);
      return;
    }
    if (!isMonotonicIncreasing(x2)) {
      this.showStatus(`Error: column "${this.headers[col1Idx]}" values must be strictly monotonic increasing.`);
      return;
    }

    const id = generateId();
    const item: InterpolationItem = {
      id,
      type: 'INTERPOLATION',
      name: `${this.headers[col2Idx]} → ${this.headers[col1Idx]}`,
      date: formatDate(),
      comment: '',
      history: `Imported pointers <BR>---> interpolation <i><b>${id}</b></i>`,
      x1Coords: x1,
      x2Coords: x2,
      x1Name: this.headers[col2Idx],
    };

    this.onImportPointers(item);
    this.close();
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  private showStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }
}
