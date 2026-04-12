/**
 * Spectral analysis methods for evenly-spaced time series.
 *
 * Implements four methods matching the original AnalySeries (PDF §8.3):
 *   1. Periodogram — FFT-based power spectral density with windowing
 *   2. Blackman-Tukey — autocovariance-based PSD with confidence intervals
 *   3. Maximum Entropy (Burg) — AR-model-based high-resolution PSD
 *   4. MTM (Multi-Taper Method) — DPSS-based PSD with F-test significance
 *
 * All methods accept evenly-spaced Float64Array values and return
 * frequency (cycles per unit) and power arrays.
 */

import { fft, nextPow2 } from './fft';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindowFunction =
  | 'rectangular'
  | 'hann'
  | 'hamming'
  | 'blackman'
  | 'bartlett';

export interface SpectralResult {
  /** Frequencies in cycles per sample interval (0 to Nyquist). */
  frequency: Float64Array;
  /** Power spectral density at each frequency. */
  power: Float64Array;
}

export interface BTResult extends SpectralResult {
  /** Lower confidence bound (if requested). */
  lowerCI: Float64Array;
  /** Upper confidence bound (if requested). */
  upperCI: Float64Array;
}

export interface MTMResult extends SpectralResult {
  /** F-test significance at each frequency (0 to 1, higher = more significant). */
  significance: Float64Array;
}

// ---------------------------------------------------------------------------
// Window functions
// ---------------------------------------------------------------------------

/**
 * Generate a window of length N.
 * All windows are symmetric and normalised so that Σw² is known.
 */
export function makeWindow(N: number, type: WindowFunction): Float64Array {
  const w = new Float64Array(N);
  const M = N - 1;
  switch (type) {
    case 'rectangular':
      w.fill(1);
      break;
    case 'hann':
      for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / M));
      break;
    case 'hamming':
      for (let n = 0; n < N; n++) w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / M);
      break;
    case 'blackman':
      for (let n = 0; n < N; n++)
        w[n] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / M) + 0.08 * Math.cos(4 * Math.PI * n / M);
      break;
    case 'bartlett':
      for (let n = 0; n < N; n++) w[n] = 1 - Math.abs((n - M / 2) / (M / 2));
      break;
  }
  return w;
}

/** Remove the mean from a copy of the input. */
function removeMean(values: Float64Array): Float64Array {
  const out = new Float64Array(values);
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i];
  const mean = sum / out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}

/** Remove linear trend from a copy of the input. */
function detrend(values: Float64Array): Float64Array {
  const N = values.length;
  const out = new Float64Array(N);
  // Least-squares linear fit: y = a + b*x
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < N; i++) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const denom = N * sxx - sx * sx;
  const b = denom !== 0 ? (N * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / N;
  for (let i = 0; i < N; i++) out[i] = values[i] - (a + b * i);
  return out;
}

// ---------------------------------------------------------------------------
// 1. Periodogram
// ---------------------------------------------------------------------------

export interface PeriodogramOptions {
  /** Window/taper function (default: 'hann'). */
  window?: WindowFunction;
  /** FFT length — zero-pads if > N (default: next power of 2 ≥ N). */
  nfft?: number;
  /** Remove linear trend before analysis (default: true). */
  detrend?: boolean;
}

/**
 * Compute the periodogram (FFT-based power spectral density).
 *
 * @param values  Evenly-spaced time series.
 * @param dt      Sample interval (e.g. 1.0 for 1 kyr steps).
 * @param options Windowing and zero-padding options.
 * @returns       Frequency and one-sided power spectral density arrays.
 */
export function periodogram(
  values: Float64Array,
  dt: number = 1,
  options: PeriodogramOptions = {},
): SpectralResult {
  const {
    window: windowType = 'hann',
    detrend: doDetrend = true,
    nfft: userNfft,
  } = options;

  const N = values.length;
  if (N < 2) throw new RangeError('Need at least 2 data points.');

  // Pre-process
  let x = doDetrend ? detrend(values) : removeMean(values);

  // Apply window
  const win = makeWindow(N, windowType);
  let winSS = 0; // sum of squares for normalisation
  for (let i = 0; i < N; i++) {
    x[i] *= win[i];
    winSS += win[i] * win[i];
  }

  // Zero-pad
  const nfft = userNfft ?? nextPow2(N);
  const data = new Float64Array(2 * nfft); // interleaved complex
  for (let i = 0; i < N; i++) data[2 * i] = x[i];

  // FFT
  fft(data, false);

  // One-sided PSD: P(f) = (2 * |X(f)|²) / (fs * winSS)
  // where fs = 1/dt.  The factor of 2 accounts for the negative frequencies.
  const nFreqs = Math.floor(nfft / 2) + 1;
  const frequency = new Float64Array(nFreqs);
  const power = new Float64Array(nFreqs);
  const fs = 1 / dt;
  const scale = 2 / (fs * winSS);

  for (let k = 0; k < nFreqs; k++) {
    frequency[k] = k * fs / nfft;
    const re = data[2 * k];
    const im = data[2 * k + 1];
    power[k] = (re * re + im * im) * scale;
  }
  // DC and Nyquist are not doubled
  power[0] /= 2;
  if (nFreqs > 1 && nfft % 2 === 0) power[nFreqs - 1] /= 2;

  return { frequency, power };
}

// ---------------------------------------------------------------------------
// 2. Blackman-Tukey
// ---------------------------------------------------------------------------

/** Lag-window functions for Blackman-Tukey. */
export type BTWindowFunction = 'bartlett' | 'parzen' | 'tukey';

export interface BTOptions {
  /** Maximum lag for autocovariance (default: N/3). */
  maxLag?: number;
  /** Lag window (default: 'bartlett'). */
  window?: BTWindowFunction;
  /** Confidence level, e.g. 0.95 (default: 0.95). */
  confidenceLevel?: number;
  /** Remove linear trend (default: true). */
  detrend?: boolean;
}

/**
 * Blackman-Tukey spectral estimation.
 *
 * Computes the autocovariance, windows it, and FFTs to obtain the PSD.
 * Returns confidence intervals based on the equivalent degrees of freedom.
 */
export function blackmanTukey(
  values: Float64Array,
  dt: number = 1,
  options: BTOptions = {},
): BTResult {
  const N = values.length;
  if (N < 4) throw new RangeError('Need at least 4 data points.');

  const {
    maxLag: userMaxLag,
    window: windowType = 'bartlett',
    confidenceLevel = 0.95,
    detrend: doDetrend = true,
  } = options;

  const M = userMaxLag ?? Math.floor(N / 3);
  if (M < 1 || M >= N) throw new RangeError('maxLag must be in [1, N-1].');

  // Pre-process
  const x = doDetrend ? detrend(values) : removeMean(values);

  // Autocovariance: R[k] = (1/N) * Σ x[n]*x[n+k]
  const acov = new Float64Array(M + 1);
  for (let k = 0; k <= M; k++) {
    let sum = 0;
    for (let n = 0; n < N - k; n++) sum += x[n] * x[n + k];
    acov[k] = sum / N;
  }

  // Lag window
  const lagWin = new Float64Array(M + 1);
  for (let k = 0; k <= M; k++) {
    const r = k / M;
    switch (windowType) {
      case 'bartlett':
        lagWin[k] = 1 - r;
        break;
      case 'parzen':
        if (r <= 0.5) lagWin[k] = 1 - 6 * r * r + 6 * r * r * r;
        else lagWin[k] = 2 * (1 - r) * (1 - r) * (1 - r);
        break;
      case 'tukey':
        lagWin[k] = 0.5 * (1 + Math.cos(Math.PI * r));
        break;
    }
  }

  // Windowed autocovariance → FFT for PSD
  const nfft = nextPow2(2 * M);
  const data = new Float64Array(2 * nfft);
  // R[0] at index 0, symmetric: R[-k] = R[k]
  data[0] = acov[0] * lagWin[0];
  for (let k = 1; k <= M; k++) {
    const val = acov[k] * lagWin[k];
    data[2 * k] = val;
    data[2 * (nfft - k)] = val; // negative lag
  }
  fft(data, false);

  // Extract one-sided PSD
  const nFreqs = Math.floor(nfft / 2) + 1;
  const frequency = new Float64Array(nFreqs);
  const power = new Float64Array(nFreqs);
  const fs = 1 / dt;

  for (let k = 0; k < nFreqs; k++) {
    frequency[k] = k * fs / nfft;
    // PSD = dt * Re(FFT), the imaginary part should be ~0
    power[k] = Math.max(0, data[2 * k] * dt);
  }

  // Equivalent degrees of freedom for confidence intervals
  // For Bartlett window: ν ≈ 2.67 * N/M
  let nu: number;
  switch (windowType) {
    case 'bartlett': nu = 2.67 * N / M; break;
    case 'parzen':   nu = 3.71 * N / M; break;
    case 'tukey':    nu = 2.67 * N / M; break;
    default:         nu = 2 * N / M; break;
  }

  // Chi-squared confidence intervals: ν*S/χ²(α/2) to ν*S/χ²(1-α/2)
  const alpha = 1 - confidenceLevel;
  const chiLo = chiSquaredInvApprox(nu, alpha / 2);
  const chiHi = chiSquaredInvApprox(nu, 1 - alpha / 2);

  const lowerCI = new Float64Array(nFreqs);
  const upperCI = new Float64Array(nFreqs);
  for (let k = 0; k < nFreqs; k++) {
    lowerCI[k] = nu * power[k] / chiHi;
    upperCI[k] = nu * power[k] / chiLo;
  }

  return { frequency, power, lowerCI, upperCI };
}

// ---------------------------------------------------------------------------
// 3. Maximum Entropy (Burg's method)
// ---------------------------------------------------------------------------

export interface MaxEntropyOptions {
  /** AR model order (default: N/3, capped at N-1). */
  order?: number;
  /** Number of frequency points (default: next power of 2 ≥ N). */
  nfft?: number;
  /** Remove linear trend (default: true). */
  detrend?: boolean;
}

/**
 * Maximum Entropy spectral estimation via Burg's algorithm.
 *
 * Fits an AR(p) model using Burg's method, then computes the PSD
 * from the AR coefficients.
 */
export function maxEntropy(
  values: Float64Array,
  dt: number = 1,
  options: MaxEntropyOptions = {},
): SpectralResult {
  const N = values.length;
  if (N < 3) throw new RangeError('Need at least 3 data points.');

  const {
    order: userOrder,
    nfft: userNfft,
    detrend: doDetrend = true,
  } = options;

  const order = Math.min(userOrder ?? Math.floor(N / 3), N - 1);
  const nfft = userNfft ?? Math.max(nextPow2(N), 256);

  // Pre-process
  const x = doDetrend ? detrend(values) : removeMean(values);

  // Burg's algorithm: estimate AR coefficients
  const { coeffs, variance } = burgAR(x, order);

  // PSD from AR model: P(f) = dt * σ² / |A(e^{j2πfdt})|²
  const nFreqs = Math.floor(nfft / 2) + 1;
  const frequency = new Float64Array(nFreqs);
  const power = new Float64Array(nFreqs);
  const fs = 1 / dt;

  for (let k = 0; k < nFreqs; k++) {
    const f = k * fs / nfft;
    frequency[k] = f;
    // A(z) = 1 + a[0]*z^{-1} + a[1]*z^{-2} + ... + a[p-1]*z^{-p}
    // z = e^{j2πf*dt}
    const omega = 2 * Math.PI * f * dt;
    let re = 1, im = 0;
    for (let j = 0; j < order; j++) {
      const angle = -omega * (j + 1);
      re += coeffs[j] * Math.cos(angle);
      im += coeffs[j] * Math.sin(angle);
    }
    const magSq = re * re + im * im;
    power[k] = magSq > 0 ? dt * variance / magSq : 0;
  }

  return { frequency, power };
}

/**
 * Burg's algorithm for AR parameter estimation.
 *
 * @returns AR coefficients (length = order) and prediction error variance.
 */
function burgAR(
  x: Float64Array,
  order: number,
): { coeffs: Float64Array; variance: number } {
  const N = x.length;
  const a = new Float64Array(order); // current AR coefficients

  // Forward and backward prediction errors
  let ef = new Float64Array(x);
  let eb = new Float64Array(x);

  // Initial variance
  let pm = 0;
  for (let i = 0; i < N; i++) pm += x[i] * x[i];
  pm /= N;

  for (let m = 0; m < order; m++) {
    // Compute reflection coefficient
    let num = 0, den = 0;
    for (let n = m + 1; n < N; n++) {
      num += ef[n] * eb[n - 1];
      den += ef[n] * ef[n] + eb[n - 1] * eb[n - 1];
    }
    const km = den > 0 ? -2 * num / den : 0;

    // Update AR coefficients
    const aOld = new Float64Array(a);
    a[m] = km;
    for (let j = 0; j < m; j++) {
      a[j] = aOld[j] + km * aOld[m - 1 - j];
    }

    // Update prediction error variance
    pm *= (1 - km * km);

    // Update forward and backward errors
    const efNew = new Float64Array(N);
    const ebNew = new Float64Array(N);
    for (let n = m + 1; n < N; n++) {
      efNew[n] = ef[n] + km * eb[n - 1];
      ebNew[n] = eb[n - 1] + km * ef[n];
    }
    ef = efNew;
    eb = ebNew;
  }

  return { coeffs: a, variance: pm };
}

// ---------------------------------------------------------------------------
// 4. Multi-Taper Method (MTM)
// ---------------------------------------------------------------------------

export interface MTMOptions {
  /** Time-bandwidth product NW (default: 4). */
  nw?: number;
  /** Number of tapers K (default: 2*NW - 1). */
  k?: number;
  /** FFT length (default: next power of 2 ≥ N). */
  nfft?: number;
  /** Remove linear trend (default: true). */
  detrend?: boolean;
}

/**
 * Multi-Taper spectral estimation with F-test significance.
 *
 * Uses Discrete Prolate Spheroidal Sequences (DPSS / Slepian tapers)
 * computed via the symmetric tridiagonal eigenproblem.
 */
export function mtm(
  values: Float64Array,
  dt: number = 1,
  options: MTMOptions = {},
): MTMResult {
  const N = values.length;
  if (N < 4) throw new RangeError('Need at least 4 data points.');

  const {
    nw = 4,
    k: userK,
    nfft: userNfft,
    detrend: doDetrend = true,
  } = options;

  const K = userK ?? Math.max(1, 2 * nw - 1);
  const nfft = userNfft ?? nextPow2(N);

  // Pre-process
  const x = doDetrend ? detrend(values) : removeMean(values);

  // Compute DPSS tapers
  const { tapers, eigenvalues } = computeDPSS(N, nw, K);

  // Compute individual eigenspectra
  const nFreqs = Math.floor(nfft / 2) + 1;
  const fs = 1 / dt;

  // eigenspectra[k][f] = |Y_k(f)|² where Y_k = FFT(x * v_k)
  const eigenCoeffsRe: Float64Array[] = [];
  const eigenCoeffsIm: Float64Array[] = [];
  const eigenSpectra: Float64Array[] = [];

  for (let t = 0; t < K; t++) {
    const data = new Float64Array(2 * nfft);
    for (let i = 0; i < N; i++) data[2 * i] = x[i] * tapers[t][i];
    fft(data, false);

    const specRe = new Float64Array(nFreqs);
    const specIm = new Float64Array(nFreqs);
    const spec = new Float64Array(nFreqs);
    for (let f = 0; f < nFreqs; f++) {
      specRe[f] = data[2 * f];
      specIm[f] = data[2 * f + 1];
      spec[f] = specRe[f] * specRe[f] + specIm[f] * specIm[f];
    }
    eigenCoeffsRe.push(specRe);
    eigenCoeffsIm.push(specIm);
    eigenSpectra.push(spec);
  }

  // Adaptive weighting (Thomson 1982, iterative scheme)
  const power = new Float64Array(nFreqs);
  const weights = adaptiveWeights(eigenSpectra, eigenvalues, K, nFreqs);

  for (let f = 0; f < nFreqs; f++) {
    let num = 0, den = 0;
    for (let t = 0; t < K; t++) {
      const w = weights[t][f];
      num += w * w * eigenvalues[t] * eigenSpectra[t][f];
      den += w * w * eigenvalues[t];
    }
    power[f] = den > 0 ? num / den : 0;
  }

  // Scale to PSD
  const scale = dt;
  for (let f = 0; f < nFreqs; f++) power[f] *= scale;

  // Frequency array
  const frequency = new Float64Array(nFreqs);
  for (let f = 0; f < nFreqs; f++) frequency[f] = f * fs / nfft;

  // F-test for line components (Thomson 1982)
  const significance = computeFTest(
    eigenCoeffsRe, eigenCoeffsIm, eigenSpectra,
    tapers, eigenvalues, K, N, nFreqs,
  );

  return { frequency, power, significance };
}

// ---------------------------------------------------------------------------
// DPSS (Slepian tapers) via symmetric tridiagonal eigenproblem
// ---------------------------------------------------------------------------

/**
 * Compute K DPSS tapers for a series of length N with
 * time-bandwidth product NW.
 *
 * The DPSS are eigenvectors of the symmetric tridiagonal matrix:
 *   T[n,n]   = ((N-1-2n)/2)² · cos(2πW)
 *   T[n,n+1] = (n+1)(N-1-n)/2
 * where W = NW/N.
 *
 * Uses implicit QR iteration to find eigenvalues, then inverse
 * iteration to recover eigenvectors.
 */
export function computeDPSS(
  N: number,
  NW: number,
  K: number,
): { tapers: Float64Array[]; eigenvalues: Float64Array } {
  const W = NW / N;
  const cosW = Math.cos(2 * Math.PI * W);

  // Build tridiagonal matrix
  const diag = new Float64Array(N);
  const offDiag = new Float64Array(N - 1);

  for (let n = 0; n < N; n++) {
    const half = (N - 1 - 2 * n) / 2;
    diag[n] = half * half * cosW;
  }
  for (let n = 0; n < N - 1; n++) {
    offDiag[n] = (n + 1) * (N - 1 - n) / 2;
  }

  // Find ALL eigenvalues via QR iteration on a copy
  const allEigenvalues = tridiagEigenvalues(
    new Float64Array(diag), new Float64Array(offDiag),
  );

  // Sort descending — we want the K largest
  const sorted = Array.from(allEigenvalues).sort((a, b) => b - a);
  const topK = sorted.slice(0, K);

  // Inverse iteration for eigenvectors (with orthogonalization)
  const tapers: Float64Array[] = [];
  const eigenvalues = new Float64Array(K);

  for (let t = 0; t < K; t++) {
    eigenvalues[t] = topK[t];
    const vec = inverseIteration(diag, offDiag, topK[t], N, tapers);

    // Normalise to unit energy
    let norm = 0;
    for (let i = 0; i < N; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < N; i++) vec[i] /= norm;

    // Fix sign convention: even-order tapers are positive at center,
    // odd-order tapers have positive first lobe
    if (t % 2 === 0) {
      if (vec[Math.floor(N / 2)] < 0) {
        for (let i = 0; i < N; i++) vec[i] = -vec[i];
      }
    } else {
      // Odd tapers: first non-negligible value should be positive
      let sum = 0;
      for (let i = 0; i < Math.floor(N / 2); i++) sum += vec[i];
      if (sum < 0) {
        for (let i = 0; i < N; i++) vec[i] = -vec[i];
      }
    }

    tapers.push(vec);
  }

  // Convert eigenvalues to approximate concentration ratios
  // using the Rayleigh quotient with the sinc kernel
  for (let t = 0; t < K; t++) {
    eigenvalues[t] = computeConcentration(tapers[t], N, W);
  }

  return { tapers, eigenvalues };
}

/**
 * Compute the spectral concentration ratio for a DPSS taper:
 * λ = v' C v  where C[m,n] = sin(2πW(m-n)) / (π(m-n)), C[n,n] = 2W.
 */
function computeConcentration(v: Float64Array, N: number, W: number): number {
  let result = 0;
  for (let m = 0; m < N; m++) {
    result += v[m] * v[m] * 2 * W;
    for (let n = m + 1; n < N; n++) {
      const d = m - n;
      const c = Math.sin(2 * Math.PI * W * d) / (Math.PI * d);
      result += 2 * v[m] * v[n] * c;
    }
  }
  return Math.max(0, Math.min(1, result));
}

// ---------------------------------------------------------------------------
// Tridiagonal eigenvalue solver (bisection with Sturm sequences)
// ---------------------------------------------------------------------------

/**
 * Find all eigenvalues of a symmetric tridiagonal matrix using bisection.
 * Robust and reliable for the DPSS problem.
 *
 * @param diag     Main diagonal (length n).
 * @param offDiag  Off-diagonal (length n-1).
 * @returns        Eigenvalues in ascending order.
 */
function tridiagEigenvalues(
  diag: Float64Array,
  offDiag: Float64Array,
): Float64Array {
  const n = diag.length;

  // Gershgorin bounds
  let gLo = diag[0] - Math.abs(offDiag[0] ?? 0);
  let gHi = diag[0] + Math.abs(offDiag[0] ?? 0);
  for (let i = 1; i < n; i++) {
    const r = Math.abs(offDiag[i - 1]) + (i < n - 1 ? Math.abs(offDiag[i]) : 0);
    gLo = Math.min(gLo, diag[i] - r);
    gHi = Math.max(gHi, diag[i] + r);
  }
  // Widen slightly
  const eps = Math.max(1e-10, 1e-12 * (gHi - gLo));
  gLo -= eps;
  gHi += eps;

  // Sturm count: number of eigenvalues ≤ x
  function sturmCount(x: number): number {
    let count = 0;
    let d = diag[0] - x;
    if (d <= 0) count++;
    for (let i = 1; i < n; i++) {
      if (d !== 0) {
        d = diag[i] - x - offDiag[i - 1] * offDiag[i - 1] / d;
      } else {
        d = diag[i] - x - Math.abs(offDiag[i - 1]) / Number.EPSILON;
      }
      if (d <= 0) count++;
    }
    return count;
  }

  // Find each eigenvalue by bisection (ascending order)
  const evals = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let a = gLo, b = gHi;
    for (let iter = 0; iter < 200; iter++) {
      const mid = (a + b) / 2;
      if (sturmCount(mid) >= k + 1) b = mid;
      else a = mid;
      if (b - a < 1e-13 * Math.max(1, Math.abs(a) + Math.abs(b))) break;
    }
    evals[k] = (a + b) / 2;
  }

  return evals;
}

/**
 * Inverse iteration to find eigenvectors for given eigenvalues
 * of a symmetric tridiagonal matrix, with Gram-Schmidt orthogonalization
 * against previously computed vectors.
 *
 * @param prevVecs  Previously computed eigenvectors to orthogonalize against.
 */
function inverseIteration(
  diag: Float64Array,
  offDiag: Float64Array,
  eigenvalue: number,
  N: number,
  prevVecs: Float64Array[] = [],
): Float64Array {
  // Small perturbation to avoid exact singularity
  const shift = eigenvalue + 1e-11 * (1 + Math.abs(eigenvalue));

  // LU factorisation of tridiagonal T - shift*I
  const dl = new Float64Array(N);   // main diagonal of L * D
  const ll = new Float64Array(N - 1); // sub-diagonal multipliers
  dl[0] = diag[0] - shift;
  for (let i = 1; i < N; i++) {
    ll[i - 1] = Math.abs(dl[i - 1]) > 1e-30 ? offDiag[i - 1] / dl[i - 1] : 0;
    dl[i] = diag[i] - shift - ll[i - 1] * offDiag[i - 1];
    // Prevent exact zero pivot
    if (Math.abs(dl[i]) < 1e-30) dl[i] = 1e-30;
  }
  if (Math.abs(dl[0]) < 1e-30) dl[0] = 1e-30;

  // Start with a deterministic seed vector
  let v = new Float64Array(N);
  for (let i = 0; i < N; i++) v[i] = 1 + 0.1 * Math.sin(i * 7.3 + 0.5);

  for (let iter = 0; iter < 6; iter++) {
    // Solve (T - shift*I) * v_new = v using LU
    // Forward: L * y = v
    const y = new Float64Array(N);
    y[0] = v[0];
    for (let i = 1; i < N; i++) y[i] = v[i] - ll[i - 1] * y[i - 1];

    // Back: U * v_new = y (U has diagonal dl and super-diagonal offDiag)
    v = new Float64Array(N);
    v[N - 1] = y[N - 1] / dl[N - 1];
    for (let i = N - 2; i >= 0; i--) {
      v[i] = (y[i] - offDiag[i] * v[i + 1]) / dl[i];
    }

    // Orthogonalize against previous eigenvectors (Gram-Schmidt)
    for (const prev of prevVecs) {
      let dot = 0;
      for (let i = 0; i < N; i++) dot += v[i] * prev[i];
      for (let i = 0; i < N; i++) v[i] -= dot * prev[i];
    }

    // Normalise
    let norm = 0;
    for (let i = 0; i < N; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < N; i++) v[i] /= norm;
  }

  return v;
}

// ---------------------------------------------------------------------------
// MTM adaptive weighting and F-test
// ---------------------------------------------------------------------------

/**
 * Adaptive weighting following Thomson (1982).
 * Iterates to find optimal weights that minimise broadband bias.
 */
function adaptiveWeights(
  eigenSpectra: Float64Array[],
  eigenvalues: Float64Array,
  K: number,
  nFreqs: number,
): Float64Array[] {
  // Initial estimate: simple average
  const S = new Float64Array(nFreqs);
  for (let f = 0; f < nFreqs; f++) {
    let sum = 0;
    for (let t = 0; t < K; t++) sum += eigenSpectra[t][f];
    S[f] = sum / K;
  }

  // Total variance for bias term
  let totalVar = 0;
  for (let f = 0; f < nFreqs; f++) totalVar += S[f];
  totalVar /= nFreqs;

  const weights: Float64Array[] = [];
  for (let t = 0; t < K; t++) weights.push(new Float64Array(nFreqs));

  // Iterate
  for (let iter = 0; iter < 10; iter++) {
    for (let f = 0; f < nFreqs; f++) {
      let num = 0, den = 0;
      for (let t = 0; t < K; t++) {
        const w = Math.sqrt(eigenvalues[t]) * S[f] /
          (eigenvalues[t] * S[f] + (1 - eigenvalues[t]) * totalVar);
        weights[t][f] = w;
        num += w * w * eigenvalues[t] * eigenSpectra[t][f];
        den += w * w * eigenvalues[t];
      }
      S[f] = den > 0 ? num / den : 0;
    }
  }

  return weights;
}

/**
 * F-test for line components in the MTM spectrum (Thomson 1982).
 *
 * Tests whether a frequency contains a deterministic (line) component
 * against the null hypothesis of a purely continuous spectrum.
 *
 * Returns significance values between 0 and 1 at each frequency.
 */
function computeFTest(
  coeffsRe: Float64Array[],
  coeffsIm: Float64Array[],
  _eigenSpectra: Float64Array[],
  tapers: Float64Array[],
  eigenvalues: Float64Array,
  K: number,
  N: number,
  nFreqs: number,
): Float64Array {
  // Sum of each taper (for estimating the line component amplitude)
  const taperSums = new Float64Array(K);
  for (let t = 0; t < K; t++) {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += tapers[t][i];
    taperSums[t] = sum;
  }

  const significance = new Float64Array(nFreqs);

  for (let f = 0; f < nFreqs; f++) {
    // Estimate line component amplitude
    let numRe = 0, numIm = 0, den = 0;
    for (let t = 0; t < K; t++) {
      const w = eigenvalues[t] * taperSums[t];
      numRe += w * coeffsRe[t][f];
      numIm += w * coeffsIm[t][f];
      den += w * taperSums[t];
    }

    if (den === 0) { significance[f] = 0; continue; }

    const muRe = numRe / den;
    const muIm = numIm / den;

    // Explained power (line component)
    const lineP = (muRe * muRe + muIm * muIm) * den;

    // Residual power (continuous spectrum)
    let resP = 0;
    for (let t = 0; t < K; t++) {
      const rRe = coeffsRe[t][f] - muRe * taperSums[t];
      const rIm = coeffsIm[t][f] - muIm * taperSums[t];
      resP += rRe * rRe + rIm * rIm;
    }

    // F-statistic with (2, 2K-2) degrees of freedom
    const F = resP > 0 ? (K - 1) * lineP / resP : 0;

    // Significance = CDF of F distribution (higher = more significant line component).
    // Matches AnalySeries convention: values close to 1 are most significant.
    significance[f] = fDistCDF(F, 2, 2 * K - 2);
  }

  return significance;
}

// ---------------------------------------------------------------------------
// Statistical distribution helpers
// ---------------------------------------------------------------------------

/**
 * Approximate inverse chi-squared CDF using Wilson-Hilferty transform.
 * Returns x such that P(X ≤ x) ≈ p for X ~ χ²(ν).
 */
function chiSquaredInvApprox(nu: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  // Wilson-Hilferty approximation
  const z = normalInvApprox(p);
  const term = 1 - 2 / (9 * nu) + z * Math.sqrt(2 / (9 * nu));
  return nu * term * term * term;
}

/**
 * Approximate inverse standard normal CDF (Beasley-Springer-Moro).
 */
function normalInvApprox(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation (Abramowitz & Stegun 26.2.23)
  const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  let z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  if (p < 0.5) z = -z;
  return z;
}

/**
 * Approximate CDF of the F distribution using the regularized
 * incomplete beta function with a continued-fraction expansion.
 */
function fDistCDF(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const z = d1 * x / (d1 * x + d2);
  return regBetaInc(d1 / 2, d2 / 2, z);
}

/**
 * Regularized incomplete beta function I_x(a, b) using continued fraction.
 */
function regBetaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the symmetry relation if needed for convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regBetaInc(b, a, 1 - x);
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;

    // Odd step
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;

    if (Math.abs(d * c - 1) < 1e-10) break;
  }

  return front * f;
}

/** Lanczos approximation for log-gamma. */
function lgamma(z: number): number {
  const g = 7;
  const coeff = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  let x = coeff[0];
  for (let i = 1; i < g + 2; i++) x += coeff[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
