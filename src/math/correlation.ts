/**
 * Auto-correlation and cross-correlation of evenly-spaced time series.
 *
 * Supports direct computation and FFT-accelerated mode.
 * Modes: correlation, covariance, crossproduct.
 */

import { fft, nextPow2 } from './fft';

export interface CorrelationResult {
  lags: Float64Array;
  values: Float64Array;
}

export interface CorrelationOptions {
  mode?: 'correlation' | 'covariance' | 'crossproduct';
  useFft?: boolean;
  removeMean?: boolean;
  normalize?: boolean;
  maxLag?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function removeMeanInPlace(arr: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  for (let i = 0; i < arr.length; i++) arr[i] -= mean;
  return mean;
}

function variance(arr: Float64Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return s / arr.length;
}

// ---------------------------------------------------------------------------
// Direct computation
// ---------------------------------------------------------------------------

function crossCorrelationDirect(
  a: Float64Array, b: Float64Array, maxLag: number,
): Float64Array {
  const n = a.length;
  const totalLags = 2 * maxLag + 1;
  const result = new Float64Array(totalLags);

  for (let lagIdx = 0; lagIdx < totalLags; lagIdx++) {
    const lag = lagIdx - maxLag;
    let sum = 0;
    const start = Math.max(0, lag);
    const end = Math.min(n, n + lag);
    for (let i = start; i < end; i++) {
      sum += a[i] * b[i - lag];
    }
    result[lagIdx] = sum;
  }

  return result;
}

// ---------------------------------------------------------------------------
// FFT-based computation
// ---------------------------------------------------------------------------

function crossCorrelationFFT(
  a: Float64Array, b: Float64Array,
): Float64Array {
  const n = a.length;
  const paddedN = nextPow2(2 * n - 1);

  // Pack a into complex array
  const fa = new Float64Array(2 * paddedN);
  for (let i = 0; i < n; i++) fa[2 * i] = a[i];

  // Pack b into complex array
  const fb = new Float64Array(2 * paddedN);
  for (let i = 0; i < n; i++) fb[2 * i] = b[i];

  // Forward FFT
  fft(fa, false);
  fft(fb, false);

  // Multiply fa by conj(fb): corr(a,b) = ifft(fft(a) * conj(fft(b)))
  const fc = new Float64Array(2 * paddedN);
  for (let i = 0; i < paddedN; i++) {
    const aRe = fa[2 * i], aIm = fa[2 * i + 1];
    const bRe = fb[2 * i], bIm = fb[2 * i + 1];
    // conj(b) = (bRe, -bIm)
    fc[2 * i] = aRe * bRe + aIm * bIm;
    fc[2 * i + 1] = aIm * bRe - aRe * bIm;
  }

  // Inverse FFT
  fft(fc, true);

  // Extract real parts. The correlation at lag k is at index k for k >= 0
  // and at index paddedN + k for k < 0.
  const totalLags = 2 * n - 1;
  const result = new Float64Array(totalLags);
  const maxLag = n - 1;

  for (let lagIdx = 0; lagIdx < totalLags; lagIdx++) {
    const lag = lagIdx - maxLag;
    const fftIdx = lag >= 0 ? lag : paddedN + lag;
    result[lagIdx] = fc[2 * fftIdx];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-correlation of a single evenly-spaced series.
 */
export function autoCorrelation(
  values: Float64Array,
  options: CorrelationOptions = {},
): CorrelationResult {
  return crossCorrelation(values, values, options);
}

/**
 * Cross-correlation between two evenly-spaced series of the same length.
 */
export function crossCorrelation(
  values1: Float64Array,
  values2: Float64Array,
  options: CorrelationOptions = {},
): CorrelationResult {
  const {
    mode = 'correlation',
    useFft = true,
    removeMean: doRemoveMean = true,
    normalize = true,
    maxLag: userMaxLag,
  } = options;

  const n = values1.length;
  if (n === 0) {
    return { lags: new Float64Array(0), values: new Float64Array(0) };
  }
  if (values2.length !== n) {
    throw new Error(`Series must have the same length (got ${n} and ${values2.length})`);
  }

  // Work on copies
  const a = new Float64Array(values1);
  const b = new Float64Array(values2);

  // Optionally remove mean
  if (doRemoveMean) {
    removeMeanInPlace(a);
    removeMeanInPlace(b);
  }

  // Maximum lag
  const fullMaxLag = n - 1;
  const effectiveMaxLag = userMaxLag !== undefined ? Math.min(userMaxLag, fullMaxLag) : fullMaxLag;

  // Compute raw cross-products
  let raw: Float64Array;
  if (useFft && n > 64) {
    raw = crossCorrelationFFT(a, b);
  } else {
    raw = crossCorrelationDirect(a, b, fullMaxLag);
  }

  // Trim to effective maxLag if needed
  const trimmedLags = 2 * effectiveMaxLag + 1;
  const offset = fullMaxLag - effectiveMaxLag;
  const trimmedRaw = new Float64Array(trimmedLags);
  for (let i = 0; i < trimmedLags; i++) {
    trimmedRaw[i] = raw[offset + i];
  }

  // Build lag array
  const lags = new Float64Array(trimmedLags);
  for (let i = 0; i < trimmedLags; i++) {
    lags[i] = i - effectiveMaxLag;
  }

  // Apply mode and normalization
  const result = new Float64Array(trimmedLags);

  if (mode === 'crossproduct') {
    // Raw cross-products, no normalization
    result.set(trimmedRaw);
  } else if (mode === 'covariance') {
    // Divide by N
    for (let i = 0; i < trimmedLags; i++) {
      result[i] = trimmedRaw[i] / n;
    }
  } else {
    // 'correlation' — divide by N, optionally normalize by standard deviations
    const varA = variance(a);
    const varB = variance(b);
    const denom = normalize && varA > 0 && varB > 0
      ? n * Math.sqrt(varA * varB)
      : n;
    for (let i = 0; i < trimmedLags; i++) {
      result[i] = trimmedRaw[i] / denom;
    }
  }

  return { lags, values: result };
}
