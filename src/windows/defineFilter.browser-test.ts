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

import { createDefineFilterWindow } from './defineFilter';
import { mockSeriesItem, resetFixtureIds } from '../fixtures';

describe('createDefineFilterWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onSaveFilter: () => {}, onSaveFilterAndSeries: () => {} };

  it('creates a div with expected classes', () => {
    const win = createDefineFilterWindow(mockSeriesItem(), noop);
    expect(win.element.className).toBe('as-window as-define-filter-window');
  });

  it('toolbar has Window size input with default 3', () => {
    const win = createDefineFilterWindow(mockSeriesItem(), noop);
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    const label = toolbar.querySelector('label')!;
    expect(label.textContent).toBe('Window size:');
    const input = toolbar.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('3');
    expect(input.min).toBe('1');
    expect(input.max).toBe('33');
  });

  it('has 3 buttons', () => {
    const win = createDefineFilterWindow(mockSeriesItem(), noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(3);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Save filter', 'Save filter and series filtered', 'Close',
    ]);
  });

  it('contains plot container', () => {
    const win = createDefineFilterWindow(mockSeriesItem(), noop);
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is filter-{itemId}', () => {
    const item = mockSeriesItem();
    const win = createDefineFilterWindow(item, noop);
    expect(win.id).toBe('filter-' + item.id);
  });

  it('snapshot of toolbar and button bar', () => {
    const win = createDefineFilterWindow(mockSeriesItem(), noop);
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    expect(toolbar.innerHTML).toMatchSnapshot();
    const buttons = win.element.querySelector('.as-button-bar')!;
    expect(buttons.innerHTML).toMatchSnapshot();
  });
});
