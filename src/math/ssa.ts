/**
 * Singular Spectrum Analysis (SSA).
 *
 * Spec: PDF §8.4 — Decompose a time series into principal components using
 * a trajectory matrix approach. Allows reconstruction from selected
 * components and filtering.
 *
 * Algorithm:
 *   1. Build the trajectory matrix (Hankel-like embedding)
 *   2. Compute the lagged covariance matrix
 *   3. Eigendecomposition
 *   4. Project onto eigenvectors to get principal components
 *   5. Reconstruct from selected components
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSAResult {
  /** Eigenvalues in descending order. */
  eigenvalues: Float64Array;
  /** Fraction of variance explained by each eigenvalue. */
  varianceFraction: Float64Array;
  /** Reconstructed series from the selected components. */
  reconstruction: Float64Array;
  /** Individual reconstructed components (one per selected component). */
  components: Float64Array[];
}

export interface SSAOptions {
  /** Embedding dimension (window length). Default: N/3. */
  windowLength?: number;
  /** Number of components to use for reconstruction. Default: all. */
  nComponents?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform Singular Spectrum Analysis on an evenly-spaced time series.
 *
 * @param values  Input series (evenly spaced).
 * @param options Embedding dimension and reconstruction parameters.
 */
export function ssa(values: Float64Array, options: SSAOptions = {}): SSAResult {
  const N = values.length;
  if (N < 3) throw new RangeError('Need at least 3 data points.');

  const M = options.windowLength ?? Math.floor(N / 3);
  if (M < 2 || M > N - 1) throw new RangeError('windowLength must be in [2, N-1].');

  const K = N - M + 1; // number of lagged copies

  // Remove mean
  let mean = 0;
  for (let i = 0; i < N; i++) mean += values[i];
  mean /= N;
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = values[i] - mean;

  // Build lagged covariance matrix C (M×M)
  // C[i][j] = (1/K) Σ_k x[i+k] * x[j+k], k = 0..K-1
  const C = new Float64Array(M * M);
  for (let i = 0; i < M; i++) {
    for (let j = i; j < M; j++) {
      let s = 0;
      for (let k = 0; k < K; k++) s += x[i + k] * x[j + k];
      const val = s / K;
      C[i * M + j] = val;
      C[j * M + i] = val; // symmetric
    }
  }

  // Eigendecomposition via Jacobi iteration (for symmetric matrix)
  const { eigenvalues, eigenvectors } = jacobiEigen(C, M);

  // Sort by descending eigenvalue
  const order = Array.from({ length: M }, (_, i) => i)
    .sort((a, b) => eigenvalues[b] - eigenvalues[a]);

  const sortedEvals = new Float64Array(M);
  const sortedEvecs: Float64Array[] = [];
  for (let i = 0; i < M; i++) {
    sortedEvals[i] = eigenvalues[order[i]];
    const vec = new Float64Array(M);
    for (let j = 0; j < M; j++) vec[j] = eigenvectors[j * M + order[i]];
    sortedEvecs.push(vec);
  }

  // Variance fractions
  let totalVar = 0;
  for (let i = 0; i < M; i++) totalVar += Math.max(0, sortedEvals[i]);
  const varianceFraction = new Float64Array(M);
  if (totalVar > 0) {
    for (let i = 0; i < M; i++) varianceFraction[i] = Math.max(0, sortedEvals[i]) / totalVar;
  }

  // Select components for reconstruction
  const nComp = Math.min(options.nComponents ?? M, M);

  // Reconstruct each component via diagonal averaging
  const components: Float64Array[] = [];
  const reconstruction = new Float64Array(N);

  for (let c = 0; c < nComp; c++) {
    const rc = reconstructComponent(x, sortedEvecs[c], M, K, N);
    components.push(rc);
    for (let i = 0; i < N; i++) reconstruction[i] += rc[i];
  }

  // Add mean back
  for (let i = 0; i < N; i++) reconstruction[i] += mean;

  return { eigenvalues: sortedEvals, varianceFraction, reconstruction, components };
}

// ---------------------------------------------------------------------------
// Internal: component reconstruction via diagonal averaging
// ---------------------------------------------------------------------------

function reconstructComponent(
  x: Float64Array, evec: Float64Array, M: number, K: number, N: number,
): Float64Array {
  // Project trajectory vectors onto eigenvector to get PC scores
  const scores = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    let s = 0;
    for (let j = 0; j < M; j++) s += x[j + k] * evec[j];
    scores[k] = s;
  }

  // Reconstruct elementary matrix and diagonal-average
  const rc = new Float64Array(N);
  const counts = new Float64Array(N);

  for (let k = 0; k < K; k++) {
    for (let j = 0; j < M; j++) {
      rc[j + k] += scores[k] * evec[j];
      counts[j + k]++;
    }
  }
  for (let i = 0; i < N; i++) {
    if (counts[i] > 0) rc[i] /= counts[i];
  }

  return rc;
}

// ---------------------------------------------------------------------------
// Jacobi eigenvalue algorithm for symmetric matrices
// ---------------------------------------------------------------------------

function jacobiEigen(
  A: Float64Array, n: number,
): { eigenvalues: Float64Array; eigenvectors: Float64Array } {
  // Work on a copy
  const a = new Float64Array(A);
  // Initialize eigenvectors to identity
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  // Cyclic Jacobi sweeps: annihilate every off-diagonal (p,q) pair once per
  // sweep. Avoids the O(n²) max-element search that classical Jacobi performs
  // before every rotation — for large n that scan dominates and can freeze the
  // UI thread. Cyclic Jacobi has the same quadratic convergence in practice.
  const maxSweeps = 50;
  const tol = 1e-12;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Off-diagonal Frobenius norm (squared) — convergence measure
    let off = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const x = a[i * n + j];
        off += x * x;
      }
    }
    if (off < tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-14) continue;

        const app = a[p * n + p];
        const aqq = a[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const signTheta = theta >= 0 ? 1 : -1;
        const t = signTheta / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        a[p * n + p] = app - t * apq;
        a[q * n + q] = aqq + t * apq;
        a[p * n + q] = 0;
        a[q * n + p] = 0;

        for (let r = 0; r < n; r++) {
          if (r === p || r === q) continue;
          const arp = a[r * n + p];
          const arq = a[r * n + q];
          a[r * n + p] = a[p * n + r] = c * arp - s * arq;
          a[r * n + q] = a[q * n + r] = s * arp + c * arq;
        }

        for (let r = 0; r < n; r++) {
          const vrp = v[r * n + p];
          const vrq = v[r * n + q];
          v[r * n + p] = c * vrp - s * vrq;
          v[r * n + q] = s * vrp + c * vrq;
        }
      }
    }
  }

  // Extract eigenvalues from diagonal
  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = a[i * n + i];

  return { eigenvalues, eigenvectors: v };
}
