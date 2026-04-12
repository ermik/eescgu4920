/**
 * Histogram computation for time series data.
 *
 * Spec: PDF §11.1 (v2.0.8) — Histogram with configurable bin range, step,
 * output as probability density or cumulative probability.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HistogramMode = 'counts' | 'probability-density' | 'cumulative-probability';

export interface HistogramOptions {
  /** Bin width (default: auto from Freedman-Diaconis rule). */
  binWidth?: number;
  /** Lower bound of the histogram range (default: min of data). */
  rangeMin?: number;
  /** Upper bound of the histogram range (default: max of data). */
  rangeMax?: number;
  /** Output mode (default: 'probability-density'). */
  mode?: HistogramMode;
}

export interface HistogramResult {
  /** Bin centers. */
  binCenters: Float64Array;
  /** Bin values (counts, density, or cumulative probability). */
  values: Float64Array;
  /** Bin edges (length = binCenters.length + 1). */
  binEdges: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a histogram of the values in a series.
 *
 * NaN values are excluded.
 *
 * @param values  Input data (Float64Array).
 * @param options Bin configuration and output mode.
 */
export function histogram(
  values: Float64Array,
  options: HistogramOptions = {},
): HistogramResult {
  // Filter NaN
  const clean: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (!isNaN(values[i])) clean.push(values[i]);
  }
  if (clean.length === 0) {
    return {
      binCenters: new Float64Array(0),
      values: new Float64Array(0),
      binEdges: new Float64Array(0),
    };
  }

  clean.sort((a, b) => a - b);
  const N = clean.length;

  const {
    mode = 'probability-density',
    rangeMin = clean[0],
    rangeMax = clean[N - 1],
  } = options;

  // Auto bin width via Freedman-Diaconis rule
  let binWidth = options.binWidth;
  if (binWidth === undefined || binWidth <= 0) {
    const q25 = quantile(clean, 0.25);
    const q75 = quantile(clean, 0.75);
    const iqr = q75 - q25;
    binWidth = iqr > 0
      ? 2 * iqr * Math.pow(N, -1 / 3)
      : (rangeMax - rangeMin) / Math.max(1, Math.ceil(Math.sqrt(N)));
    if (binWidth <= 0) binWidth = 1;
  }

  // Build bins
  const lo = rangeMin;
  const hi = rangeMax;
  const nBins = Math.max(1, Math.ceil((hi - lo) / binWidth));
  const actualWidth = (hi - lo) / nBins;

  const binEdges = new Float64Array(nBins + 1);
  for (let i = 0; i <= nBins; i++) binEdges[i] = lo + i * actualWidth;

  const binCenters = new Float64Array(nBins);
  for (let i = 0; i < nBins; i++) binCenters[i] = (binEdges[i] + binEdges[i + 1]) / 2;

  // Count
  const counts = new Float64Array(nBins);
  for (const v of clean) {
    if (v < lo || v > hi) continue;
    let bin = Math.floor((v - lo) / actualWidth);
    if (bin >= nBins) bin = nBins - 1; // include right edge in last bin
    if (bin < 0) bin = 0;
    counts[bin]++;
  }

  // Output
  const result = new Float64Array(nBins);

  switch (mode) {
    case 'counts':
      result.set(counts);
      break;

    case 'probability-density':
      for (let i = 0; i < nBins; i++) {
        result[i] = counts[i] / (N * actualWidth);
      }
      break;

    case 'cumulative-probability': {
      let cumulative = 0;
      for (let i = 0; i < nBins; i++) {
        cumulative += counts[i];
        result[i] = cumulative / N;
      }
      break;
    }
  }

  return { binCenters, values: result, binEdges };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}
