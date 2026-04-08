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

import { createDefineInsolationWindow } from './defineInsolation';
import { resetFixtureIds } from '../fixtures';

describe('createDefineInsolationWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onImport: () => {} };

  it('creates a div with expected classes', () => {
    const win = createDefineInsolationWindow(noop);
    expect(win.element.className).toBe('as-window as-define-insolation-window');
  });

  it('has type select with orbital and insolation options', () => {
    const win = createDefineInsolationWindow(noop);
    const selects = win.element.querySelectorAll('select');
    const typeSelect = selects[0];
    const enabledOptions = Array.from(typeSelect.options)
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    expect(enabledOptions).toContain('Eccentricity');
    expect(enabledOptions).toContain('Daily insolation');
    expect(enabledOptions).toContain('Caloric summer insolation');
  });

  it('has solution select with 8 solutions', () => {
    const win = createDefineInsolationWindow(noop);
    const selects = win.element.querySelectorAll('select');
    const solSelect = selects[1];
    expect(solSelect.options.length).toBe(8);
    expect(solSelect.options[0].value).toBe('Berger1978');
    expect(solSelect.options[3].value).toBe('Laskar2004');
  });

  it('has time params: start, end, step', () => {
    const win = createDefineInsolationWindow(noop);
    const inputs = win.element.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('has reference text section', () => {
    const win = createDefineInsolationWindow(noop);
    const refSection = win.element.querySelector('.as-insolation-ref')!;
    expect(refSection).toBeTruthy();
    expect(refSection.textContent).toContain('Berger');
  });

  it('has 2 buttons: Import series, Close', () => {
    const win = createDefineInsolationWindow(noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Import series', 'Close',
    ]);
  });

  it('contains plot container', () => {
    const win = createDefineInsolationWindow(noop);
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is "insolation"', () => {
    const win = createDefineInsolationWindow(noop);
    expect(win.id).toBe('insolation');
  });

  it('snapshot of button bar', () => {
    const win = createDefineInsolationWindow(noop);
    const buttonBar = win.element.querySelector('.as-button-bar')!;
    expect(buttonBar.innerHTML).toMatchSnapshot();
  });
});
