/**
 * Descriptive statistics for a data series, including correlation coefficients
 * and p-values.
 *
 * Spec: PDF §8.1 — Stats function produces mean, median, variance for X and Y
 * axes, plus Pearson and Spearman correlation coefficients with p-values.
 *
 * Reference: `displaySingleSeriesWindow.py` — a simpler subset (count,
 * replicates, missing, mean, median, min, max, std, quartiles, IQR).  This
 * module extends that set with variance, Pearson, and Spearman.
 *
 * The t-distribution CDF is provided by jstat.
 */

import jStat from 'jstat';

// ---------------------------------------------------------------------------
// Output interface
// ---------------------------------------------------------------------------

/**
 * Full descriptive statistics for a single series (index/values pair).
 *
 * Statistics that cannot be computed (e.g. variance of a constant series,
 * correlation for n < 2) are `NaN`.
 */
export interface SeriesStats {
  /** Total number of data points (including NaN values). */
  count: number;
  /**
   * Number of x-axis positions that appear more than once (number of groups
   * with duplicates, not the number of duplicate entries).
   */
  replicateCount: number;
  /** Number of NaN entries in the value array. */
  missingCount: number;

  /** Arithmetic mean of non-NaN values. */
  mean: number;
  /** Median of non-NaN values. */
  median: number;
  /** Minimum non-NaN value. */
  min: number;
  /** Maximum non-NaN value. */
  max: number;
  /** Sample standard deviation of non-NaN values (denominator n−1). */
  std: number;
  /** Sample variance of non-NaN values (denominator n−1). */
  variance: number;

  /** First quartile (25th percentile) of non-NaN values. */
  q25: number;
  /** Second quartile / median (50th percentile). */
  q50: number;
  /** Third quartile (75th percentile). */
  q75: number;
  /** Inter-quartile range: `q75 − q25`. */
  iqr: number;

  /**
   * Pearson product-moment correlation coefficient between index and values
   * (NaN pairs excluded).
   */
  pearson: number;
  /**
   * Two-tailed p-value for the Pearson correlation under the null hypothesis
   * H₀: ρ = 0, using the t-distribution approximation with n−2 degrees of
   * freedom.
   */
  pearsonPValue: number;

  /**
   * Spearman rank correlation coefficient (ties broken by average rank).
   */
  spearman: number;
  /**
   * Two-tailed p-value for the Spearman correlation (same t-distribution
   * approximation as Pearson).
   */
  spearmanPValue: number;
}

/**
 * Two-tailed p-value for a t-statistic with `df` degrees of freedom.
 *
 * Uses @stdlib/stats-base-dists-t-cdf for the cumulative distribution function.
 */
function tDistPValue(t: number, df: number): number {
  if (!isFinite(t)) return 0; // |r| → 1 → |t| → ∞ → p → 0
  return 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
}

// ---------------------------------------------------------------------------
// Internal: sorting / ranking helpers
// ---------------------------------------------------------------------------

/**
 * Return a sorted copy of `arr` (ascending).
 */
function sortedCopy(arr: number[]): number[] {
  return arr.slice().sort((a, b) => a - b);
}

/**
 * Compute the quantile at fractional position `p` ∈ [0, 1] using linear
 * interpolation between order statistics (equivalent to numpy's
 * `interpolation='linear'` / pandas default).
 *
 * @param sorted - Pre-sorted array of values.
 * @param p      - Quantile fraction in [0, 1].
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Assign average ranks to `data`, handling ties with the fractional midpoint
 * convention (equivalent to `scipy.stats.rankdata(method='average')`).
 *
 * @param data - Values to rank (may contain NaN, which receive `NaN` rank).
 * @returns Array of ranks parallel to `data`.
 */
function rankData(data: number[]): number[] {
  const n = data.length;
  const ranked = new Array<number>(n);

  // Build sorted index of non-NaN entries
  const validIdx = data
    .map((v, i) => ({ v, i }))
    .filter(e => !isNaN(e.v))
    .sort((a, b) => a.v - b.v);

  let i = 0;
  while (i < validIdx.length) {
    let j = i;
    // Find the extent of the tie group
    while (j < validIdx.length && validIdx[j].v === validIdx[i].v) j++;
    // Average rank for the group (1-based)
    const avgRank = (i + j + 1) / 2; // = (i+1 + j) / 2 zero-based midpoint, 1-based
    for (let k = i; k < j; k++) {
      ranked[validIdx[k].i] = avgRank;
    }
    i = j;
  }

  // NaN inputs get NaN rank
  for (let k = 0; k < n; k++) {
    if (isNaN(data[k])) ranked[k] = NaN;
  }

  return ranked;
}

// ---------------------------------------------------------------------------
// Internal: Pearson correlation core
// ---------------------------------------------------------------------------

/**
 * Compute the Pearson r between two arrays of the same length.
 *
 * NaN pairs are excluded list-wise (both must be finite).
 *
 * @returns `{ r, n }` where `n` is the number of valid pairs used.
 */
function pearsonCore(
  xs: number[],
  ys: number[],
): { r: number; n: number } {
  // Collect valid pairs
  const vx: number[] = [];
  const vy: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (isFinite(xs[i]) && isFinite(ys[i])) {
      vx.push(xs[i]);
      vy.push(ys[i]);
    }
  }

  const n = vx.length;
  if (n < 2) return { r: NaN, n };

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += vx[i]; sumY += vy[i]; }
  const mX = sumX / n;
  const mY = sumY / n;

  let ssXX = 0, ssYY = 0, ssXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = vx[i] - mX;
    const dy = vy[i] - mY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssXX === 0 || ssYY === 0) return { r: NaN, n };

  return { r: ssXY / Math.sqrt(ssXX * ssYY), n };
}

// ---------------------------------------------------------------------------
// Internal: count replicates
// ---------------------------------------------------------------------------

/**
 * Count how many distinct x values appear more than once in `index`.
 * Mirrors `(series.index.value_counts() > 1).sum()` from pandas.
 */
function countReplicates(index: Float64Array): number {
  const counts = new Map<number, number>();
  for (const x of index) {
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  let n = 0;
  for (const c of counts.values()) {
    if (c > 1) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full descriptive statistics for a series defined by parallel
 * `index` (x-axis) and `values` (y-axis) arrays.
 *
 * Most statistics operate on non-NaN values only.  Pearson and Spearman
 * use only pairs where both `index[i]` and `values[i]` are finite.
 *
 * @param index  - X positions (Float64Array).
 * @param values - Y values (Float64Array, same length).
 * @returns {@link SeriesStats} record.
 *
 * @throws {RangeError} If `index` and `values` have different lengths.
 */
export function computeStats(
  index: Float64Array,
  values: Float64Array,
): SeriesStats {
  if (index.length !== values.length) {
    throw new RangeError('index and values must have the same length.');
  }

  const count = values.length;
  const replicateCount = countReplicates(index);
  const missingCount = Array.from(values).filter(v => isNaN(v)).length;

  // Non-NaN values for univariate statistics
  const clean = Array.from(values).filter(v => !isNaN(v));
  const sorted = sortedCopy(clean);
  const n = sorted.length;

  const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : NaN;
  const med = quantile(sorted, 0.5);
  const min = n > 0 ? sorted[0] : NaN;
  const max = n > 0 ? sorted[n - 1] : NaN;

  let variance = NaN;
  let std = NaN;
  if (n > 1) {
    let ss = 0;
    for (const v of sorted) { const d = v - mean; ss += d * d; }
    variance = ss / (n - 1);
    std = Math.sqrt(variance);
  }

  const q25 = quantile(sorted, 0.25);
  const q50 = med;
  const q75 = quantile(sorted, 0.75);
  const iqr = n > 0 ? q75 - q25 : NaN;

  // Pearson correlation (index vs values, list-wise valid pairs)
  const { r: pearson, n: np } = pearsonCore(Array.from(index), Array.from(values));
  let pearsonPValue = NaN;
  if (!isNaN(pearson) && np >= 3) {
    const tStat = pearson * Math.sqrt((np - 2) / (1 - pearson * pearson));
    pearsonPValue = tDistPValue(tStat, np - 2);
  } else if (!isNaN(pearson) && Math.abs(pearson) === 1) {
    pearsonPValue = 0;
  }

  // Spearman correlation: Pearson on ranks
  const rankX = rankData(Array.from(index));
  const rankY = rankData(Array.from(values));
  const { r: spearman, n: ns } = pearsonCore(rankX, rankY);
  let spearmanPValue = NaN;
  if (!isNaN(spearman) && ns >= 3) {
    const tStat = spearman * Math.sqrt((ns - 2) / (1 - spearman * spearman));
    spearmanPValue = tDistPValue(tStat, ns - 2);
  } else if (!isNaN(spearman) && Math.abs(spearman) === 1) {
    spearmanPValue = 0;
  }

  return {
    count,
    replicateCount,
    missingCount,
    mean,
    median: med,
    min,
    max,
    std,
    variance,
    q25,
    q50,
    q75,
    iqr,
    pearson,
    pearsonPValue,
    spearman,
    spearmanPValue,
  };
}
