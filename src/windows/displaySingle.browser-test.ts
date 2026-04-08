import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('plotly.js-dist-min', () => {
  const m = {
    newPlot: (div: HTMLDivElement) => {
      const d = div as unknown as Record<string, unknown>;
      if (!d.on) { d.on = () => {}; d.removeListener = () => {}; }
      return Promise.resolve();
    },
    react: () => Promise.resolve(),
    relayout: () => Promise.resolve(),
    purge: () => {},
    toImage: () => Promise.resolve(''),
  };
  return { ...m, default: m };
});

import { createDisplaySingleWindow } from './displaySingle';
import { mockSeriesItem, resetFixtureIds } from '../fixtures';

describe('createDisplaySingleWindow', () => {
  afterEach(() => resetFixtureIds());

  it('creates a div with expected classes', () => {
    const win = createDisplaySingleWindow(mockSeriesItem());
    expect(win.element.className).toContain('as-window');
  });

  it('has 4 tab buttons: Data, Stats, Plot, Info', () => {
    const win = createDisplaySingleWindow(mockSeriesItem());
    const tabs = win.element.querySelectorAll('.as-tab-inner');
    expect(tabs.length).toBe(4);
    expect(Array.from(tabs).map((t) => t.textContent)).toEqual([
      'Data', 'Stats', 'Plot', 'Info',
    ]);
  });

  it('first tab (Data) is active by default', () => {
    const win = createDisplaySingleWindow(mockSeriesItem());
    const tabs = win.element.querySelectorAll('.as-tab-inner');
    expect(tabs[0].classList.contains('as-tab-inner-active')).toBe(true);
    expect(tabs[1].classList.contains('as-tab-inner-active')).toBe(false);
  });

  it('data tab has table with x/y column headers', () => {
    const item = mockSeriesItem({ xLabel: 'Depth', yLabel: 'δ18O' });
    const win = createDisplaySingleWindow(item);
    const activePanel = win.element.querySelector('.as-tab-inner-panel-active')!;
    const ths = activePanel.querySelectorAll('th');
    expect(ths.length).toBe(2);
    expect(ths[0].textContent).toBe('Depth');
    expect(ths[1].textContent).toBe('δ18O');
  });

  it('data tab has rows matching series length', () => {
    const item = mockSeriesItem(); // 5 points
    const win = createDisplaySingleWindow(item);
    const activePanel = win.element.querySelector('.as-tab-inner-panel-active')!;
    const rows = activePanel.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
  });

  it('tab click switches active panel', () => {
    const win = createDisplaySingleWindow(mockSeriesItem());
    const tabBar = win.element.querySelector('.as-tab-inner-bar')!;
    const statsBtn = tabBar.querySelectorAll('.as-tab-inner')[1] as HTMLElement;
    statsBtn.click();

    const activePanel = win.element.querySelector('.as-tab-inner-panel-active') as HTMLElement;
    expect(activePanel.dataset.tabId).toBe('stats');
    expect(statsBtn.classList.contains('as-tab-inner-active')).toBe(true);
  });

  it('window ID is the item ID', () => {
    const item = mockSeriesItem();
    const win = createDisplaySingleWindow(item);
    expect(win.id).toBe(item.id);
  });

  it('snapshot of tab bar', () => {
    const win = createDisplaySingleWindow(mockSeriesItem());
    const tabBar = win.element.querySelector('.as-tab-inner-bar')!;
    expect(tabBar.innerHTML).toMatchSnapshot();
  });
});
