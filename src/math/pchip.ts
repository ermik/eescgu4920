/**
 * PCHIP (Piecewise Cubic Hermite Interpolating Polynomial) interpolation.
 *
 * Spec: PDF §6.1 — Splinage uses cubic spline interpolation between
 * tie-points.  PCHIP is the correct algorithm because it preserves
 * monotonicity, which is physically essential for depth-to-age transforms.
 *
 * Reference: `defineInterpolationWindow.py` → `safe_PchipInterpolator`.
 * The Python wrapper disables scipy's built-in cubic extrapolation (which can
 * shoot wildly) and falls back to linear extrapolation from the nearest end
 * segment.  This implementation embeds that behaviour directly.
 *
 * Algorithm: Fritsch–Carlson (1980) for derivative estimation, followed by
 * cubic Hermite evaluation.  Endpoint slopes use the one-sided three-point
 * formula from scipy's PCHIP source.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

import { isMonotonicIncreasing } from '../utils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Throw if `x` is not strictly monotonically increasing. */
function assertMonotone(x: number[], name: string): void {
  if (!isMonotonicIncreasing(x)) {
    throw new RangeError(
      `${name} must be strictly increasing; found a non-increasing step.`,
    );
  }
}

/**
 * Binary search: return segment index `k` such that
 * `xKnown[k] <= x < xKnown[k+1]`.  Clamps to `[0, n-2]` for extrapolation.
 */
function findSegment(xKnown: number[], x: number): number {
  const n = xKnown.length;
  if (x <= xKnown[0]) return 0;
  if (x >= xKnown[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (xKnown[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Compute PCHIP derivatives at every knot using the Fritsch–Carlson method.
 *
 * Interior knots: weighted harmonic mean of the two adjacent secant slopes,
 * set to zero when the secants have opposite signs (local extremum).
 *
 * Endpoint slopes: one-sided three-point formula from scipy's implementation,
 * clamped to maintain monotonicity.
 *
 * @param x - Strictly increasing knot positions (length n).
 * @param y - Knot values (length n).
 * @returns  Derivative d[k] at each knot (length n).
 */
function computeDerivatives(x: number[], y: number[]): Float64Array {
  const n = x.length;
  const d = new Float64Array(n);

  if (n === 1) return d; // zero everywhere for a single point

  // Step widths and secant slopes
  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    h[k] = x[k + 1] - x[k];
    delta[k] = (y[k + 1] - y[k]) / h[k];
  }

  if (n === 2) {
    // Only one segment: both endpoints get the secant slope
    d[0] = delta[0];
    d[1] = delta[0];
    return d;
  }

  // Interior knots (Fritsch–Carlson weighted harmonic mean)
  for (let k = 1; k < n - 1; k++) {
    const dk_m = delta[k - 1]; // secant on the left
    const dk_p = delta[k];     // secant on the right
    if (dk_m * dk_p <= 0) {
      // Opposite signs (or either is zero) → local extremum → zero derivative
      d[k] = 0;
    } else {
      // Weighted harmonic mean (Fritsch–Carlson, eq. 2.4)
      // w1 = 2*h[k] + h[k-1],  w2 = h[k] + 2*h[k-1]
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      d[k] = (w1 + w2) / (w1 / dk_m + w2 / dk_p);
    }
  }

  // Left endpoint: one-sided three-point estimate (scipy _edge_case)
  d[0] = edgeSlope(h[0], h[1], delta[0], delta[1]);

  // Right endpoint
  d[n - 1] = edgeSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);

  return d;
}

/**
 * One-sided three-point slope estimate for a PCHIP endpoint, following
 * scipy's `_edge_case` function.
 *
 * @param h0 - Width of the adjacent interval (the near one).
 * @param h1 - Width of the next interval (one step further in).
 * @param m0 - Secant slope over the adjacent interval.
 * @param m1 - Secant slope over the next interval.
 */
function edgeSlope(h0: number, h1: number, m0: number, m1: number): number {
  // Quadratic fit through the nearest three points
  let slope = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);

  // If the estimate disagrees in sign with the nearest secant, zero it out
  if (Math.sign(slope) !== Math.sign(m0)) {
    slope = 0;
  } else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(slope) > 3 * Math.abs(m0)) {
    // Cap at 3× the adjacent secant to avoid overshooting a local extremum
    slope = 3 * m0;
  }
  return slope;
}

/**
 * Evaluate the cubic Hermite polynomial on segment `k` at position `x`.
 *
 * The standard basis functions (Hermite form) are used:
 *   p(t) = (2t³-3t²+1)·y0 + (t³-2t²+t)·h·d0 + (-2t³+3t²)·y1 + (t³-t²)·h·d1
 * where t = (x − x[k]) / h[k].
 */
function evalCubicHermite(
  x0: number, x1: number,
  y0: number, y1: number,
  d0: number, d1: number,
  x: number,
): number {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * h * d0
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * h * d1;
}

/**
 * Evaluate a single PCHIP query, dispatching to cubic Hermite inside the
 * data range and linear extrapolation outside it.
 */
function evalPchip(
  xKnown: number[],
  yKnown: number[],
  derivs: Float64Array,
  x: number,
): number {
  const n = xKnown.length;

  // Left linear extrapolation
  if (x < xKnown[0]) {
    return yKnown[0] + derivs[0] * (x - xKnown[0]);
  }

  // Right linear extrapolation
  if (x > xKnown[n - 1]) {
    return yKnown[n - 1] + derivs[n - 1] * (x - xKnown[n - 1]);
  }

  const k = findSegment(xKnown, x);
  return evalCubicHermite(
    xKnown[k], xKnown[k + 1],
    yKnown[k], yKnown[k + 1],
    derivs[k], derivs[k + 1],
    x,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * PCHIP interpolation at an array of query points.
 *
 * Inside the data range the function is piecewise cubic and preserves
 * monotonicity within each interval (no over-shoot).  Outside the data range
 * the function extrapolates linearly using the derivative at the nearest
 * endpoint, matching the behaviour of the Python `safe_PchipInterpolator`.
 *
 * @param xKnown - Known x positions; must be strictly increasing.
 * @param yKnown - Known y values, parallel to `xKnown`.
 * @param xNew   - Query positions (any order).
 * @returns      Float64Array of interpolated values, same length as `xNew`.
 *
 * @throws {RangeError} If `xKnown` is not strictly increasing or arrays have
 *                      mismatched lengths.
 */
export function pchipInterp(
  xKnown: number[],
  yKnown: number[],
  xNew: number[] | Float64Array,
): Float64Array {
  if (xKnown.length !== yKnown.length) {
    throw new RangeError('xKnown and yKnown must have the same length.');
  }
  const n = xKnown.length;
  if (n === 0) return new Float64Array(xNew.length);
  assertMonotone(xKnown, 'xKnown');

  const out = new Float64Array(xNew.length);

  if (n === 1) {
    out.fill(yKnown[0]);
    return out;
  }

  const derivs = computeDerivatives(xKnown, yKnown);

  for (let i = 0; i < xNew.length; i++) {
    out[i] = evalPchip(xKnown, yKnown, derivs, xNew[i]);
  }
  return out;
}

/**
 * Create a reusable single-value PCHIP interpolation / extrapolation function.
 *
 * Mirrors the `(f_1to2, f_2to1)` pattern from
 * `defineInterpolationWindow.py → defineInterpolationFunctions` (PCHIP
 * branch).  Call this once per direction.
 *
 * @param xKnown - Known x positions; must be strictly increasing.
 * @param yKnown - Known y values, parallel to `xKnown`.
 * @returns A function `(x: number) => number` that interpolates/extrapolates.
 *
 * @throws {RangeError} If `xKnown` is not strictly increasing or arrays have
 *                      mismatched lengths.
 */
export function createPchipInterpFn(
  xKnown: number[],
  yKnown: number[],
): (x: number) => number {
  if (xKnown.length !== yKnown.length) {
    throw new RangeError('xKnown and yKnown must have the same length.');
  }
  const n = xKnown.length;
  assertMonotone(xKnown, 'xKnown');

  if (n === 0) return () => NaN;
  if (n === 1) return () => yKnown[0];

  const xs = xKnown.slice();
  const ys = yKnown.slice();
  const derivs = computeDerivatives(xs, ys);

  return (x: number): number => evalPchip(xs, ys, derivs, x);
}
