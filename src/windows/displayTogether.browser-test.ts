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

import { createDisplayTogetherWindow } from './displayTogether';
import { mockSeriesItem, resetFixtureIds, stripLitMarkers } from '../fixtures';

describe('createDisplayTogetherWindow', () => {
  afterEach(() => resetFixtureIds());

  function makeItems(n: number) {
    return Array.from({ length: n }, (_, i) =>
      mockSeriesItem({ name: `Series ${i + 1}` }),
    );
  }

  it('creates a div with expected classes', () => {
    const win = createDisplayTogetherWindow(makeItems(2));
    expect(win.element.className).toBe('as-window as-display-together-window');
  });

  it('contains toolbar with label and select', () => {
    const win = createDisplayTogetherWindow(makeItems(2));
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    expect(toolbar).toBeTruthy();
    expect(toolbar.querySelector('label')!.textContent).toBe('Separated axis:');
    expect(toolbar.querySelector('select')).toBeTruthy();
  });

  it('select has 3 options: none, vertical, horizontal', () => {
    const win = createDisplayTogetherWindow(makeItems(2));
    const select = win.element.querySelector('select')!;
    const options = Array.from(select.options);
    expect(options.map((o) => o.value)).toEqual(['none', 'vertical', 'horizontal']);
    expect(options.map((o) => o.textContent)).toEqual(['none', 'vertical', 'horizontal']);
  });

  it('contains plot container', () => {
    const win = createDisplayTogetherWindow(makeItems(2));
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is sorted item IDs joined with +', () => {
    const items = makeItems(3);
    const win = createDisplayTogetherWindow(items);
    const expected = items.map((i) => i.id).sort().join('+');
    expect(win.id).toBe(expected);
  });

  it('title lists item names', () => {
    const items = makeItems(2);
    const win = createDisplayTogetherWindow(items);
    expect(win.title).toBe('Together: Series 1, Series 2');
  });

  it('syncWithItem does not crash', () => {
    const items = makeItems(2);
    const win = createDisplayTogetherWindow(items);
    expect(() => win.syncWithItem!(items[0])).not.toThrow();
  });

  it('snapshot of toolbar', () => {
    const win = createDisplayTogetherWindow(makeItems(2));
    const toolbar = win.element.querySelector('.as-display-toolbar')!;
    expect(stripLitMarkers(toolbar.innerHTML)).toMatchSnapshot();
  });
});
