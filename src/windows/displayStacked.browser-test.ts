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

import { createDisplayStackedWindow } from './displayStacked';
import { mockSeriesItem, resetFixtureIds } from '../fixtures';

describe('createDisplayStackedWindow', () => {
  afterEach(() => resetFixtureIds());

  function makeItems(n: number) {
    return Array.from({ length: n }, (_, i) =>
      mockSeriesItem({ name: `Series ${i + 1}` }),
    );
  }

  it('creates a div with expected classes', () => {
    const win = createDisplayStackedWindow(makeItems(2));
    expect(win.element.className).toBe('as-window as-display-stacked-window');
  });

  it('toolbar has shared-x checkbox and label', () => {
    const win = createDisplayStackedWindow(makeItems(2));
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    const checkbox = toolbar.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.id).toBe('shared-x-checkbox');
    const label = toolbar.querySelector('label')!;
    expect(label.textContent).toBe('Shared horizontal axis');
    expect(label.htmlFor).toBe('shared-x-checkbox');
  });

  it('contains plot container', () => {
    const win = createDisplayStackedWindow(makeItems(2));
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is sorted item IDs joined with +', () => {
    const items = makeItems(3);
    const win = createDisplayStackedWindow(items);
    const expected = items.map((i) => i.id).sort().join('+');
    expect(win.id).toBe(expected);
  });

  it('title lists item names', () => {
    const items = makeItems(2);
    const win = createDisplayStackedWindow(items);
    expect(win.title).toBe('Stacked: Series 1, Series 2');
  });

  it('snapshot of toolbar', () => {
    const win = createDisplayStackedWindow(makeItems(2));
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    expect(toolbar.innerHTML).toMatchSnapshot();
  });
});
