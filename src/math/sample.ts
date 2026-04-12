/**
 * Resampling with interpolation and optional integration-based averaging.
 *
 * Spec: PDF §8.1 — New Sampling supports evenly-spaced resampling or
 * resampling to another series' grid, with multiple interpolation methods and
 * an integration option.
 *
 * Reference: `defineSampleWindow.py` → `sample` static method.
 *
 * **Deviations from the Python reference**:
 * - The Python integration path drops the first/last sample point whenever the
 *   extended interval edge falls outside the data range.  This implementation
 *   preserves that behaviour (clipping at `[x_min, x_max]` but dropping rather
 *   than truncating the interval) because clipping introduces bias for
 *   unevenly spaced data.
 * - `quadratic` uses local three-point Lagrange interpolation (rather than a
 *   global quadratic spline) for simplicity.  For paleoclimate resampling the
 *   difference is negligible.
 * - `cubic` uses a natural cubic spline (Thomas-algorithm tridiagonal solve)
 *   rather than pandas' UnivariateSpline, which is the same algorithm.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

import { createLinearInterpFn } from './interp.js';

// ---------------------------------------------------------------------------
// 20-point Gauss–Legendre quadrature constants on [-1, 1]
// ---------------------------------------------------------------------------
// These are the standard GL-20 nodes and weights from Abramowitz & Stegun.
// The 10 positive abscissas are listed; their negatives complete the set.
// Weights are for the positive nodes only; each negative node has the same weight.
// Total weight = 2.0  ✓

const GL20_ABSCISSAS: readonly number[] = [
  0.07652651203010607,
  0.22778585114164506,
  0.37370608871541955,
  0.51086700195082710,
  0.63605368072651502,
  0.74630312469390371,
  0.83911697182221882,
  0.91223442825132591,
  0.96397192727791384,
  0.99312859918509492,
];

const GL20_WEIGHTS: readonly number[] = [
  0.15275338713072585,
  0.14917298647260374,
  0.14209610931838205,
  0.13168863844917660,
  0.11819453196151841,
  0.10193011981724040,
  0.08327674157670475,
  0.06267204833410906,
  0.04060142980038694,
  0.01761400713915212,
];

// ---------------------------------------------------------------------------
// Internal: duplicate removal
// ---------------------------------------------------------------------------

/**
 * Sort a series by index and replace duplicate index values with their mean.
 *
 * This is the TypeScript equivalent of pandas `groupby(series.index).mean()`.
 * NaN values at a given index position are excluded from the mean; if all
 * values for a position are NaN the result is NaN.
 *
 * @param index  - X positions (Float64Array).
 * @param values - Y values parallel to `index`.
 * @returns Sorted, deduplicated `{ index, values }` arrays.
 */
function groupByMean(
  index: Float64Array,
  values: Float64Array,
): { index: Float64Array; values: Float64Array } {
  const n = index.length;
  if (n === 0) return { index: new Float64Array(0), values: new Float64Array(0) };

  // Sort by index
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => index[a] - index[b]);

  const si = new Float64Array(n);
  const sv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    si[i] = index[order[i]];
    sv[i] = values[order[i]];
  }

  // Group consecutive equal indices, averaging y (ignoring NaN)
  const outIndex: number[] = [];
  const outValues: number[] = [];

  let i = 0;
  while (i < n) {
    let j = i;
    let sum = 0;
    let count = 0;
    while (j < n && si[j] === si[i]) {
      if (!isNaN(sv[j])) { sum += sv[j]; count++; }
      j++;
    }
    outIndex.push(si[i]);
    outValues.push(count > 0 ? sum / count : NaN);
    i = j;
  }

  return {
    index: new Float64Array(outIndex),
    values: new Float64Array(outValues),
  };
}

// ---------------------------------------------------------------------------
// Internal: interpolation helpers
// ---------------------------------------------------------------------------

/**
 * Binary search: largest `k` such that `xs[k] <= x`.
 * Returns -1 when `x < xs[0]`, and `n-1` when `x >= xs[n-1]`.
 */
function lowerBound(xs: Float64Array, x: number): number {
  if (x < xs[0]) return -1;
  if (x >= xs[xs.length - 1]) return xs.length - 1;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Nearest-neighbour interpolation.  Returns `y[argmin |xi - x|]`. */
function nearestInterp(xs: Float64Array, ys: Float64Array, x: number): number {
  const k = lowerBound(xs, x);
  if (k < 0) return ys[0];
  if (k >= xs.length - 1) return ys[xs.length - 1];
  // Choose left or right neighbour
  return (x - xs[k]) <= (xs[k + 1] - x) ? ys[k] : ys[k + 1];
}

/** Zero-order hold (step function): returns `y[k]` where `k` is the last index ≤ x`. */
function zeroInterp(xs: Float64Array, ys: Float64Array, x: number): number {
  const k = lowerBound(xs, x);
  if (k < 0) return ys[0];
  return ys[k];
}

/**
 * Local quadratic Lagrange interpolation.
 *
 * For each query point, the three data points closest to the query interval
 * are used to build the Lagrange polynomial.  This gives continuity everywhere
 * but a discontinuous derivative at the breakpoints — acceptable for
 * paleoclimate resampling at typical resolution steps.
 */
function quadraticInterp(xs: Float64Array, ys: Float64Array, x: number): number {
  const n = xs.length;
  if (n === 1) return ys[0];
  if (n === 2) {
    // Fall back to linear
    const t = (x - xs[0]) / (xs[1] - xs[0]);
    return ys[0] + t * (ys[1] - ys[0]);
  }

  const k = lowerBound(xs, x);
  // Choose a window of 3 points starting at `start`
  let start = Math.max(0, Math.min(k - 1, n - 3));

  const x0 = xs[start], x1 = xs[start + 1], x2 = xs[start + 2];
  const y0 = ys[start], y1 = ys[start + 1], y2 = ys[start + 2];

  // Lagrange basis
  const l0 = (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2));
  const l1 = (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2));
  const l2 = (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1));

  return y0 * l0 + y1 * l1 + y2 * l2;
}

// ---------------------------------------------------------------------------
// Internal: natural cubic spline
// ---------------------------------------------------------------------------

/**
 * Thomas algorithm for a tridiagonal system  A·x = d.
 *
 * @param lower - Sub-diagonal (length m-1): lower[k] is A[k+1][k].
 * @param main_ - Main diagonal (length m).
 * @param upper - Super-diagonal (length m-1): upper[k] is A[k][k+1].
 * @param rhs   - Right-hand side (length m).
 * @returns Solution vector (length m).
 */
function thomasSolve(
  lower: Float64Array,
  main_: Float64Array,
  upper: Float64Array,
  rhs: Float64Array,
): Float64Array {
  const m = main_.length;
  const diag = main_.slice();
  const d = rhs.slice();

  // Forward elimination
  for (let k = 1; k < m; k++) {
    const w = lower[k - 1] / diag[k - 1];
    diag[k] -= w * upper[k - 1];
    d[k] -= w * d[k - 1];
  }

  // Back substitution
  const sol = new Float64Array(m);
  sol[m - 1] = d[m - 1] / diag[m - 1];
  for (let k = m - 2; k >= 0; k--) {
    sol[k] = (d[k] - upper[k] * sol[k + 1]) / diag[k];
  }
  return sol;
}

/**
 * Build and return a natural cubic spline evaluator.
 *
 * Boundary conditions: `S''(x[0]) = S''(x[n-1]) = 0` (natural / free ends).
 * Outside the data range, linear extrapolation is applied using the spline
 * slope at the nearest endpoint.
 *
 * @param xs - Strictly increasing knot positions (Float64Array, length ≥ 2).
 * @param ys - Knot values (Float64Array, same length).
 * @returns  Evaluator `(x: number) => number`.
 */
function buildNaturalCubicSpline(
  xs: Float64Array,
  ys: Float64Array,
): (x: number) => number {
  const n = xs.length; // n points, n-1 intervals

  if (n === 1) return () => ys[0];
  if (n === 2) {
    // Degenerate — exactly linear
    const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    return (x) => ys[0] + slope * (x - xs[0]);
  }

  // Step widths and secant slopes
  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    h[k] = xs[k + 1] - xs[k];
    delta[k] = (ys[k + 1] - ys[k]) / h[k];
  }

  // Build tridiagonal system for interior second derivatives M[1]..M[n-2]
  // (M[0] = M[n-1] = 0 by natural BC)
  const m = n - 2; // number of interior unknowns

  if (m === 0) {
    // Three points, two intervals — tridiagonal has 0 unknowns; already handled above
    // This path is unreachable given n >= 3, but kept for safety
    const slope = (ys[n - 1] - ys[0]) / (xs[n - 1] - xs[0]);
    return (x) => ys[0] + slope * (x - xs[0]);
  }

  const diagMain = new Float64Array(m);
  const diagLower = new Float64Array(m - 1);
  const diagUpper = new Float64Array(m - 1);
  const rhs = new Float64Array(m);

  for (let k = 0; k < m; k++) {
    // Row k corresponds to interior knot x[k+1]
    diagMain[k] = 2 * (h[k] + h[k + 1]);
    rhs[k] = 6 * (delta[k + 1] - delta[k]);
  }
  for (let k = 0; k < m - 1; k++) {
    diagLower[k] = h[k + 1]; // A[k+1][k]
    diagUpper[k] = h[k + 1]; // A[k][k+1] — symmetric matrix
  }

  const M_interior = thomasSolve(diagLower, diagMain, diagUpper, rhs);

  // Full second-derivative array: M[0]=0, M[1..n-2]=M_interior, M[n-1]=0
  const M = new Float64Array(n); // zero-initialised
  for (let k = 0; k < m; k++) M[k + 1] = M_interior[k];

  // Left-endpoint slope:  S'(x[0]) = δ[0] - M[1]*h[0]/6   (M[0]=0)
  const slopeLeft = delta[0] - M[1] * h[0] / 6;
  // Right-endpoint slope: S'(x[n-1]) = δ[n-2] + M[n-2]*h[n-2]/6  (M[n-1]=0)
  const slopeRight = delta[n - 2] + M[n - 2] * h[n - 2] / 6;

  return (x: number): number => {
    // Linear extrapolation outside data range
    if (x <= xs[0]) return ys[0] + slopeLeft * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + slopeRight * (x - xs[n - 1]);

    // Binary search for interval k
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const k = lo;

    // Standard cubic spline evaluation
    const dx = x - xs[k];
    const dx_ = xs[k + 1] - x;
    const hk = h[k];

    return (
      (M[k] * dx_ * dx_ * dx_) / (6 * hk) +
      (M[k + 1] * dx * dx * dx) / (6 * hk) +
      (ys[k] / hk - (M[k] * hk) / 6) * dx_ +
      (ys[k + 1] / hk - (M[k + 1] * hk) / 6) * dx
    );
  };
}

// ---------------------------------------------------------------------------
// Internal: numerical integration (Gauss–Legendre 20-point)
// ---------------------------------------------------------------------------

/**
 * Integrate `f` over `[a, b]` using 20-point Gauss–Legendre quadrature.
 *
 * Accuracy is sufficient for smooth interpolating functions at the scales
 * encountered in paleoclimate resampling (~20 correct digits for analytic
 * integrands).
 */
function gaussLegendreIntegrate(
  f: (x: number) => number,
  a: number,
  b: number,
): number {
  const mid = (a + b) / 2;
  const halfLen = (b - a) / 2;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const absc = GL20_ABSCISSAS[i];
    const w = GL20_WEIGHTS[i];
    sum += w * (f(mid + halfLen * absc) + f(mid - halfLen * absc));
  }
  return halfLen * sum;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Interpolation methods supported by {@link resample}. */
export type InterpKind = 'nearest' | 'zero' | 'linear' | 'quadratic' | 'cubic';

/**
 * Resample a time series onto a new set of sample points, with optional
 * integration-based averaging.
 *
 * **Algorithm overview (non-integrated path)**:
 * 1. Average duplicate index entries.
 * 2. Restrict `samplePoints` to `[min(index), max(index)]`.
 * 3. Interpolate at each valid sample point using `kind`.
 *
 * **Algorithm overview (integrated path)**:
 * 1. Average duplicate index entries.
 * 2. Restrict `samplePoints` to `[min(index), max(index)]`.
 * 3. Compute integration intervals: midpoints between consecutive sample
 *    points, with the outermost edges extended symmetrically.
 * 4. Drop any interval whose edges fall outside the data range (matching the
 *    Python reference behaviour — see note in module header).
 * 5. For each valid interval `[a, b]`, compute the mean value
 *    `(1/(b-a)) * ∫_a^b f(x) dx` using 20-point Gauss–Legendre quadrature.
 *
 * @param index        - Series x positions (Float64Array).
 * @param values       - Series y values (Float64Array, same length).
 * @param samplePoints - Target x positions for the output series.
 * @param kind         - Interpolation method.
 * @param integrated   - Use integration-based mean instead of point evaluation.
 * @returns `{ index, values }` — resampled series.
 *
 * @throws {RangeError} If `index` and `values` have different lengths.
 */
export function resample(
  index: Float64Array,
  values: Float64Array,
  samplePoints: number[] | Float64Array,
  kind: InterpKind,
  integrated: boolean,
): { index: Float64Array; values: Float64Array } {
  if (index.length !== values.length) {
    throw new RangeError('index and values must have the same length.');
  }

  // 1. Average duplicates (mirrors pandas groupby().mean())
  const { index: xi, values: yi } = groupByMean(index, values);

  if (xi.length === 0) {
    return { index: new Float64Array(0), values: new Float64Array(0) };
  }

  // 2. Restrict sample points to the data range
  const xMin = xi[0];
  const xMax = xi[xi.length - 1];

  const spArr = Array.from(samplePoints);
  const valid = spArr.filter(x => x >= xMin && x <= xMax);

  if (valid.length === 0) {
    return { index: new Float64Array(0), values: new Float64Array(0) };
  }

  // Build the interpolating function (used by both paths)
  const interp = buildInterpolator(xi, yi, kind);

  if (!integrated) {
    // -----------------------------------------------------------------------
    // Non-integrated: point evaluation
    // -----------------------------------------------------------------------
    const outValues = new Float64Array(valid.length);
    for (let i = 0; i < valid.length; i++) {
      outValues[i] = interp(valid[i]);
    }
    return { index: new Float64Array(valid), values: outValues };
  }

  // -----------------------------------------------------------------------
  // Integrated: mean value over each Voronoi interval
  // -----------------------------------------------------------------------

  // Guard: at least two valid points needed to define integration intervals.
  // With a single point, mids is empty and mids[0] returns undefined, which
  // causes NaN edges that silently pass the a < xMin || b > xMax guard
  // (NaN comparisons are false) and produce NaN output.
  if (valid.length < 2) {
    return { index: new Float64Array(0), values: new Float64Array(0) };
  }

  // Compute midpoints between consecutive valid sample points
  const mids = new Float64Array(valid.length - 1);
  for (let i = 0; i < mids.length; i++) {
    mids[i] = (valid[i] + valid[i + 1]) / 2;
  }

  // Extend edges symmetrically for the first and last intervals
  const firstEdge = valid[0] - (mids[0] - valid[0]);            // valid[0] - halfStep_right
  const lastEdge = valid[valid.length - 1]
    + (valid[valid.length - 1] - mids[mids.length - 1]);        // valid[-1] + halfStep_left

  // Build full edge array: [firstEdge, mid[0], ..., mid[-1], lastEdge]
  const edges: number[] = [firstEdge, ...Array.from(mids), lastEdge];

  const outIndex: number[] = [];
  const outValues: number[] = [];

  for (let i = 0; i < valid.length; i++) {
    const a = edges[i];
    const b = edges[i + 1];

    // Drop intervals that extend outside the data range (matches Python reference)
    if (a < xMin || b > xMax) continue;

    const integral = gaussLegendreIntegrate(interp, a, b);
    outIndex.push(valid[i]);
    outValues.push(integral / (b - a)); // mean value theorem
  }

  return {
    index: new Float64Array(outIndex),
    values: new Float64Array(outValues),
  };
}

// ---------------------------------------------------------------------------
// Internal: dispatch to the correct interpolation strategy
// ---------------------------------------------------------------------------

/**
 * Construct a single-value interpolator for the given `kind` from pre-sorted,
 * deduplicated data arrays.
 */
function buildInterpolator(
  xs: Float64Array,
  ys: Float64Array,
  kind: InterpKind,
): (x: number) => number {
  switch (kind) {
    case 'nearest':
      return (x) => nearestInterp(xs, ys, x);

    case 'zero':
      return (x) => zeroInterp(xs, ys, x);

    case 'linear':
      // Re-use the validated linear interpolation from interp.ts
      return createLinearInterpFn(Array.from(xs), Array.from(ys));

    case 'quadratic':
      return (x) => quadraticInterp(xs, ys, x);

    case 'cubic':
      return buildNaturalCubicSpline(xs, ys);
  }
}
