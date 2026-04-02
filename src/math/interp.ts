/**
 * Piecewise linear interpolation with linear extrapolation outside the data
 * range.
 *
 * Spec: PDF §6.1 (Linage — linear tie-point interpolation) and §8.1 (New
 * Sampling — linear resampling).
 *
 * Reference: `defineInterpolationWindow.py` → `defineInterpolationFunctions`,
 * Linear branch: `interp1d(x, y, kind='linear', fill_value='extrapolate')`.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

import { isMonotonicIncreasing } from '../utils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throw if `x` is not strictly monotonically increasing.
 *
 * @param x    - The array to validate.
 * @param name - Variable name used in the error message.
 */
function assertMonotone(x: number[], name: string): void {
  if (!isMonotonicIncreasing(x)) {
    throw new RangeError(
      `${name} must be strictly increasing; found a non-increasing step.`,
    );
  }
}

/**
 * Binary search: return the index `k` such that `xKnown[k] <= x < xKnown[k+1]`.
 *
 * Returns `0` when `x < xKnown[0]` (left extrapolation) and
 * `n - 2` when `x >= xKnown[n-1]` (right extrapolation), so the caller can
 * always use the segment `[xKnown[k], xKnown[k+1]]` without bounds checks.
 *
 * Requires `xKnown.length >= 2`.
 */
function findSegment(xKnown: number[], x: number): number {
  const n = xKnown.length;
  if (x <= xKnown[0]) return 0;
  if (x >= xKnown[n - 1]) return n - 2;

  let lo = 0;
  let hi = n - 2;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (xKnown[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Evaluate linear interpolation / extrapolation for a single value using a
 * pre-located segment index `k`.
 *
 * The formula is the standard affine combination.  Outside the data range the
 * same formula naturally extrapolates using the slope of the nearest segment.
 */
function lerpSegment(
  xKnown: number[],
  yKnown: number[],
  k: number,
  x: number,
): number {
  const x0 = xKnown[k];
  const x1 = xKnown[k + 1];
  const y0 = yKnown[k];
  const y1 = yKnown[k + 1];
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Piecewise linear interpolation of a 1-D function at an array of query
 * points.
 *
 * For query values that fall outside `[xKnown[0], xKnown[n-1]]`, the function
 * extrapolates linearly using the slope of the nearest end segment.  This
 * matches scipy's `interp1d(…, fill_value='extrapolate')`.
 *
 * @param xKnown - Known x positions; must be strictly increasing.
 * @param yKnown - Known y values, parallel to `xKnown`.
 * @param xNew   - Query positions (any order, may contain duplicates).
 * @returns      Float64Array of interpolated values, same length as `xNew`.
 *
 * @throws {RangeError} If `xKnown` is not strictly increasing or arrays have
 *                      mismatched lengths.
 */
export function linearInterp(
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
    // Degenerate: single known point — constant everywhere
    out.fill(yKnown[0]);
    return out;
  }

  for (let i = 0; i < xNew.length; i++) {
    const k = findSegment(xKnown, xNew[i]);
    out[i] = lerpSegment(xKnown, yKnown, k, xNew[i]);
  }
  return out;
}

/**
 * Create a reusable single-value linear interpolation / extrapolation
 * function.
 *
 * This mirrors the `(f_1to2, f_2to1)` function-pair pattern used in
 * `defineInterpolationWindow.py → defineInterpolationFunctions` (Linear
 * branch).  Call this twice — once for each direction — to get the forward
 * and inverse mapping functions.
 *
 * @param xKnown - Known x positions; must be strictly increasing.
 * @param yKnown - Known y values, parallel to `xKnown`.
 * @returns A function `(x: number) => number` that interpolates/extrapolates.
 *
 * @throws {RangeError} If `xKnown` is not strictly increasing or arrays have
 *                      mismatched lengths.
 */
export function createLinearInterpFn(
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

  // Capture copies so the closure is immutable
  const xs = xKnown.slice();
  const ys = yKnown.slice();

  return (x: number): number => {
    const k = findSegment(xs, x);
    return lerpSegment(xs, ys, k, x);
  };
}
