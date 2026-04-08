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

import { createDefineSampleWindow } from './defineSample';
import { mockSeriesItem, resetFixtureIds } from '../fixtures';

describe('createDefineSampleWindow', () => {
  afterEach(() => resetFixtureIds());

  const noop = { onSaveSample: () => {}, onSaveSampleAndSeries: () => {} };

  it('creates a div with expected classes', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    expect(win.element.className).toBe('as-window as-define-sample-window');
  });

  it('has radio buttons for sampling mode', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const radios = win.element.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    expect((radios[0] as HTMLInputElement).value).toBe('step');
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    expect((radios[1] as HTMLInputElement).value).toBe('xvals');
  });

  it('has kind select with 5 interpolation methods', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const select = win.element.querySelector('select')!;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['nearest', 'zero', 'linear', 'quadratic', 'cubic']);
    expect(select.value).toBe('linear');
  });

  it('has integration checkbox', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const checkbox = win.element.querySelector('#sample-int') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.checked).toBe(false);
  });

  it('xvals radio disabled when 1 series', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const xvalsRadio = win.element.querySelector('#radio-xvals') as HTMLInputElement;
    expect(xvalsRadio.disabled).toBe(true);
  });

  it('xvals radio enabled when 2 series', () => {
    const win = createDefineSampleWindow(
      [mockSeriesItem(), mockSeriesItem({ name: 'Series B' })],
      noop,
    );
    const xvalsRadio = win.element.querySelector('#radio-xvals') as HTMLInputElement;
    expect(xvalsRadio.disabled).toBe(false);
  });

  it('shows series dropdown when 2 series', () => {
    const items = [mockSeriesItem({ name: 'A' }), mockSeriesItem({ name: 'B' })];
    const win = createDefineSampleWindow(items, noop);
    const selects = win.element.querySelectorAll('select');
    // First select is the series selector, second is the kind dropdown
    expect(selects.length).toBe(2);
  });

  it('has 3 buttons', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const buttons = win.element.querySelectorAll('.as-button-bar .as-btn');
    expect(buttons.length).toBe(3);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      'Save sample', 'Save sample and series sampled', 'Close',
    ]);
  });

  it('snapshot of params panel', () => {
    const win = createDefineSampleWindow([mockSeriesItem()], noop);
    const params = win.element.querySelector('.as-params-group')!;
    expect(params.innerHTML).toMatchSnapshot();
  });
});
