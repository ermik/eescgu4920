import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { WindowManager } from './windowManager';
import type { ManagedWindow } from './windowManager';

describe('WindowManager', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function makeWin(id: string, title: string): ManagedWindow {
    const el = document.createElement('div');
    el.textContent = `Content for ${id}`;
    return { id, title, element: el };
  }

  it('constructor creates tab bar, content area, and placeholder', () => {
    new WindowManager(container);
    expect(container.querySelector('.as-tab-bar')).toBeTruthy();
    expect(container.querySelector('.as-window-content')).toBeTruthy();
    expect(container.querySelector('.as-placeholder')).toBeTruthy();
  });

  it('placeholder shows initial message', () => {
    new WindowManager(container);
    const placeholder = container.querySelector('.as-placeholder')!;
    expect(placeholder.textContent).toBe('Select or import a series to begin.');
  });

  it('open creates a tab with title and close button', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    const tab = container.querySelector('.as-tab')!;
    expect(tab.querySelector('.as-tab-title')!.textContent).toBe('Window 1');
    expect(tab.querySelector('.as-tab-close')).toBeTruthy();
  });

  it('open hides placeholder', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    const placeholder = container.querySelector('.as-placeholder') as HTMLElement;
    expect(placeholder.style.display).toBe('none');
  });

  it('open adds active class to focused tab', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    const tab = container.querySelector('.as-tab')!;
    expect(tab.classList.contains('as-tab-active')).toBe(true);
  });

  it('focus switches active tab', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    wm.open(makeWin('w2', 'Window 2'));
    const tabs = container.querySelectorAll('.as-tab');
    // w2 should be active (last opened)
    expect(tabs[0].classList.contains('as-tab-active')).toBe(false);
    expect(tabs[1].classList.contains('as-tab-active')).toBe(true);

    wm.focus('w1');
    expect(tabs[0].classList.contains('as-tab-active')).toBe(true);
    expect(tabs[1].classList.contains('as-tab-active')).toBe(false);
  });

  it('close removes tab and shows placeholder when last', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    wm.close('w1');
    expect(container.querySelectorAll('.as-tab').length).toBe(0);
    const placeholder = container.querySelector('.as-placeholder') as HTMLElement;
    expect(placeholder.style.display).toBe('');
  });

  it('close activates previous window when active window closed', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    wm.open(makeWin('w2', 'Window 2'));
    wm.close('w2');
    const tab = container.querySelector('.as-tab')!;
    expect(tab.classList.contains('as-tab-active')).toBe(true);
    expect(wm.getActiveWindowId()).toBe('w1');
  });

  it('notifyItemChanged updates tab title', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('item-1', 'Old Name'));
    wm.notifyItemChanged({ id: 'item-1', name: 'New Name', type: 'Series', xLabel: '', yLabel: '', color: '', date: '', comment: '', history: '', index: new Float64Array(0), values: new Float64Array(0) });
    const titleSpan = container.querySelector('.as-tab-title')!;
    expect(titleSpan.textContent).toBe('New Name');
  });

  it('closeWindowsForItem closes matching windows', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('item-1', 'Series'));
    wm.open(makeWin('filter-item-1', 'Filter'));
    wm.open(makeWin('item-2', 'Other'));
    wm.closeWindowsForItem('item-1');
    expect(container.querySelectorAll('.as-tab').length).toBe(1);
    expect(wm.get('item-2')).toBeTruthy();
  });

  it('snapshot of tab bar with 2 windows', () => {
    const wm = new WindowManager(container);
    wm.open(makeWin('w1', 'Window 1'));
    wm.open(makeWin('w2', 'Window 2'));
    const tabBar = container.querySelector('.as-tab-bar')!;
    expect(tabBar.innerHTML).toMatchSnapshot();
  });
});
