/**
 * Frequency-domain bandpass and notch filtering.
 *
 * Spec: PDF §6.3 and §8.2 — Filtering with configurable center frequency,
 * bandwidth, filter shape, and notch option.
 *
 * Algorithm:
 *   1. FFT the input signal
 *   2. Multiply by the filter transfer function in the frequency domain
 *   3. Inverse FFT to get the filtered signal
 *
 * Supports Gaussian and piecewise-linear (boxcar with cosine taper) shapes.
 */

import { fft, nextPow2 } from './fft';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterShape = 'gaussian' | 'cosine-taper';

export interface FreqFilterOptions {
  /** Center frequency in cycles per unit (required). */
  centerFreq: number;
  /** Full bandwidth in cycles per unit (required). */
  bandwidth: number;
  /** Filter shape (default: 'gaussian'). */
  shape?: FilterShape;
  /** If true, notch (reject) filter instead of bandpass (default: false). */
  notch?: boolean;
  /** Remove mean before filtering (default: true). */
  removeMean?: boolean;
  /**
   * Cosine taper roll-off width as a fraction of bandwidth (0–0.5).
   * Only used with 'cosine-taper' shape. Default: 0.25.
   */
  taperWidth?: number;
}

export interface FreqFilterResult {
  /** Filtered values (same length as input). */
  values: Float64Array;
  /** The filter transfer function (one-sided, for display). */
  transferFunction: Float64Array;
  /** Corresponding frequencies for the transfer function. */
  frequency: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a frequency-domain filter to an evenly-spaced time series.
 *
 * @param values  Input series (evenly spaced).
 * @param dt      Sample interval (e.g. 1.0 for 1 kyr steps).
 * @param options Filter parameters.
 * @returns       Filtered values and the transfer function used.
 */
export function freqFilter(
  values: Float64Array,
  dt: number,
  options: FreqFilterOptions,
): FreqFilterResult {
  const N = values.length;
  if (N < 2) throw new RangeError('Need at least 2 data points.');

  const {
    centerFreq,
    bandwidth,
    shape = 'gaussian',
    notch = false,
    removeMean: doRemoveMean = true,
    taperWidth = 0.25,
  } = options;

  if (bandwidth <= 0) throw new RangeError('bandwidth must be positive.');
  if (centerFreq < 0) throw new RangeError('centerFreq must be non-negative.');

  // Pre-process
  const x = new Float64Array(N);
  let mean = 0;
  if (doRemoveMean) {
    for (let i = 0; i < N; i++) mean += values[i];
    mean /= N;
  }
  for (let i = 0; i < N; i++) x[i] = values[i] - mean;

  // Zero-pad to next power of 2
  const nfft = nextPow2(N);
  const data = new Float64Array(2 * nfft);
  for (let i = 0; i < N; i++) data[2 * i] = x[i];

  // Forward FFT
  fft(data, false);

  // Build transfer function and apply
  const fs = 1 / dt;
  const nFreqs = Math.floor(nfft / 2) + 1;
  const H = new Float64Array(nfft); // full two-sided

  for (let k = 0; k < nfft; k++) {
    const f = k <= nfft / 2 ? k * fs / nfft : (k - nfft) * fs / nfft;
    const absF = Math.abs(f);
    let gain = computeGain(absF, centerFreq, bandwidth, shape, taperWidth);
    if (notch) gain = 1 - gain;
    H[k] = gain;
    // Apply to complex spectrum
    data[2 * k] *= gain;
    data[2 * k + 1] *= gain;
  }

  // Inverse FFT
  fft(data, true);

  // Extract real part and trim to original length
  const filtered = new Float64Array(N);
  for (let i = 0; i < N; i++) filtered[i] = data[2 * i] + mean;

  // One-sided transfer function for display
  const transferFunction = new Float64Array(nFreqs);
  const frequency = new Float64Array(nFreqs);
  for (let k = 0; k < nFreqs; k++) {
    frequency[k] = k * fs / nfft;
    transferFunction[k] = H[k];
  }

  return { values: filtered, transferFunction, frequency };
}

// ---------------------------------------------------------------------------
// Internal: filter gain functions
// ---------------------------------------------------------------------------

function computeGain(
  f: number,
  center: number,
  bw: number,
  shape: FilterShape,
  taperWidth: number,
): number {
  switch (shape) {
    case 'gaussian':
      return gaussianGain(f, center, bw);
    case 'cosine-taper':
      return cosineTaperGain(f, center, bw, taperWidth);
  }
}

/**
 * Gaussian bandpass gain.
 * H(f) = exp(-((f - fc) / σ)²)
 * where σ = bw / (2 * sqrt(2 * ln 2)) so that the -3dB width equals bw.
 */
function gaussianGain(f: number, center: number, bw: number): number {
  const sigma = bw / (2 * Math.sqrt(2 * Math.log(2)));
  const d = (f - center) / sigma;
  return Math.exp(-0.5 * d * d);
}

/**
 * Piecewise-linear (boxcar) bandpass with cosine taper roll-off.
 * Flat passband from (center - bw/2 + taper) to (center + bw/2 - taper),
 * cosine roll-off over the taper regions at each edge.
 */
function cosineTaperGain(
  f: number,
  center: number,
  bw: number,
  taperFrac: number,
): number {
  const halfBw = bw / 2;
  const lo = center - halfBw;
  const hi = center + halfBw;
  const taper = halfBw * Math.min(1, Math.max(0, taperFrac)) * 2;

  if (f < lo || f > hi) return 0;
  if (taper <= 0) return 1; // pure boxcar

  // Lower taper
  if (f < lo + taper) {
    return 0.5 * (1 - Math.cos(Math.PI * (f - lo) / taper));
  }
  // Upper taper
  if (f > hi - taper) {
    return 0.5 * (1 - Math.cos(Math.PI * (hi - f) / taper));
  }
  // Flat passband
  return 1;
}
