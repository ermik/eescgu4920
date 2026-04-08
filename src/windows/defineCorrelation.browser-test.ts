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

import { createDefineCorrelationWindow } from './defineCorrelation';
import { mockSeriesItem, resetFixtureIds } from '../fixtures';

describe('createDefineCorrelationWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onImport: () => {} };

  function evenSeries(name = 'S1') {
    // Evenly spaced series to avoid resampling issues
    return mockSeriesItem({
      name,
      index: Float64Array.from([0, 10, 20, 30, 40]),
      values: Float64Array.from([1, 2, 3, 2, 1]),
    });
  }

  it('creates a div with expected classes', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    expect(win.element.className).toBe('as-window as-define-correlation-window');
  });

  it('has mode select with 3 options', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    const select = win.element.querySelector('select')!;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['correlation', 'covariance', 'crossproduct']);
  });

  it('has FFT and Remove mean checkboxes (both checked by default)', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    const checkboxes = win.element.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true); // FFT
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true); // Remove mean
  });

  it('shows max lag input for auto-correlation (1 series)', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    const lagInputs = win.element.querySelectorAll('input[type="number"]');
    expect(lagInputs.length).toBe(1);
    expect((lagInputs[0] as HTMLInputElement).placeholder).toBe('auto');
  });

  it('no max lag input for cross-correlation (2 series)', () => {
    const win = createDefineCorrelationWindow([evenSeries('A'), evenSeries('B')], noop);
    const lagInputs = win.element.querySelectorAll('input[type="number"]');
    expect(lagInputs.length).toBe(0);
  });

  it('has 2 buttons: Import series, Close', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Import series', 'Close',
    ]);
  });

  it('auto-correlation title', () => {
    const s = evenSeries('MySeries');
    const win = createDefineCorrelationWindow([s], noop);
    expect(win.title).toBe('Auto-correlation: MySeries');
  });

  it('cross-correlation title', () => {
    const win = createDefineCorrelationWindow([evenSeries('A'), evenSeries('B')], noop);
    expect(win.title).toBe('Cross-correlation: A × B');
  });

  it('snapshot of controls and button bar', () => {
    const win = createDefineCorrelationWindow([evenSeries()], noop);
    const buttonBar = win.element.querySelector('.as-button-bar')!;
    expect(buttonBar.innerHTML).toMatchSnapshot();
  });
});
