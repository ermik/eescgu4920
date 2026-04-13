/**
 * Core data model types for the AnalySeries browser application.
 *
 * Item shapes are derived from the PyAnalySeries load_WorkSheet / save_WorkSheet
 * functions (PyAnalySeries.py lines 352–700) and the runtime add_item_tree_widget
 * function (lines 120–201).
 *
 * Items live inside a Worksheet and are stored as a discriminated union so that
 * TypeScript exhaustiveness checks work across the codebase.
 */

// ---------------------------------------------------------------------------
// Discriminant string literals
// ---------------------------------------------------------------------------

/** All legal `type` values for worksheet items. */
export type ItemType =
  | 'Series'
  | 'Series filtered'
  | 'Series sampled'
  | 'Series interpolated'
  | 'FILTER'
  | 'SAMPLE'
  | 'INTERPOLATION';

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/**
 * Fields shared by every item that can appear in a worksheet.
 *
 * `history` is an HTML string that accumulates a provenance trail of every
 * operation applied to derive this item.  New entries are appended with
 * {@link appendHistory} from utils.ts.
 */
export interface BaseItem {
  /** Unique identifier, format `"Id-XXXXXXXX"` (8 uppercase hex characters). */
  readonly id: string;
  /** Discriminant tag; see {@link ItemType}. */
  readonly type: ItemType;
  /** Human-readable display name, editable by the user. */
  name: string;
  /** ISO-style creation timestamp string, e.g. `"Created 2024/11/01 at 14:32:00"`. */
  date: string;
  /** Free-form user comment. */
  comment: string;
  /** HTML provenance trail accumulated via {@link appendHistory}. */
  history: string;
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * Extra fields present only on a series that has been re-referenced via an
 * interpolation (i.e. `type === 'Series interpolated'`).
 *
 * The interpolation maps the series' original x-axis (`xOriginalLabel`) to the
 * new x-axis using tie-point pairs (`x1Coords` → `x2Coords`).
 */
export interface InterpolationOverlay {
  /** `'Linear'` or `'PCHIP'`. */
  interpolationMode: 'Linear' | 'PCHIP';
  /** Tie-point positions on the *new* x-axis (the series' current x). */
  x1Coords: number[];
  /** Corresponding tie-point positions on the *original* x-axis. */
  x2Coords: number[];
  /** Column label of the original x-axis before interpolation. */
  xOriginalLabel: string;
  /**
   * Original x values parallel to `index` (same length).  Used to render a
   * secondary x-axis in the display window.
   */
  xOriginalValues: Float64Array;
}

/**
 * A time series item.
 *
 * `index` and `values` are parallel Float64Arrays (same length).  Duplicate
 * index entries are legal; consumers should average them with groupByMean
 * before performing interpolation.
 *
 * Discriminant `type` is one of `'Series'`, `'Series filtered'`,
 * `'Series sampled'`, or `'Series interpolated'`.
 */
export interface SeriesItem extends BaseItem {
  readonly type: 'Series' | 'Series filtered' | 'Series sampled' | 'Series interpolated';
  /** Column label for the x-axis (depth, age, …). */
  xLabel: string;
  /** Column label for the y-axis (proxy value). */
  yLabel: string;
  /** CSS hex colour string used for rendering, e.g. `"#1f77b4"`. */
  color: string;
  /** True when the series has duplicate X values (replicates). */
  hasReplicates?: boolean;
  /** X coordinates (the series index). */
  index: Float64Array;
  /** Y values parallel to `index`. */
  values: Float64Array;
  /**
   * Present only when `type === 'Series interpolated'`.
   * Carries the tie-point coordinates and original-axis info needed to draw
   * a secondary x-axis.
   */
  interpolation?: InterpolationOverlay;
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * A moving-average filter definition.
 *
 * In PyAnalySeries the window size was stored as a raw string in `Parameters`;
 * here it is a proper typed number.
 */
export interface FilterItem extends BaseItem {
  readonly type: 'FILTER';
  /** Symmetric window size; must be a positive odd integer ≥ 1. */
  windowSize: number;
}

// ---------------------------------------------------------------------------
// Sample
// ---------------------------------------------------------------------------

/**
 * A resampling definition.
 *
 * Exactly one of `step` (for evenly-spaced resampling) or `xCoords` (for
 * resampling to another series' grid) will be non-null, mirroring the two
 * radio-button modes in `defineSampleWindow.py`.
 */
export interface SampleItem extends BaseItem {
  readonly type: 'SAMPLE';
  /**
   * Sampling interval.  Non-null when the user chose "Sampling with step".
   * Null when using explicit x-coordinate list.
   */
  step: number | null;
  /** Interpolation method used during resampling. */
  kind: 'nearest' | 'zero' | 'linear' | 'quadratic' | 'cubic';
  /** Whether integration-based averaging was used instead of point sampling. */
  integrated: boolean;
  /**
   * Explicit x coordinates used as sample points.  Non-null when the user
   * chose "Sampling using x values of series".  Null for step-based sampling.
   */
  xCoords: number[] | null;
}

// ---------------------------------------------------------------------------
// Interpolation (tie-point set)
// ---------------------------------------------------------------------------

/**
 * A set of tie-point pairs that define a depth-to-age (or other) mapping.
 *
 * `x1Coords[i]` on the reference axis maps to `x2Coords[i]` on the distorted
 * axis.  Both arrays must have the same length and at least 2 entries for the
 * interpolation to be well-defined.
 */
export interface InterpolationItem extends BaseItem {
  readonly type: 'INTERPOLATION';
  /** Tie-point positions on the reference (x1) axis. */
  x1Coords: number[];
  /** Corresponding tie-point positions on the distorted (x2) axis. */
  x2Coords: number[];
  /** Column label of the reference axis, shown in the UI. */
  x1Name: string;
}

// ---------------------------------------------------------------------------
// Discriminated union & worksheet
// ---------------------------------------------------------------------------

/** Union of all item types that can live inside a {@link Worksheet}. */
export type WorksheetItem =
  | SeriesItem
  | FilterItem
  | SampleItem
  | InterpolationItem;

/**
 * Type guard: is this a series-typed item (plain, filtered, sampled, or
 * interpolated)? Used throughout main.ts to gate menu items and handlers that
 * operate on "any series" regardless of how it was produced.
 */
export function isSeriesItem(item: WorksheetItem): item is SeriesItem {
  return item.type === 'Series'
    || item.type === 'Series filtered'
    || item.type === 'Series sampled'
    || item.type === 'Series interpolated';
}

/**
 * A worksheet groups a related set of series, filters, samples, and
 * interpolation definitions together, analogous to an `.xlsx` workbook file
 * in PyAnalySeries.
 */
export interface Worksheet {
  /** Unique worksheet identifier. */
  readonly id: string;
  /** Display name / filename of the worksheet. */
  name: string;
  /** All items belonging to this worksheet, in display order. */
  items: WorksheetItem[];
  /** True when the worksheet has unsaved changes. */
  modified: boolean;
}
