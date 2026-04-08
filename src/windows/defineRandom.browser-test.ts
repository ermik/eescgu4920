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

import { createDefineRandomWindow } from './defineRandom';
import { resetFixtureIds } from '../fixtures';

describe('createDefineRandomWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onImport: () => {} };

  it('creates a div with expected classes', () => {
    const win = createDefineRandomWindow(noop);
    expect(win.element.className).toBe('as-window as-define-random-window');
  });

  it('has params group with 5 labeled inputs', () => {
    const win = createDefineRandomWindow(noop);
    const params = win.element.querySelector('.as-params-group')!;
    const labels = params.querySelectorAll('label');
    expect(labels.length).toBe(5);
    expect(Array.from(labels).map((l) => l.textContent)).toEqual([
      'Start:', 'End:', 'Nb points:', 'Min value:', 'Max value:',
    ]);
  });

  it('inputs have expected default values', () => {
    const win = createDefineRandomWindow(noop);
    const inputs = win.element.querySelectorAll('.as-params-group input[type="number"]');
    const values = Array.from(inputs).map((i) => (i as HTMLInputElement).value);
    expect(values).toEqual(['0', '100', '101', '0', '10']);
  });

  it('has 3 buttons: Shuffle, Import series, Close', () => {
    const win = createDefineRandomWindow(noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(3);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Shuffle', 'Import series', 'Close',
    ]);
  });

  it('contains plot container', () => {
    const win = createDefineRandomWindow(noop);
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is "random"', () => {
    const win = createDefineRandomWindow(noop);
    expect(win.id).toBe('random');
  });

  it('import button calls onImport callback', () => {
    const onImport = vi.fn();
    const win = createDefineRandomWindow({ onImport });
    const importBtn = win.element.querySelectorAll('.as-button-bar .as-btn')[1] as HTMLButtonElement;
    importBtn.click();
    expect(onImport).toHaveBeenCalledOnce();
    const item = onImport.mock.calls[0][0];
    expect(item.type).toBe('Series');
    expect(item.name).toBe('Random series');
    expect(item.index).toBeInstanceOf(Float64Array);
    expect(item.values).toBeInstanceOf(Float64Array);
  });

  it('snapshot of params and button bar', () => {
    const win = createDefineRandomWindow(noop);
    const params = win.element.querySelector('.as-params-group')!;
    expect(params.innerHTML).toMatchSnapshot();
    const buttons = win.element.querySelector('.as-button-bar')!;
    expect(buttons.innerHTML).toMatchSnapshot();
  });
});
