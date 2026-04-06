/**
 * Tests for saveApply.ts — creating InterpolationItems and interpolated series.
 */

import { describe, it, expect } from 'vitest';
import type { SeriesItem, InterpolationItem } from '../../../types.js';
import { InterpolationState } from '../state.js';
import {
  createInterpolationItem,
  createInterpolatedSeries,
  applyInterpolation,
} from '../saveApply.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeries(
  id: string,
  index: number[],
  values: number[],
  xLabel = 'Depth',
  yLabel = 'Value',
): SeriesItem {
  return {
    id,
    type: 'Series',
    name: `Series ${id}`,
    date: '',
    comment: '',
    history: '',
    xLabel,
    yLabel,
    color: '#1f77b4',
    index: new Float64Array(index),
    values: new Float64Array(values),
  };
}

let shapeCounter = 0;
function assignIds() {
  const n = shapeCounter++;
  return {
    vlineRef: `ref-${n}`,
    vlineDist: `dist-${n}`,
    overlayLineId: `overlay-${n}`,
  };
}

function setupStateWith2Connections(): InterpolationState {
  shapeCounter = 0;
  const ref = makeSeries('ref', [0, 50, 100, 150, 200], [1, 2, 3, 4, 5], 'Age (ka)');
  const dist = makeSeries('dist', [0, 100, 200, 300, 400], [1, 2, 3, 4, 5], 'Depth (cm)');
  const state = new InterpolationState(ref, dist);

  state.placePointer({ subplot: 0, x: 0, snapped: false, shapeId: 'r1' });
  state.placePointer({ subplot: 1, x: 0, snapped: false, shapeId: 'd1' });
  state.createConnection(assignIds);

  state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 'r2' });
  state.placePointer({ subplot: 1, x: 400, snapped: false, shapeId: 'd2' });
  state.createConnection(assignIds);

  return state;
}

// ---------------------------------------------------------------------------
// createInterpolationItem
// ---------------------------------------------------------------------------

describe('createInterpolationItem', () => {
  it('returns null with fewer than 2 connections', () => {
    shapeCounter = 0;
    const state = new InterpolationState(
      makeSeries('a', [0, 1], [0, 1]),
      makeSeries('b', [0, 1], [0, 1]),
    );
    expect(createInterpolationItem(state)).toBeNull();

    state.placePointer({ subplot: 0, x: 0, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 0, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);
    expect(createInterpolationItem(state)).toBeNull();
  });

  it('creates a valid InterpolationItem with 2+ connections', () => {
    const state = setupStateWith2Connections();
    const item = createInterpolationItem(state);

    expect(item).not.toBeNull();
    expect(item!.type).toBe('INTERPOLATION');
    expect(item!.x1Coords).toEqual([0, 200]);
    expect(item!.x2Coords).toEqual([0, 400]);
    expect(item!.x1Name).toBe('Age (ka)');
    expect(item!.id).toMatch(/^Id-[0-9A-F]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// createInterpolatedSeries
// ---------------------------------------------------------------------------

describe('createInterpolatedSeries', () => {
  it('returns null with fewer than 2 connections', () => {
    const state = new InterpolationState(
      makeSeries('a', [0, 1], [0, 1]),
      makeSeries('b', [0, 1], [0, 1]),
    );
    expect(createInterpolatedSeries(state, 'interp-id')).toBeNull();
  });

  it('creates a valid interpolated series', () => {
    const state = setupStateWith2Connections();
    const series = createInterpolatedSeries(state, 'interp-id');

    expect(series).not.toBeNull();
    expect(series!.type).toBe('Series interpolated');
    expect(series!.xLabel).toBe('Age (ka)'); // adopts reference xLabel
    expect(series!.yLabel).toBe('Value'); // keeps distorted yLabel
    expect(series!.index.length).toBe(5); // same length as distorted
    expect(series!.interpolation).toBeDefined();
    expect(series!.interpolation!.interpolationMode).toBe('Linear');
    expect(series!.interpolation!.x1Coords).toEqual([0, 200]);
    expect(series!.interpolation!.x2Coords).toEqual([0, 400]);
    expect(series!.interpolation!.xOriginalLabel).toBe('Depth (cm)');
    expect(series!.interpolation!.xOriginalValues.length).toBe(5);
  });

  it('transform maps tie-points correctly (linear: depth/2 = age)', () => {
    const state = setupStateWith2Connections();
    const series = createInterpolatedSeries(state, 'interp-id');

    // Tie-points: (age=0, depth=0) and (age=200, depth=400)
    // Linear transform: age = depth / 2
    // Distorted index [0, 100, 200, 300, 400] → [0, 50, 100, 150, 200]
    expect(series!.index[0]).toBeCloseTo(0, 10);
    expect(series!.index[1]).toBeCloseTo(50, 10);
    expect(series!.index[2]).toBeCloseTo(100, 10);
    expect(series!.index[3]).toBeCloseTo(150, 10);
    expect(series!.index[4]).toBeCloseTo(200, 10);
  });
});

// ---------------------------------------------------------------------------
// applyInterpolation
// ---------------------------------------------------------------------------

describe('applyInterpolation', () => {
  it('transforms a series using an existing InterpolationItem', () => {
    const interp: InterpolationItem = {
      id: 'Id-TESTTEST',
      type: 'INTERPOLATION',
      name: 'Test Interp',
      date: '',
      comment: '',
      history: '',
      x1Coords: [0, 100],
      x2Coords: [0, 200],
      x1Name: 'Age (ka)',
    };

    const series = makeSeries('src', [0, 50, 100, 150, 200], [10, 20, 30, 40, 50], 'Depth');
    const result = applyInterpolation(interp, series, 'Linear');

    expect(result.type).toBe('Series interpolated');
    expect(result.xLabel).toBe('Age (ka)');
    expect(result.index[0]).toBeCloseTo(0, 10);
    expect(result.index[2]).toBeCloseTo(50, 10);
    expect(result.index[4]).toBeCloseTo(100, 10);
    expect(result.interpolation).toBeDefined();
    expect(result.interpolation!.xOriginalLabel).toBe('Depth');
  });

  it('PCHIP mode produces smooth results that pass through tie-points', () => {
    const interp: InterpolationItem = {
      id: 'Id-TESTTEST',
      type: 'INTERPOLATION',
      name: 'Test Interp',
      date: '',
      comment: '',
      history: '',
      x1Coords: [0, 50, 100],
      x2Coords: [0, 100, 300],
      x1Name: 'Age',
    };

    const series = makeSeries('src', [0, 100, 300], [10, 20, 30]);
    const result = applyInterpolation(interp, series, 'PCHIP');

    // At tie-points, transform should be exact
    expect(result.index[0]).toBeCloseTo(0, 8);  // depth=0 → age=0
    expect(result.index[1]).toBeCloseTo(50, 8); // depth=100 → age=50
    expect(result.index[2]).toBeCloseTo(100, 8); // depth=300 → age=100
  });
});
