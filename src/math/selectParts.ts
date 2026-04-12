/**
 * Select Parts — extract portions of a series based on a condition
 * applied to a second (evaluation) series.
 *
 * Spec: PDF §11.1 (v2.0.8) — Select Part: extract where evaluation series
 * meets a condition (Y >, <, =, ≠ threshold).
 *
 * Both series must share the same evenly-spaced X axis.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';

export interface SelectPartsResult {
  /** X positions where the condition holds. */
  index: Float64Array;
  /** Y values from the *data* series at those positions. */
  values: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select portions of `dataValues` where `evalValues` meets the condition.
 *
 * Both series must have the same length (shared X axis).
 * Points that fail the condition are excluded from the result.
 *
 * @param index      Shared X positions.
 * @param dataValues Y values of the series to extract from.
 * @param evalValues Y values of the evaluation series (condition applied here).
 * @param condition  Comparison operator.
 * @param threshold  Threshold value for the comparison.
 */
export function selectParts(
  index: Float64Array,
  dataValues: Float64Array,
  evalValues: Float64Array,
  condition: SelectCondition,
  threshold: number,
): SelectPartsResult {
  if (index.length !== dataValues.length || index.length !== evalValues.length) {
    throw new RangeError('All arrays must have the same length.');
  }

  const test = makeTest(condition, threshold);

  const outIdx: number[] = [];
  const outVal: number[] = [];

  for (let i = 0; i < index.length; i++) {
    if (test(evalValues[i])) {
      outIdx.push(index[i]);
      outVal.push(dataValues[i]);
    }
  }

  return {
    index: new Float64Array(outIdx),
    values: new Float64Array(outVal),
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function makeTest(cond: SelectCondition, thresh: number): (v: number) => boolean {
  switch (cond) {
    case 'gt':  return (v) => v > thresh;
    case 'lt':  return (v) => v < thresh;
    case 'gte': return (v) => v >= thresh;
    case 'lte': return (v) => v <= thresh;
    case 'eq':  return (v) => v === thresh;
    case 'neq': return (v) => v !== thresh;
  }
}
