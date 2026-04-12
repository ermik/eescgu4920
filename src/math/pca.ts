/**
 * Principal Component Analysis (PCA) for multiple evenly-spaced time series.
 *
 * Spec: PDF §8.2 — Princ. Compon. applied to 2+ series with the same
 * evenly-spaced X axis. Decomposes into uncorrelated principal components.
 *
 * Algorithm:
 *   1. Standardize each series (zero mean, unit variance)
 *   2. Compute the correlation matrix
 *   3. Eigendecomposition (Jacobi)
 *   4. Project data onto eigenvectors
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PCAResult {
  /** Eigenvalues in descending order (proportion of total variance). */
  eigenvalues: Float64Array;
  /** Fraction of total variance explained by each component. */
  varianceFraction: Float64Array;
  /** Principal component time series (one per component). */
  scores: Float64Array[];
  /** Loading matrix: loadings[component][series]. */
  loadings: Float64Array[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute PCA on multiple time series.
 *
 * All series must have the same length (shared X axis).
 *
 * @param series  Array of value arrays (each Float64Array, same length).
 * @returns       PCA result with eigenvalues, scores, and loadings.
 */
export function pca(series: Float64Array[]): PCAResult {
  const p = series.length; // number of variables
  if (p < 2) throw new RangeError('Need at least 2 series for PCA.');
  const N = series[0].length;
  if (N < 2) throw new RangeError('Need at least 2 data points.');
  for (let i = 1; i < p; i++) {
    if (series[i].length !== N) throw new RangeError('All series must have the same length.');
  }

  // Standardize
  const std: Float64Array[] = [];
  const means = new Float64Array(p);
  const stds = new Float64Array(p);

  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += series[j][i];
    means[j] = sum / N;

    let ss = 0;
    for (let i = 0; i < N; i++) {
      const d = series[j][i] - means[j];
      ss += d * d;
    }
    stds[j] = Math.sqrt(ss / (N - 1));
    if (stds[j] === 0) stds[j] = 1;

    const z = new Float64Array(N);
    for (let i = 0; i < N; i++) z[i] = (series[j][i] - means[j]) / stds[j];
    std.push(z);
  }

  // Correlation matrix (p×p)
  const R = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let k = 0; k < N; k++) s += std[i][k] * std[j][k];
      const val = s / (N - 1);
      R[i * p + j] = val;
      R[j * p + i] = val;
    }
  }

  // Eigendecomposition via Jacobi
  const { eigenvalues, eigenvectors } = jacobiEigen(R, p);

  // Sort descending
  const order = Array.from({ length: p }, (_, i) => i)
    .sort((a, b) => eigenvalues[b] - eigenvalues[a]);

  const sortedEvals = new Float64Array(p);
  const loadings: Float64Array[] = [];
  for (let c = 0; c < p; c++) {
    sortedEvals[c] = eigenvalues[order[c]];
    const loading = new Float64Array(p);
    for (let j = 0; j < p; j++) loading[j] = eigenvectors[j * p + order[c]];
    loadings.push(loading);
  }

  // Variance fractions
  let totalVar = 0;
  for (let i = 0; i < p; i++) totalVar += Math.max(0, sortedEvals[i]);
  const varianceFraction = new Float64Array(p);
  if (totalVar > 0) {
    for (let i = 0; i < p; i++) varianceFraction[i] = Math.max(0, sortedEvals[i]) / totalVar;
  }

  // Project: scores[c][t] = Σ_j loading[c][j] * std[j][t]
  const scores: Float64Array[] = [];
  for (let c = 0; c < p; c++) {
    const sc = new Float64Array(N);
    for (let t = 0; t < N; t++) {
      let s = 0;
      for (let j = 0; j < p; j++) s += loadings[c][j] * std[j][t];
      sc[t] = s;
    }
    scores.push(sc);
  }

  return { eigenvalues: sortedEvals, varianceFraction, scores, loadings };
}

// ---------------------------------------------------------------------------
// Jacobi eigenvalue algorithm (same as ssa.ts but kept self-contained)
// ---------------------------------------------------------------------------

function jacobiEigen(
  A: Float64Array, n: number,
): { eigenvalues: Float64Array; eigenvectors: Float64Array } {
  const a = new Float64Array(A);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  for (let iter = 0; iter < 100 * n * n; iter++) {
    let maxVal = 0;
    let p = 0, q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(a[i * n + j]);
        if (val > maxVal) { maxVal = val; p = i; q = j; }
      }
    }
    if (maxVal < 1e-12) break;

    const app = a[p * n + p], aqq = a[q * n + q], apq = a[p * n + q];
    const theta = (aqq - app) / (2 * apq);
    const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    a[p * n + p] = app - t * apq;
    a[q * n + q] = aqq + t * apq;
    a[p * n + q] = 0;
    a[q * n + p] = 0;

    for (let r = 0; r < n; r++) {
      if (r === p || r === q) continue;
      const arp = a[r * n + p], arq = a[r * n + q];
      a[r * n + p] = a[p * n + r] = c * arp - s * arq;
      a[r * n + q] = a[q * n + r] = s * arp + c * arq;
    }
    for (let r = 0; r < n; r++) {
      const vrp = v[r * n + p], vrq = v[r * n + q];
      v[r * n + p] = c * vrp - s * vrq;
      v[r * n + q] = s * vrp + c * vrq;
    }
  }

  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = a[i * n + i];
  return { eigenvalues, eigenvectors: v };
}
