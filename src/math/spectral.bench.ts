import { bench, describe } from 'vitest';
import { maxEntropy, mtm, computeDPSS, periodogram, blackmanTukey } from './spectral';

function makeSeries(N: number): Float64Array {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = Math.sin(i * 0.1) + Math.sin(i * 0.03) + Math.cos(i * 0.005) + 0.2 * Math.random();
  }
  return x;
}

describe('Spectral: periodogram / Blackman-Tukey (baseline)', () => {
  const x1500 = makeSeries(1500);
  const x3000 = makeSeries(3000);

  bench('periodogram N=1500', () => {
    periodogram(x1500, 1);
  });

  bench('periodogram N=3000', () => {
    periodogram(x3000, 1);
  });

  bench('Blackman-Tukey N=3000, default lag', () => {
    blackmanTukey(x3000, 1);
  });
});

describe('Spectral: Burg max-entropy (order defaults to N/3 — high freeze risk)', () => {
  // maxEntropy runs burgAR which is O(order·N) per step × order steps = O(order²·N).
  // Default order = N/3, so for N=3000 that's ~10^10 ops on the UI thread,
  // triggered (with 500ms debounce) from defineSpectral.ts when the user picks
  // "Max Entropy". Allocates two new Float64Array(N) per order step too.
  const x1500 = makeSeries(1500);
  const x3000 = makeSeries(3000);

  bench('N=1500, order=50 (sensible manual)', () => {
    maxEntropy(x1500, 1, { order: 50 });
  });

  bench('N=1500, order=500 (default ≈ N/3)', () => {
    maxEntropy(x1500, 1, { order: 500 });
  });

  bench('N=3000, order=100 (moderate manual)', () => {
    maxEntropy(x3000, 1, { order: 100 });
  });

  bench('N=3000, order=1000 (default ≈ N/3 — freeze territory)', () => {
    maxEntropy(x3000, 1, { order: 1000 });
  });
});

describe('Spectral: MTM + DPSS (one-off cost per window open)', () => {
  // computeDPSS uses inverse iteration on an N×N tridiagonal — O(iter·N·K).
  // Called once per MTM invocation; the full mtm() also runs an adaptive
  // weighting loop (≤10 sweeps × nFreqs × K). Bounded, but noticeable on open.
  const x1500 = makeSeries(1500);
  const x3000 = makeSeries(3000);

  bench('DPSS N=1500, NW=4, K=7', () => {
    computeDPSS(1500, 4, 7);
  });

  bench('DPSS N=3000, NW=4, K=7', () => {
    computeDPSS(3000, 4, 7);
  });

  bench('DPSS N=3000, NW=6, K=11 (higher resolution)', () => {
    computeDPSS(3000, 6, 11);
  });

  bench('MTM N=1500, NW=4, K=7', () => {
    mtm(x1500, 1, { nw: 4, k: 7 });
  });

  bench('MTM N=3000, NW=4, K=7', () => {
    mtm(x3000, 1, { nw: 4, k: 7 });
  });
});
