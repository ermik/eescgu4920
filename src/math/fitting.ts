/**
 * Curve fitting for evenly or unevenly spaced time series.
 *
 * Spec: PDF §8.2 — Fitting with polynomial, piecewise linear, staircase,
 * and cubic spline options.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FitKind = 'polynomial' | 'piecewise-linear' | 'staircase' | 'cubic-spline';

export interface FitResult {
  /** Fitted y values at query positions. */
  values: Float64Array;
  /** Query x positions (same as input xQuery or generated grid). */
  index: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fit a function to the data and evaluate at the query points.
 *
 * @param index   Data x positions (Float64Array).
 * @param values  Data y values (Float64Array, same length).
 * @param xQuery  Positions at which to evaluate the fit.
 * @param kind    Type of fit.
 * @param degree  Polynomial degree (only for kind='polynomial', default 1).
 * @returns       Fitted values at xQuery positions.
 */
export function fit(
  index: Float64Array,
  values: Float64Array,
  xQuery: Float64Array,
  kind: FitKind,
  degree: number = 1,
): FitResult {
  if (index.length !== values.length) {
    throw new RangeError('index and values must have the same length.');
  }
  if (index.length < 1) {
    throw new RangeError('Need at least 1 data point.');
  }

  switch (kind) {
    case 'polynomial':
      return polynomialFit(index, values, xQuery, degree);
    case 'piecewise-linear':
      return piecewiseLinearFit(index, values, xQuery);
    case 'staircase':
      return staircaseFit(index, values, xQuery);
    case 'cubic-spline':
      return cubicSplineFit(index, values, xQuery);
  }
}

// ---------------------------------------------------------------------------
// Polynomial fit (least squares via normal equations)
// ---------------------------------------------------------------------------

function polynomialFit(
  index: Float64Array,
  values: Float64Array,
  xQuery: Float64Array,
  degree: number,
): FitResult {
  const N = index.length;
  const p = Math.min(degree + 1, N); // can't have more coefficients than data

  // Build Vandermonde-like normal equations: (X^T X) a = X^T y
  // For numerical stability, center and scale x
  let xMean = 0, xStd = 0;
  for (let i = 0; i < N; i++) xMean += index[i];
  xMean /= N;
  for (let i = 0; i < N; i++) xStd += (index[i] - xMean) * (index[i] - xMean);
  xStd = Math.sqrt(xStd / N);
  if (xStd === 0) xStd = 1;

  // Normalized x values
  const xn = new Float64Array(N);
  for (let i = 0; i < N; i++) xn[i] = (index[i] - xMean) / xStd;

  // Build normal equation matrix A^T A and A^T y
  const m = p;
  const AtA = new Float64Array(m * m);
  const Aty = new Float64Array(m);

  for (let i = 0; i < N; i++) {
    let xpow = 1;
    for (let j = 0; j < m; j++) {
      Aty[j] += xpow * values[i];
      let xpow2 = 1;
      for (let k = 0; k < m; k++) {
        AtA[j * m + k] += xpow * xpow2;
        xpow2 *= xn[i];
      }
      xpow *= xn[i];
    }
  }

  // Solve via Cholesky or Gauss elimination
  const coeffs = solveLinear(AtA, Aty, m);

  // Evaluate at query points
  const out = new Float64Array(xQuery.length);
  for (let i = 0; i < xQuery.length; i++) {
    const xv = (xQuery[i] - xMean) / xStd;
    let val = 0, xpow = 1;
    for (let j = 0; j < m; j++) {
      val += coeffs[j] * xpow;
      xpow *= xv;
    }
    out[i] = val;
  }

  return { values: out, index: xQuery };
}

/** Solve A*x = b for a symmetric positive (semi-)definite m×m matrix. */
function solveLinear(A: Float64Array, b: Float64Array, m: number): Float64Array {
  // Gaussian elimination with partial pivoting (works for SPD too)
  const augmented = new Float64Array(m * (m + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) augmented[i * (m + 1) + j] = A[i * m + j];
    augmented[i * (m + 1) + m] = b[i];
  }

  for (let col = 0; col < m; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(augmented[col * (m + 1) + col]);
    for (let row = col + 1; row < m; row++) {
      const v = Math.abs(augmented[row * (m + 1) + col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) {
      for (let j = 0; j <= m; j++) {
        const tmp = augmented[col * (m + 1) + j];
        augmented[col * (m + 1) + j] = augmented[maxRow * (m + 1) + j];
        augmented[maxRow * (m + 1) + j] = tmp;
      }
    }

    const pivot = augmented[col * (m + 1) + col];
    if (Math.abs(pivot) < 1e-30) continue; // singular

    for (let row = col + 1; row < m; row++) {
      const factor = augmented[row * (m + 1) + col] / pivot;
      for (let j = col; j <= m; j++) {
        augmented[row * (m + 1) + j] -= factor * augmented[col * (m + 1) + j];
      }
    }
  }

  // Back substitution
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let sum = augmented[i * (m + 1) + m];
    for (let j = i + 1; j < m; j++) sum -= augmented[i * (m + 1) + j] * x[j];
    const diag = augmented[i * (m + 1) + i];
    x[i] = Math.abs(diag) > 1e-30 ? sum / diag : 0;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Piecewise linear fit
// ---------------------------------------------------------------------------

function piecewiseLinearFit(
  index: Float64Array,
  values: Float64Array,
  xQuery: Float64Array,
): FitResult {
  // Sort data by x
  const { xs, ys } = sortPairs(index, values);
  const out = new Float64Array(xQuery.length);

  for (let i = 0; i < xQuery.length; i++) {
    const x = xQuery[i];
    if (x <= xs[0]) {
      out[i] = ys[0];
    } else if (x >= xs[xs.length - 1]) {
      out[i] = ys[ys.length - 1];
    } else {
      const k = findSegment(xs, x);
      const t = (x - xs[k]) / (xs[k + 1] - xs[k]);
      out[i] = ys[k] + t * (ys[k + 1] - ys[k]);
    }
  }
  return { values: out, index: xQuery };
}

// ---------------------------------------------------------------------------
// Staircase fit (zero-order hold)
// ---------------------------------------------------------------------------

function staircaseFit(
  index: Float64Array,
  values: Float64Array,
  xQuery: Float64Array,
): FitResult {
  const { xs, ys } = sortPairs(index, values);
  const out = new Float64Array(xQuery.length);

  for (let i = 0; i < xQuery.length; i++) {
    const x = xQuery[i];
    if (x <= xs[0]) {
      out[i] = ys[0];
    } else if (x >= xs[xs.length - 1]) {
      out[i] = ys[ys.length - 1];
    } else {
      const k = findSegment(xs, x);
      out[i] = ys[k];
    }
  }
  return { values: out, index: xQuery };
}

// ---------------------------------------------------------------------------
// Natural cubic spline fit
// ---------------------------------------------------------------------------

function cubicSplineFit(
  index: Float64Array,
  values: Float64Array,
  xQuery: Float64Array,
): FitResult {
  const { xs, ys } = sortPairs(index, values);
  const n = xs.length;

  if (n === 1) {
    const out = new Float64Array(xQuery.length);
    out.fill(ys[0]);
    return { values: out, index: xQuery };
  }
  if (n === 2) {
    return piecewiseLinearFit(index, values, xQuery);
  }

  // Step widths and slopes
  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    h[k] = xs[k + 1] - xs[k];
    delta[k] = (ys[k + 1] - ys[k]) / h[k];
  }

  // Tridiagonal system for second derivatives M
  const m = n - 2;
  const diagMain = new Float64Array(m);
  const diagLower = new Float64Array(m > 0 ? m - 1 : 0);
  const diagUpper = new Float64Array(m > 0 ? m - 1 : 0);
  const rhs = new Float64Array(m);

  for (let k = 0; k < m; k++) {
    diagMain[k] = 2 * (h[k] + h[k + 1]);
    rhs[k] = 6 * (delta[k + 1] - delta[k]);
  }
  for (let k = 0; k < m - 1; k++) {
    diagLower[k] = h[k + 1];
    diagUpper[k] = h[k + 1];
  }

  // Thomas algorithm
  const M_int = thomasSolve(diagLower, diagMain, diagUpper, rhs);
  const M = new Float64Array(n);
  for (let k = 0; k < m; k++) M[k + 1] = M_int[k];

  // Evaluate
  const out = new Float64Array(xQuery.length);
  for (let i = 0; i < xQuery.length; i++) {
    const x = xQuery[i];
    if (x <= xs[0]) {
      const slope = delta[0] - M[1] * h[0] / 6;
      out[i] = ys[0] + slope * (x - xs[0]);
    } else if (x >= xs[n - 1]) {
      const slope = delta[n - 2] + M[n - 2] * h[n - 2] / 6;
      out[i] = ys[n - 1] + slope * (x - xs[n - 1]);
    } else {
      const k = findSegment(xs, x);
      const dx = x - xs[k];
      const dx_ = xs[k + 1] - x;
      const hk = h[k];
      out[i] =
        (M[k] * dx_ * dx_ * dx_) / (6 * hk) +
        (M[k + 1] * dx * dx * dx) / (6 * hk) +
        (ys[k] / hk - (M[k] * hk) / 6) * dx_ +
        (ys[k + 1] / hk - (M[k + 1] * hk) / 6) * dx;
    }
  }
  return { values: out, index: xQuery };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortPairs(
  index: Float64Array, values: Float64Array,
): { xs: Float64Array; ys: Float64Array } {
  const n = index.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => index[a] - index[b]);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = index[order[i]]; ys[i] = values[order[i]]; }
  return { xs, ys };
}

function findSegment(xs: Float64Array, x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return n - 2;
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

function thomasSolve(
  lower: Float64Array, main_: Float64Array, upper: Float64Array, rhs: Float64Array,
): Float64Array {
  const m = main_.length;
  if (m === 0) return new Float64Array(0);
  const diag = main_.slice();
  const d = rhs.slice();
  for (let k = 1; k < m; k++) {
    const w = lower[k - 1] / diag[k - 1];
    diag[k] -= w * upper[k - 1];
    d[k] -= w * d[k - 1];
  }
  const sol = new Float64Array(m);
  sol[m - 1] = d[m - 1] / diag[m - 1];
  for (let k = m - 2; k >= 0; k--) {
    sol[k] = (d[k] - upper[k] * sol[k + 1]) / diag[k];
  }
  return sol;
}
