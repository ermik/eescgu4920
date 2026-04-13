import { bench, describe } from 'vitest';
import { pca } from './pca';

function makeSeries(N: number, phase: number): Float64Array {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = Math.sin(i * 0.1 + phase) + Math.cos(i * 0.03 + phase);
  }
  return x;
}

describe('PCA (UI-thread budget check)', () => {
  // PCA window calls pca() synchronously on open (definePCA.ts:48). The matrix
  // is p×p where p = number of selected series. Main risk: O(p⁴) classical
  // Jacobi — same pathology we fixed in ssa.ts but still present in pca.ts.
  const make = (p: number, N: number) =>
    Array.from({ length: p }, (_, k) => makeSeries(N, k * 0.7));

  bench('p=5 vars, N=1500 pts (typical)', () => {
    pca(make(5, 1500));
  });

  bench('p=20 vars, N=1500 pts', () => {
    pca(make(20, 1500));
  });

  bench('p=50 vars, N=3000 pts (adversarial)', () => {
    pca(make(50, 3000));
  });
});
