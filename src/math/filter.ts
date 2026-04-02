/**
 * Moving-average (smoothing) filter for unevenly or evenly spaced time series.
 *
 * Spec: PDF §8.2 — Smoothing with moving average.
 *
 * Reference: `defineFilterWindow.py` → `moving_average` static method.
 * The Python uses `np.convolve(values, np.ones(window_size), 'valid') /
 * window_size` and trims the index by `half_window` on each side.  This
 * implementation reproduces that behaviour exactly.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a symmetric moving-average filter to a time series.
 *
 * The filter computes the unweighted mean of each window of `windowSize`
 * consecutive *value* samples.  Because the window is centred, `half_window =
 * ⌊windowSize/2⌋` points are trimmed from each end of the index.
 *
 * The output is shorter than the input: `outputLength = n - windowSize + 1`,
 * where `n = values.length`.
 *
 * **Note**: This filter operates on the *position-in-array* (not on the actual
 * x-axis spacing), exactly as `np.convolve('valid')` does.  If the series is
 * unevenly spaced the resulting smoothed values are still meaningful (each is
 * the mean of its `windowSize` nearest samples), but the spatial interpretation
 * differs from a true kernel smoother.
 *
 * @param index      - Original x positions (Float64Array of length n).
 * @param values     - Original y values (Float64Array of length n).
 * @param windowSize - Number of points in the averaging window.  Must be a
 *                     positive odd integer ≥ 1.
 * @returns `{ index, values }` — the trimmed x positions and smoothed y
 *          values, each of length `n - windowSize + 1`.
 *
 * @throws {RangeError} If `windowSize` is not a positive odd integer, or if
 *                      `index` and `values` have different lengths, or if
 *                      `windowSize > n`.
 */
export function movingAverage(
  index: Float64Array,
  values: Float64Array,
  windowSize: number,
): { index: Float64Array; values: Float64Array } {
  if (index.length !== values.length) {
    throw new RangeError('index and values must have the same length.');
  }
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize % 2 === 0) {
    throw new RangeError(
      `windowSize must be a positive odd integer; received ${windowSize}.`,
    );
  }

  const n = values.length;

  // windowSize === 1: identity — no trimming
  if (windowSize === 1) {
    return { index: index.slice(), values: values.slice() };
  }

  if (windowSize > n) {
    throw new RangeError(
      `windowSize (${windowSize}) must not exceed the series length (${n}).`,
    );
  }

  const halfWindow = (windowSize - 1) / 2; // integer since windowSize is odd
  const outLen = n - windowSize + 1;        // = n - 2*halfWindow

  const outValues = new Float64Array(outLen);
  const outIndex = index.slice(halfWindow, n - halfWindow);

  // Compute the first window sum, then use a sliding window for O(n) total
  let windowSum = 0;
  for (let i = 0; i < windowSize; i++) {
    windowSum += values[i];
  }
  outValues[0] = windowSum / windowSize;

  for (let i = 1; i < outLen; i++) {
    windowSum += values[i + windowSize - 1];
    windowSum -= values[i - 1];
    outValues[i] = windowSum / windowSize;
  }

  return { index: outIndex, values: outValues };
}
