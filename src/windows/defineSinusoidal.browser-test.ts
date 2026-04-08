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

import { createDefineSinusoidalWindow } from './defineSinusoidal';
import { resetFixtureIds } from '../fixtures';

describe('createDefineSinusoidalWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onImport: () => {} };

  it('creates a div with expected classes', () => {
    const win = createDefineSinusoidalWindow(noop);
    expect(win.element.className).toBe('as-window as-define-sinusoidal-window');
  });

  it('has 3-column param grid with fieldsets', () => {
    const win = createDefineSinusoidalWindow(noop);
    const grid = win.element.querySelector('.as-sin-params')!;
    const fieldsets = grid.querySelectorAll('fieldset');
    expect(fieldsets.length).toBe(3);
    const legends = Array.from(fieldsets).map(
      (fs) => fs.querySelector('legend')!.textContent,
    );
    expect(legends).toEqual(['Domain', 'Sinusoid #1', 'Sinusoid #2']);
  });

  it('Domain fieldset has Start, End, Nb points, Noise σ', () => {
    const win = createDefineSinusoidalWindow(noop);
    const domainFs = win.element.querySelectorAll('fieldset')[0];
    const labels = Array.from(domainFs.querySelectorAll('label')).map(
      (l) => l.childNodes[0].textContent,
    );
    expect(labels).toEqual(['Start:', 'End:', 'Nb points:', 'Noise σ:']);
  });

  it('Sinusoid #1 fieldset has Freq, Amplitude, Phase', () => {
    const win = createDefineSinusoidalWindow(noop);
    const sin1Fs = win.element.querySelectorAll('fieldset')[1];
    const labels = Array.from(sin1Fs.querySelectorAll('label')).map(
      (l) => l.childNodes[0].textContent,
    );
    expect(labels).toEqual(['Freq:', 'Amplitude:', 'Phase:']);
  });

  it('has formula display', () => {
    const win = createDefineSinusoidalWindow(noop);
    const formula = win.element.querySelector('.as-formula')!;
    expect(formula).toBeTruthy();
    expect(formula.textContent).toContain('sin');
  });

  it('has 3 buttons: Generate, Import series, Close', () => {
    const win = createDefineSinusoidalWindow(noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(3);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Generate', 'Import series', 'Close',
    ]);
  });

  it('contains plot container', () => {
    const win = createDefineSinusoidalWindow(noop);
    expect(win.element.querySelector('.as-plot-container')).toBeTruthy();
  });

  it('window ID is "sinusoidal"', () => {
    const win = createDefineSinusoidalWindow(noop);
    expect(win.id).toBe('sinusoidal');
  });

  it('import button calls onImport callback', () => {
    const onImport = vi.fn();
    const win = createDefineSinusoidalWindow({ onImport });
    const importBtn = win.element.querySelectorAll('.as-button-bar .as-btn')[1] as HTMLButtonElement;
    importBtn.click();
    expect(onImport).toHaveBeenCalledOnce();
    const item = onImport.mock.calls[0][0];
    expect(item.type).toBe('Series');
    expect(item.name).toBe('Sinusoidal series');
  });

  it('snapshot of params grid and formula', () => {
    const win = createDefineSinusoidalWindow(noop);
    const grid = win.element.querySelector('.as-sin-params')!;
    expect(grid.innerHTML).toMatchSnapshot();
    const formula = win.element.querySelector('.as-formula')!;
    expect(formula.innerHTML).toMatchSnapshot();
  });
});
