import { describe, test, expect } from 'vitest';
import { freqFilter } from './freqFilter';

/** Generate a sum of sinusoids. */
function sinSum(N: number, freqs: number[], dt: number = 1): Float64Array {
  const out = new Float64Array(N);
  for (const f of freqs) {
    for (let i = 0; i < N; i++) out[i] += Math.sin(2 * Math.PI * f * i * dt);
  }
  return out;
}

/** RMS of an array. */
function rms(arr: Float64Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / arr.length);
}

describe('freqFilter', () => {
  // --- Bandpass ---

  test('bandpass passes signal at center frequency', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.1], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,
      bandwidth: 0.05,
      shape: 'gaussian',
    });

    expect(result.values.length).toBe(N);
    // Filtered signal should retain most of the original energy
    expect(rms(result.values)).toBeGreaterThan(rms(x) * 0.5);
  });

  test('bandpass removes signal far from center', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.4], dt); // signal at 0.4
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,   // filter centered at 0.1
      bandwidth: 0.05,
      shape: 'gaussian',
    });

    // Filtered signal should have much less energy
    expect(rms(result.values)).toBeLessThan(rms(x) * 0.1);
  });

  test('bandpass isolates one frequency from a mix', () => {
    const N = 512;
    const dt = 1;
    const x = sinSum(N, [0.05, 0.15, 0.30], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.15,
      bandwidth: 0.04,
      shape: 'gaussian',
    });

    // The filtered signal should be approximately a single sinusoid at 0.15
    // Check that it has reasonable amplitude (not zero)
    expect(rms(result.values)).toBeGreaterThan(0.1);
    // And less energy than the original 3-component signal
    expect(rms(result.values)).toBeLessThan(rms(x));
  });

  // --- Notch ---

  test('notch removes signal at center frequency', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.1], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,
      bandwidth: 0.05,
      shape: 'gaussian',
      notch: true,
    });

    // Most of the energy should be removed
    expect(rms(result.values)).toBeLessThan(rms(x) * 0.3);
  });

  test('notch preserves signal far from center', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.4], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,
      bandwidth: 0.05,
      shape: 'gaussian',
      notch: true,
    });

    // Signal at 0.4 should survive the notch at 0.1
    expect(rms(result.values)).toBeGreaterThan(rms(x) * 0.8);
  });

  // --- Cosine taper shape ---

  test('cosine-taper bandpass works', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.1], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,
      bandwidth: 0.06,
      shape: 'cosine-taper',
      taperWidth: 0.25,
    });

    expect(rms(result.values)).toBeGreaterThan(rms(x) * 0.5);
  });

  test('cosine-taper rejects out-of-band', () => {
    const N = 256;
    const dt = 1;
    const x = sinSum(N, [0.4], dt);
    const result = freqFilter(x, dt, {
      centerFreq: 0.1,
      bandwidth: 0.06,
      shape: 'cosine-taper',
    });

    expect(rms(result.values)).toBeLessThan(rms(x) * 0.05);
  });

  // --- Transfer function output ---

  test('transfer function has correct shape', () => {
    const N = 128;
    const dt = 1;
    const x = new Float64Array(N); // doesn't matter
    const result = freqFilter(x, dt, {
      centerFreq: 0.2,
      bandwidth: 0.1,
      shape: 'gaussian',
    });

    // Transfer function should peak near the center frequency
    let maxIdx = 0;
    for (let i = 1; i < result.transferFunction.length; i++) {
      if (result.transferFunction[i] > result.transferFunction[maxIdx]) maxIdx = i;
    }
    expect(result.frequency[maxIdx]).toBeCloseTo(0.2, 1);
  });

  test('notch transfer function dips at center', () => {
    const N = 128;
    const dt = 1;
    const x = new Float64Array(N);
    const result = freqFilter(x, dt, {
      centerFreq: 0.2,
      bandwidth: 0.1,
      shape: 'gaussian',
      notch: true,
    });

    // Transfer function should have a minimum near center
    let minIdx = 0;
    for (let i = 1; i < result.transferFunction.length; i++) {
      if (result.transferFunction[i] < result.transferFunction[minIdx]) minIdx = i;
    }
    expect(result.frequency[minIdx]).toBeCloseTo(0.2, 1);
  });

  // --- dt scaling ---

  test('dt affects frequency axis', () => {
    const N = 128;
    const result = freqFilter(new Float64Array(N), 2, {
      centerFreq: 0.1,
      bandwidth: 0.05,
    });

    // Nyquist = 1/(2*dt) = 0.25
    const nyq = result.frequency[result.frequency.length - 1];
    expect(nyq).toBeCloseTo(0.25, 5);
  });

  // --- Edge cases ---

  test('rejects fewer than 2 points', () => {
    expect(() => freqFilter(new Float64Array(1), 1, {
      centerFreq: 0.1, bandwidth: 0.05,
    })).toThrow();
  });

  test('rejects negative bandwidth', () => {
    expect(() => freqFilter(new Float64Array(8), 1, {
      centerFreq: 0.1, bandwidth: -0.05,
    })).toThrow();
  });
});
