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

import { createDisplayInfoWindow } from './displayInfo';
import {
  mockFilterItem,
  mockSampleItem,
  mockInterpolationItem,
  resetFixtureIds,
} from '../fixtures';

describe('createDisplayInfoWindow', () => {
  afterEach(() => resetFixtureIds());

  describe('FilterItem', () => {
    it('creates window with Parameters and Info tabs', () => {
      const win = createDisplayInfoWindow(mockFilterItem());
      const tabs = win.element.querySelectorAll('.as-tab-inner');
      expect(tabs.length).toBe(2);
      expect(Array.from(tabs).map((t) => t.textContent)).toEqual(['Parameters', 'Info']);
    });

    it('parameters tab shows window size', () => {
      const win = createDisplayInfoWindow(mockFilterItem({ windowSize: 7 }));
      const text = win.element.textContent!;
      expect(text).toContain('7');
      expect(text).toContain('Moving average window size');
    });

    it('window ID is info-{itemId}', () => {
      const item = mockFilterItem();
      const win = createDisplayInfoWindow(item);
      expect(win.id).toBe('info-' + item.id);
    });
  });

  describe('SampleItem', () => {
    it('creates window with Parameters and Info tabs', () => {
      const win = createDisplayInfoWindow(mockSampleItem());
      const tabs = win.element.querySelectorAll('.as-tab-inner');
      expect(tabs.length).toBe(2);
      expect(Array.from(tabs).map((t) => t.textContent)).toEqual(['Parameters', 'Info']);
    });

    it('sample tab shows step and kind', () => {
      const win = createDisplayInfoWindow(
        mockSampleItem({ step: 25, kind: 'cubic', integrated: true }),
      );
      const text = win.element.textContent!;
      expect(text).toContain('25');
      expect(text).toContain('cubic');
      expect(text).toContain('yes');
    });

    it('shows X Sampling Coordinates tab when xCoords present', () => {
      const win = createDisplayInfoWindow(
        mockSampleItem({ step: null, xCoords: [0, 5, 10] }),
      );
      const tabs = win.element.querySelectorAll('.as-tab-inner');
      expect(tabs.length).toBe(3);
      expect(tabs[1].textContent).toBe('X Sampling Coordinates');
    });
  });

  describe('InterpolationItem', () => {
    it('creates window with Pointers, Pointers Plot, and Info tabs', () => {
      const win = createDisplayInfoWindow(mockInterpolationItem());
      const tabs = win.element.querySelectorAll('.as-tab-inner');
      expect(tabs.length).toBe(3);
      expect(Array.from(tabs).map((t) => t.textContent)).toEqual([
        'Pointers', 'Pointers Plot', 'Info',
      ]);
    });

    it('pointers tab shows tie-point coordinates', () => {
      const item = mockInterpolationItem({
        x1Coords: [0, 10, 20],
        x2Coords: [0, 12, 22],
      });
      const win = createDisplayInfoWindow(item);
      const text = win.element.textContent!;
      expect(text).toContain('10');
      expect(text).toContain('12');
    });
  });

  it('snapshot of filter info tab bar', () => {
    const win = createDisplayInfoWindow(mockFilterItem());
    const tabBar = win.element.querySelector('.as-tab-inner-bar')!;
    expect(tabBar.innerHTML).toMatchSnapshot();
  });
});
