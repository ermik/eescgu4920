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

import { createDefineInterpolationWindow } from './index';
import { mockSeriesItem, resetFixtureIds } from '../../fixtures';

describe('createDefineInterpolationWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = {
    onSaveInterpolation: () => {},
    onSaveInterpolationAndSeries: () => {},
  };

  function makeItems(n: number) {
    return Array.from({ length: n }, (_, i) =>
      mockSeriesItem({ name: `S${i + 1}`, xLabel: `X${i + 1}`, yLabel: `Y${i + 1}` }),
    );
  }

  it('creates a div with expected classes', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    expect(win.element.className).toContain('as-define-interpolation-window');
  });

  it('has 3 tabs: Plots, Pointers, Pointers Plot', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const tabs = win.element.querySelectorAll('.as-tab-bar > *');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toBe('Plots');
    expect(tabs[1].textContent).toBe('Pointers');
    expect(tabs[2].textContent).toBe('Pointers Plot');
  });

  it('Plots tab is active by default', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const tabs = win.element.querySelectorAll('.as-tab-bar > *');
    expect(tabs[0].classList.contains('as-tab-active')).toBe(true);
  });

  it('has reference and distorted series dropdowns', () => {
    const items = makeItems(3);
    const win = createDefineInterpolationWindow(items, noop);
    const selects = win.element.querySelectorAll('select');
    // ref select, dist select, interpolation mode select
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it('has interpolation mode select with Linear and PCHIP', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const selects = win.element.querySelectorAll('select');
    // The third select is the interpolation mode
    const modeSelect = selects[2];
    expect(modeSelect.options.length).toBe(2);
    expect(modeSelect.options[0].value).toBe('Linear');
    expect(modeSelect.options[1].value).toBe('PCHIP');
  });

  it('has show interpolated curve checkbox', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const cb = win.element.querySelector('#show-interp-cb') as HTMLInputElement;
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(true);
  });

  it('has action buttons', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const buttons = win.element.querySelectorAll('.as-btn');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('Remove last connection');
    expect(labels).toContain('Save interpolation');
    expect(labels).toContain('Save interpolation and series');
    expect(labels).toContain('Close');
  });

  it('has status bar area', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const statusBar = win.element.querySelector('.as-status-msg');
    expect(statusBar).toBeTruthy();
  });

  it('has plot container', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('snapshot of tab bar', () => {
    const win = createDefineInterpolationWindow(makeItems(2), noop);
    const tabBar = win.element.querySelector('.as-tab-bar')!;
    expect(tabBar.innerHTML).toMatchSnapshot();
  });
});
