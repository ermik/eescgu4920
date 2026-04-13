import { bench, describe } from 'vitest';
import { ssa } from './ssa';

function makeSeries(N: number): Float64Array {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = Math.sin(i * 0.1) + Math.sin(i * 0.03) + Math.cos(i * 0.005);
  }
  return x;
}

describe('SSA decomposition (UI-thread budget check)', () => {
  const x1500 = makeSeries(1500);

  bench('N=1500, M=40 (window default cap)', () => {
    ssa(x1500, { windowLength: 40, nComponents: 5 });
  });

  bench('N=1500, M=100 (moderate manual override)', () => {
    ssa(x1500, { windowLength: 100, nComponents: 5 });
  });

  bench('N=1500, M=200 (heavy manual override)', () => {
    ssa(x1500, { windowLength: 200, nComponents: 5 });
  });
});
