import { describe, it, expect, afterEach } from 'vitest';
import { showAboutDialog } from './aboutDialog';

describe('showAboutDialog', () => {
  afterEach(() => {
    document.querySelector('.as-modal-backdrop')?.remove();
  });

  it('appends modal backdrop to document.body', () => {
    showAboutDialog();
    const backdrop = document.querySelector('.as-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(document.body.contains(backdrop)).toBe(true);
  });

  it('contains about modal with expected class', () => {
    showAboutDialog();
    const modal = document.querySelector('.as-about-modal');
    expect(modal).toBeTruthy();
  });

  it('displays AnalySeries heading', () => {
    showAboutDialog();
    const h2 = document.querySelector('.as-about-modal h2');
    expect(h2?.textContent).toBe('AnalySeries');
  });

  it('displays version', () => {
    showAboutDialog();
    const modal = document.querySelector('.as-about-modal')!;
    expect(modal.textContent).toContain('Version 0.1.0');
  });

  it('contains close button', () => {
    showAboutDialog();
    const btn = document.querySelector('.as-about-modal .as-btn');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toBe('Close');
  });

  it('close button removes backdrop', () => {
    showAboutDialog();
    const btn = document.querySelector('.as-about-modal .as-btn') as HTMLButtonElement;
    btn.click();
    expect(document.querySelector('.as-modal-backdrop')).toBeNull();
  });

  it('Escape key removes backdrop', () => {
    showAboutDialog();
    expect(document.querySelector('.as-modal-backdrop')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.as-modal-backdrop')).toBeNull();
  });

  it('snapshot of modal content', () => {
    showAboutDialog();
    const modal = document.querySelector('.as-about-modal')!;
    expect(modal.innerHTML).toMatchSnapshot();
  });
});
