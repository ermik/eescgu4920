/**
 * Selection validation helpers for menu actions.
 *
 * Each validator inspects the current tree selection, checks type/count
 * constraints, and either returns the validated items or shows a status
 * message and returns null.
 */

import type { TreeWidget } from './tree';
import type {
  WorksheetItem,
  SeriesItem,
  FilterItem,
  SampleItem,
  InterpolationItem,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSeriesItem(item: WorksheetItem): item is SeriesItem {
  return (
    item.type === 'Series' ||
    item.type === 'Series filtered' ||
    item.type === 'Series sampled' ||
    item.type === 'Series interpolated'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get selected items filtered by type discriminant. */
export function getSelectedByType(
  tree: TreeWidget,
  type: string,
): { wsId: string; item: WorksheetItem }[] {
  return tree
    .getUniqueSelectedItems()
    .filter((e) => e.item.type === type);
}

/** Validate selection for Display operations: >= 1 series required. */
export function validateDisplaySelection(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): SeriesItem[] | null {
  const selected = tree.getUniqueSelectedItems();
  const series = selected.filter((e) => isSeriesItem(e.item)).map((e) => e.item as SeriesItem);
  if (series.length === 0) {
    showMessage('No series selected.');
    return null;
  }
  return series;
}

/** Validate selection for Define Filter: exactly 1 series. */
export function validateFilterSelection(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): { wsId: string; item: SeriesItem } | null {
  const selected = tree.getUniqueSelectedItems();
  const series = selected.filter((e) => isSeriesItem(e.item));
  if (series.length !== 1) {
    showMessage('Select exactly 1 series to define a filter.');
    return null;
  }
  return { wsId: series[0].wsId, item: series[0].item as SeriesItem };
}

/** Validate selection for Apply Filter: 1 FILTER + >= 1 series. */
export function validateApplyFilter(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): { filter: FilterItem; series: { wsId: string; item: SeriesItem }[] } | null {
  const selected = tree.getUniqueSelectedItems();
  const filters = selected.filter((e) => e.item.type === 'FILTER');
  const series = selected.filter((e) => isSeriesItem(e.item));
  if (filters.length !== 1 || series.length === 0) {
    showMessage('Select 1 FILTER item and at least 1 series to apply a filter.');
    return null;
  }
  return {
    filter: filters[0].item as FilterItem,
    series: series.map((e) => ({ wsId: e.wsId, item: e.item as SeriesItem })),
  };
}

/** Validate selection for Define Sample: 1-2 series. */
export function validateSampleSelection(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): { wsId: string; items: SeriesItem[] } | null {
  const selected = tree.getUniqueSelectedItems();
  const series = selected.filter((e) => isSeriesItem(e.item));
  if (series.length < 1 || series.length > 2) {
    showMessage('Select 1 or 2 series to define sampling.');
    return null;
  }
  return {
    wsId: series[0].wsId,
    items: series.map((e) => e.item as SeriesItem),
  };
}

/** Validate selection for Apply Sample: 1 SAMPLE + >= 1 series. */
export function validateApplySample(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): { sample: SampleItem; series: { wsId: string; item: SeriesItem }[] } | null {
  const selected = tree.getUniqueSelectedItems();
  const samples = selected.filter((e) => e.item.type === 'SAMPLE');
  const series = selected.filter((e) => isSeriesItem(e.item));
  if (samples.length !== 1 || series.length === 0) {
    showMessage('Select 1 SAMPLE item and at least 1 series to apply sampling.');
    return null;
  }
  return {
    sample: samples[0].item as SampleItem,
    series: series.map((e) => ({ wsId: e.wsId, item: e.item as SeriesItem })),
  };
}

/**
 * Validate selection for Define Interpolation: >= 2 series required,
 * optionally 1 INTERPOLATION to load existing tie-points.
 */
export function validateInterpolationSelection(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): {
  wsId: string;
  items: SeriesItem[];
  existingInterp: InterpolationItem | null;
} | null {
  const selected = tree.getUniqueSelectedItems();
  const series = selected.filter((e) => isSeriesItem(e.item));
  const interps = selected.filter((e) => e.item.type === 'INTERPOLATION');
  if (series.length < 2) {
    showMessage('Select at least 2 series to define interpolation.');
    return null;
  }
  if (interps.length > 1) {
    showMessage('Select at most 1 INTERPOLATION item.');
    return null;
  }
  return {
    wsId: series[0].wsId,
    items: series.map((e) => e.item as SeriesItem),
    existingInterp:
      interps.length === 1 ? (interps[0].item as InterpolationItem) : null,
  };
}

/**
 * Validate selection for Apply Interpolation: 1 INTERPOLATION + >= 1 series.
 */
export function validateApplyInterpolation(
  tree: TreeWidget,
  showMessage: (msg: string) => void,
): {
  interp: InterpolationItem;
  series: { wsId: string; item: SeriesItem }[];
} | null {
  const selected = tree.getUniqueSelectedItems();
  const interps = selected.filter((e) => e.item.type === 'INTERPOLATION');
  const series = selected.filter((e) => isSeriesItem(e.item));
  if (interps.length !== 1 || series.length === 0) {
    showMessage(
      'Select 1 INTERPOLATION item and at least 1 series to apply interpolation.',
    );
    return null;
  }
  return {
    interp: interps[0].item as InterpolationItem,
    series: series.map((e) => ({ wsId: e.wsId, item: e.item as SeriesItem })),
  };
}
