import { bench, describe } from 'vitest';
import { autoCorrelation, crossCorrelation } from './correlation';

function makeSeries(N: number, phase = 0): Float64Array {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = Math.sin(i * 0.1 + phase) + 0.5 * Math.cos(i * 0.03 + phase);
  }
  return x;
}

describe('Correlation: FFT mode (default)', () => {
  // FFT path is O(N log N). Default ON in defineCorrelation.ts.
  const x1500 = makeSeries(1500);
  const x3000 = makeSeries(3000);

  bench('auto-correlation N=1500, FFT', () => {
    autoCorrelation(x1500, { useFft: true });
  });

  bench('auto-correlation N=3000, FFT', () => {
    autoCorrelation(x3000, { useFft: true });
  });

  bench('cross-correlation N=3000, FFT', () => {
    crossCorrelation(x3000, makeSeries(3000, 0.7), { useFft: true });
  });
});

describe('Correlation: direct mode (@change with "Use FFT" unticked)', () => {
  // Direct path always computes at fullMaxLag = N-1 (see correlation.ts:165–173),
  // so work is O(N²) regardless of the user-supplied maxLag. Triggered without
  // debounce from a single checkbox click in defineCorrelation.ts:104.
  const x1500 = makeSeries(1500);
  const x3000 = makeSeries(3000);

  bench('auto-correlation N=1500, direct', () => {
    autoCorrelation(x1500, { useFft: false });
  });

  bench('auto-correlation N=3000, direct (UI budget stress)', () => {
    autoCorrelation(x3000, { useFft: false });
  });

  bench('cross-correlation N=3000, direct', () => {
    crossCorrelation(x3000, makeSeries(3000, 0.7), { useFft: false });
  });
});
