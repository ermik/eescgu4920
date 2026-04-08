import { describe, test, expect } from 'vitest';
import type {
  WorksheetItem,
  SeriesItem,
  FilterItem,
  SampleItem,
  InterpolationItem,
} from './types';

describe('Types', () => {
  test('construct SeriesItem and narrow discriminated union', () => {
    const series: SeriesItem = {
      id: 'Id-AABBCCDD',
      type: 'Series',
      name: 'Test Series',
      date: '2024/01/01',
      comment: '',
      history: '',
      xLabel: 'Depth (m)',
      yLabel: 'δ18O',
      color: '#1f77b4',
      index: new Float64Array([1, 2, 3]),
      values: new Float64Array([10, 20, 30]),
    };

    const item: WorksheetItem = series;
    expect(item.type).toBe('Series');

    if (item.type === 'Series') {
      expect(item.index.length).toBe(3);
      expect(item.color).toBe('#1f77b4');
    }
  });

  test('construct FilterItem', () => {
    const filter: FilterItem = {
      id: 'Id-11223344',
      type: 'FILTER',
      name: 'MA-5',
      date: '',
      comment: '',
      history: '',
      windowSize: 5,
    };
    const item: WorksheetItem = filter;
    expect(item.type).toBe('FILTER');
    if (item.type === 'FILTER') {
      expect(item.windowSize).toBe(5);
    }
  });

  test('construct SampleItem (step mode)', () => {
    const sample: SampleItem = {
      id: 'Id-AABBCCDD',
      type: 'SAMPLE',
      name: 'Resample 0.5ka',
      date: '',
      comment: '',
      history: '',
      step: 0.5,
      kind: 'linear',
      integrated: false,
      xCoords: null,
    };
    const item: WorksheetItem = sample;
    expect(item.type).toBe('SAMPLE');
  });

  test('construct InterpolationItem', () => {
    const interp: InterpolationItem = {
      id: 'Id-AABBCCDD',
      type: 'INTERPOLATION',
      name: 'Age model',
      date: '',
      comment: '',
      history: '',
      x1Coords: [0, 10, 20],
      x2Coords: [0, 5, 15],
      x1Name: 'Age (ka)',
    };
    const item: WorksheetItem = interp;
    expect(item.type).toBe('INTERPOLATION');
  });

  test('SeriesItem with InterpolationOverlay', () => {
    const series: SeriesItem = {
      id: 'Id-AABBCCDD',
      type: 'Series interpolated',
      name: 'Re-referenced',
      date: '',
      comment: '',
      history: '',
      xLabel: 'Age (ka)',
      yLabel: 'δ18O',
      color: '#ff7f0e',
      index: new Float64Array([0, 5, 10]),
      values: new Float64Array([1, 2, 3]),
      interpolation: {
        interpolationMode: 'PCHIP',
        x1Coords: [0, 10],
        x2Coords: [0, 20],
        xOriginalLabel: 'Depth (m)',
        xOriginalValues: new Float64Array([0, 10, 20]),
      },
    };
    expect(series.interpolation?.interpolationMode).toBe('PCHIP');
    expect(series.interpolation?.xOriginalValues.length).toBe(3);
  });
});
