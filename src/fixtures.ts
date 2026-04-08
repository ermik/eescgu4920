/**
 * Shared test fixtures for browser tests.
 * Provides mock data factories with minimal valid data.
 */

import type {
  SeriesItem,
  FilterItem,
  SampleItem,
  InterpolationItem,
  Worksheet,
} from './types';

let counter = 0;
function nextId(): string {
  counter++;
  return `Id-TEST${String(counter).padStart(4, '0')}`;
}

export function resetFixtureIds(): void {
  counter = 0;
}

export function mockSeriesItem(overrides?: Partial<SeriesItem>): SeriesItem {
  const n = 5;
  return {
    id: nextId(),
    type: 'Series',
    name: 'Test Series',
    xLabel: 'Age (ka)',
    yLabel: 'δ18O',
    color: '#1f77b4',
    date: 'Created 2025/01/01 at 00:00:00',
    comment: '',
    history: '',
    index: Float64Array.from({ length: n }, (_, i) => i * 10),
    values: Float64Array.from({ length: n }, (_, i) => Math.sin(i)),
    ...overrides,
  };
}

export function mockFilterItem(overrides?: Partial<FilterItem>): FilterItem {
  return {
    id: nextId(),
    type: 'FILTER',
    name: 'Test Filter',
    date: 'Created 2025/01/01 at 00:00:00',
    comment: '',
    history: '',
    windowSize: 3,
    ...overrides,
  };
}

export function mockSampleItem(overrides?: Partial<SampleItem>): SampleItem {
  return {
    id: nextId(),
    type: 'SAMPLE',
    name: 'Test Sample',
    date: 'Created 2025/01/01 at 00:00:00',
    comment: '',
    history: '',
    step: 5,
    kind: 'linear',
    integrated: false,
    xCoords: null,
    ...overrides,
  };
}

export function mockInterpolationItem(
  overrides?: Partial<InterpolationItem>,
): InterpolationItem {
  return {
    id: nextId(),
    type: 'INTERPOLATION',
    name: 'Test Interpolation',
    date: 'Created 2025/01/01 at 00:00:00',
    comment: '',
    history: '',
    x1Coords: [0, 10, 20],
    x2Coords: [0, 12, 22],
    x1Name: 'Reference Age',
    ...overrides,
  };
}

export function mockWorksheet(overrides?: Partial<Worksheet>): Worksheet {
  return {
    id: nextId(),
    name: 'Test Worksheet',
    items: [],
    modified: false,
    ...overrides,
  };
}
