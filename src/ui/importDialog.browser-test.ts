import { describe, it, expect, afterEach } from 'vitest';
import { showImportDialog } from './importDialog';

describe('showImportDialog', () => {
  afterEach(() => {
    document.querySelector('.as-modal-backdrop')?.remove();
  });

  const noop = { onImportSeries: () => {}, onImportPointers: () => {} };

  it('appends modal backdrop to body', () => {
    showImportDialog(noop);
    expect(document.querySelector('.as-modal-backdrop')).toBeTruthy();
  });

  it('contains modal with as-modal class', () => {
    showImportDialog(noop);
    const modal = document.querySelector('.as-modal');
    expect(modal).toBeTruthy();
  });

  it('has import header with instructions', () => {
    showImportDialog(noop);
    const header = document.querySelector('.as-import-header')!;
    expect(header.textContent).toContain('Paste tab-separated data');
  });

  it('has drop zone', () => {
    showImportDialog(noop);
    const dropZone = document.querySelector('.as-import-dropzone')!;
    expect(dropZone).toBeTruthy();
    expect(dropZone.textContent).toContain('Drop file');
  });

  it('has hidden file input', () => {
    showImportDialog(noop);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.style.display).toBe('none');
    expect(input.accept).toContain('.csv');
  });

  it('has table container', () => {
    showImportDialog(noop);
    expect(document.querySelector('.as-import-table-container')).toBeTruthy();
  });

  it('has import buttons', () => {
    showImportDialog(noop);
    const buttons = document.querySelectorAll('.as-modal .as-btn');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('Import series');
    expect(labels).toContain('Import pointers');
    expect(labels).toContain('Close');
  });

  it('close button removes backdrop', () => {
    showImportDialog(noop);
    const buttons = document.querySelectorAll('.as-modal .as-btn');
    const closeBtn = Array.from(buttons).find((b) => b.textContent === 'Close') as HTMLButtonElement;
    closeBtn.click();
    expect(document.querySelector('.as-modal-backdrop')).toBeNull();
  });

  it('snapshot of modal structure', () => {
    showImportDialog(noop);
    const modal = document.querySelector('.as-modal')!;
    // Snapshot just the header and dropzone, not the full modal
    const header = modal.querySelector('.as-import-header')!;
    expect(header.outerHTML).toMatchSnapshot();
    const dropZone = modal.querySelector('.as-import-dropzone')!;
    expect(dropZone.outerHTML).toMatchSnapshot();
  });
});
