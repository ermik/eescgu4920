import { describe, test, expect } from 'vitest';
import {
  makeWindow,
  periodogram,
  blackmanTukey,
  maxEntropy,
  mtm,
  computeDPSS,
} from './spectral';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a pure sinusoid at a given frequency (cycles per sample). */
function sinusoid(N: number, freq: number, amp: number = 1): Float64Array {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i);
  return out;
}

/** Find the index of the maximum value in an array, skipping DC (index 0). */
function argmaxSkipDC(arr: Float64Array): number {
  let best = 1;
  for (let i = 2; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}

/** Find the frequency at which power is maximal (skip DC). */
function peakFrequency(result: { frequency: Float64Array; power: Float64Array }): number {
  return result.frequency[argmaxSkipDC(result.power)];
}

// ---------------------------------------------------------------------------
// Window functions
// ---------------------------------------------------------------------------

describe('makeWindow', () => {
  test('rectangular window is all ones', () => {
    const w = makeWindow(8, 'rectangular');
    expect(w.length).toBe(8);
    for (let i = 0; i < 8; i++) expect(w[i]).toBe(1);
  });

  test('hann window is zero at endpoints', () => {
    const w = makeWindow(16, 'hann');
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[15]).toBeCloseTo(0, 10);
    expect(w[8]).toBeGreaterThan(0.9);
  });

  test('hamming window is non-zero at endpoints', () => {
    const w = makeWindow(16, 'hamming');
    expect(w[0]).toBeGreaterThan(0.05);
    expect(w[8]).toBeGreaterThan(0.9);
  });

  test('bartlett window peaks at center', () => {
    const w = makeWindow(11, 'bartlett');
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[5]).toBeCloseTo(1, 10);
    expect(w[10]).toBeCloseTo(0, 10);
  });

  test('blackman window is zero at endpoints', () => {
    const w = makeWindow(16, 'blackman');
    expect(w[0]).toBeCloseTo(0, 8);
  });
});

// ---------------------------------------------------------------------------
// Periodogram
// ---------------------------------------------------------------------------

describe('periodogram', () => {
  test('detects single sinusoid frequency', () => {
    // 0.1 cycles/sample, N=256, dt=1
    const x = sinusoid(256, 0.1);
    const result = periodogram(x, 1, { window: 'rectangular' });

    expect(result.frequency.length).toBeGreaterThan(1);
    expect(result.power.length).toBe(result.frequency.length);

    const peak = peakFrequency(result);
    expect(peak).toBeCloseTo(0.1, 1);
  });

  test('resolves two frequencies', () => {
    const N = 512;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      x[i] = Math.sin(2 * Math.PI * 0.1 * i) + Math.sin(2 * Math.PI * 0.2 * i);
    }
    const result = periodogram(x, 1, { window: 'hann' });

    // Find two largest peaks (skip DC)
    const sorted = Array.from(result.power)
      .map((v, i) => ({ v, i }))
      .filter(e => e.i > 0)
      .sort((a, b) => b.v - a.v);

    const f1 = result.frequency[sorted[0].i];
    const f2 = result.frequency[sorted[1].i];
    const peaks = [f1, f2].sort((a, b) => a - b);

    expect(peaks[0]).toBeCloseTo(0.1, 1);
    expect(peaks[1]).toBeCloseTo(0.2, 1);
  });

  test('power is non-negative', () => {
    const x = sinusoid(128, 0.15);
    const result = periodogram(x, 1);
    for (let i = 0; i < result.power.length; i++) {
      expect(result.power[i]).toBeGreaterThanOrEqual(0);
    }
  });

  test('frequency range is 0 to Nyquist', () => {
    const result = periodogram(sinusoid(64, 0.1), 2);
    expect(result.frequency[0]).toBe(0);
    // Nyquist = 1/(2*dt) = 0.25
    const nyquist = result.frequency[result.frequency.length - 1];
    expect(nyquist).toBeCloseTo(0.25, 5);
  });

  test('respects dt scaling', () => {
    const x = sinusoid(256, 0.1);
    const r1 = periodogram(x, 1);
    const r2 = periodogram(x, 2);

    // With dt=2, frequencies should be halved
    const peak1 = peakFrequency(r1);
    const peak2 = peakFrequency(r2);
    expect(peak2).toBeCloseTo(peak1 / 2, 1);
  });

  test('rejects fewer than 2 points', () => {
    expect(() => periodogram(new Float64Array(1))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Blackman-Tukey
// ---------------------------------------------------------------------------

describe('blackmanTukey', () => {
  test('detects single sinusoid frequency', () => {
    const x = sinusoid(256, 0.1);
    const result = blackmanTukey(x, 1, { maxLag: 80 });

    const peak = peakFrequency(result);
    expect(peak).toBeCloseTo(0.1, 1);
  });

  test('returns confidence intervals', () => {
    const x = sinusoid(256, 0.1);
    const result = blackmanTukey(x, 1, {
      maxLag: 64,
      confidenceLevel: 0.95,
    });

    expect(result.lowerCI.length).toBe(result.power.length);
    expect(result.upperCI.length).toBe(result.power.length);

    // Lower ≤ power ≤ upper everywhere
    for (let i = 0; i < result.power.length; i++) {
      expect(result.lowerCI[i]).toBeLessThanOrEqual(result.power[i] + 1e-10);
      expect(result.upperCI[i]).toBeGreaterThanOrEqual(result.power[i] - 1e-10);
    }
  });

  test('power is non-negative', () => {
    const x = sinusoid(128, 0.2);
    const result = blackmanTukey(x, 1);
    for (let i = 0; i < result.power.length; i++) {
      expect(result.power[i]).toBeGreaterThanOrEqual(0);
    }
  });

  test('supports different lag windows', () => {
    const x = sinusoid(256, 0.1);
    const r1 = blackmanTukey(x, 1, { window: 'bartlett' });
    const r2 = blackmanTukey(x, 1, { window: 'parzen' });
    const r3 = blackmanTukey(x, 1, { window: 'tukey' });

    // All should find the peak near 0.1
    expect(peakFrequency(r1)).toBeCloseTo(0.1, 1);
    expect(peakFrequency(r2)).toBeCloseTo(0.1, 1);
    expect(peakFrequency(r3)).toBeCloseTo(0.1, 1);
  });

  test('rejects invalid maxLag', () => {
    expect(() => blackmanTukey(sinusoid(32, 0.1), 1, { maxLag: 0 })).toThrow();
    expect(() => blackmanTukey(sinusoid(32, 0.1), 1, { maxLag: 32 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Maximum Entropy (Burg)
// ---------------------------------------------------------------------------

describe('maxEntropy', () => {
  test('detects single sinusoid frequency', () => {
    const x = sinusoid(128, 0.1);
    const result = maxEntropy(x, 1, { order: 20 });

    const peak = peakFrequency(result);
    expect(peak).toBeCloseTo(0.1, 1);
  });

  test('different orders all detect dominant frequency', () => {
    const x = sinusoid(128, 0.15);
    const r10 = maxEntropy(x, 1, { order: 10 });
    const r30 = maxEntropy(x, 1, { order: 30 });

    // Both should find the peak at 0.15
    expect(peakFrequency(r10)).toBeCloseTo(0.15, 1);
    expect(peakFrequency(r30)).toBeCloseTo(0.15, 1);
  });

  test('power is non-negative', () => {
    const x = sinusoid(64, 0.2);
    const result = maxEntropy(x, 1);
    for (let i = 0; i < result.power.length; i++) {
      expect(result.power[i]).toBeGreaterThanOrEqual(0);
    }
  });

  test('resolves close frequencies with sufficient order', () => {
    const N = 256;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      x[i] = Math.sin(2 * Math.PI * 0.10 * i) + Math.sin(2 * Math.PI * 0.12 * i);
    }
    const result = maxEntropy(x, 1, { order: 40 });

    // Find two peaks
    const sorted = Array.from(result.power)
      .map((v, i) => ({ v, i }))
      .filter(e => e.i > 0)
      .sort((a, b) => b.v - a.v);

    const peaks = [result.frequency[sorted[0].i], result.frequency[sorted[1].i]]
      .sort((a, b) => a - b);

    expect(peaks[0]).toBeCloseTo(0.10, 1);
    expect(peaks[1]).toBeCloseTo(0.12, 1);
  });
});

// ---------------------------------------------------------------------------
// DPSS (Slepian tapers)
// ---------------------------------------------------------------------------

describe('computeDPSS', () => {
  test('tapers have unit energy', () => {
    const { tapers } = computeDPSS(64, 4, 3);
    for (const taper of tapers) {
      let energy = 0;
      for (let i = 0; i < taper.length; i++) energy += taper[i] * taper[i];
      expect(energy).toBeCloseTo(1, 6);
    }
  });

  test('tapers are mutually orthogonal', () => {
    const { tapers } = computeDPSS(64, 4, 3);
    for (let i = 0; i < tapers.length; i++) {
      for (let j = i + 1; j < tapers.length; j++) {
        let dot = 0;
        for (let k = 0; k < 64; k++) dot += tapers[i][k] * tapers[j][k];
        expect(Math.abs(dot)).toBeLessThan(0.05);
      }
    }
  });

  test('concentration ratios decrease with order', () => {
    const { eigenvalues } = computeDPSS(64, 4, 5);
    for (let i = 0; i < eigenvalues.length - 1; i++) {
      expect(eigenvalues[i]).toBeGreaterThanOrEqual(eigenvalues[i + 1] - 0.01);
    }
  });

  test('first few concentration ratios are near 1', () => {
    const { eigenvalues } = computeDPSS(128, 4, 3);
    // For NW=4, K=3 on N=128, the first 2*NW-1=7 tapers should
    // have concentration near 1. The first 3 certainly should.
    for (let i = 0; i < 3; i++) {
      expect(eigenvalues[i]).toBeGreaterThan(0.9);
    }
  });

  test('returns correct number of tapers', () => {
    const { tapers, eigenvalues } = computeDPSS(32, 3, 4);
    expect(tapers.length).toBe(4);
    expect(eigenvalues.length).toBe(4);
    expect(tapers[0].length).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// MTM
// ---------------------------------------------------------------------------

describe('mtm', () => {
  test('detects single sinusoid frequency', () => {
    const x = sinusoid(128, 0.1);
    const result = mtm(x, 1, { nw: 4, k: 7 });

    const peak = peakFrequency(result);
    expect(peak).toBeCloseTo(0.1, 1);
  });

  test('significance is high at signal frequency', () => {
    const N = 256;
    const x = new Float64Array(N);
    // Strong sinusoid + noise
    for (let i = 0; i < N; i++) {
      x[i] = 10 * Math.sin(2 * Math.PI * 0.15 * i) + Math.random() - 0.5;
    }

    const result = mtm(x, 1, { nw: 4 });

    // Find the frequency bin closest to 0.15
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < result.frequency.length; i++) {
      const d = Math.abs(result.frequency[i] - 0.15);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    // Significance at the signal frequency should be high
    expect(result.significance[bestIdx]).toBeGreaterThan(0.8);
  });

  test('power is non-negative', () => {
    const x = sinusoid(64, 0.2);
    const result = mtm(x, 1, { nw: 3 });
    for (let i = 0; i < result.power.length; i++) {
      expect(result.power[i]).toBeGreaterThanOrEqual(0);
    }
  });

  test('significance values are in [0, 1]', () => {
    const x = sinusoid(64, 0.2);
    const result = mtm(x, 1, { nw: 3 });
    for (let i = 0; i < result.significance.length; i++) {
      expect(result.significance[i]).toBeGreaterThanOrEqual(0);
      expect(result.significance[i]).toBeLessThanOrEqual(1);
    }
  });
});
