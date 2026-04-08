import { describe, it, expect } from 'vitest';
import { autoCorrelation, crossCorrelation } from './correlation';

describe('Auto-correlation', () => {
  it('constant series with removeMean=false → peak 1.0', () => {
    const values = new Float64Array(100).fill(5);
    const result = autoCorrelation(values, { removeMean: false, normalize: true });
    expect(result.values[Math.floor(result.values.length / 2)]).toBeCloseTo(1, 5);
  });

  it('peak at lag 0 is 1.0 for normalized auto-correlation', () => {
    const n = 128;
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      values[i] = Math.sin(2 * Math.PI * 4 * i / n) + Math.random() * 0.1;
    }

    const result = autoCorrelation(values, { normalize: true, removeMean: true });
    const center = Math.floor(result.values.length / 2);
    expect(result.values[center]).toBeCloseTo(1, 1);
    expect(result.lags[center]).toBe(0);
  });

  it('sine wave has oscillating auto-correlation', () => {
    const n = 256;
    const period = 32;
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      values[i] = Math.sin(2 * Math.PI * i / period);
    }

    const result = autoCorrelation(values, { normalize: true, removeMean: true });
    const center = Math.floor(result.values.length / 2);

    expect(result.values[center]).toBeCloseTo(1, 2);

    const lagPeriod = center + period;
    if (lagPeriod < result.values.length) {
      expect(result.values[lagPeriod]).toBeGreaterThan(0.5);
    }
  });
});

describe('Cross-correlation', () => {
  it('delayed copy has peak at correct lag', () => {
    const n = 128;
    const delay = 10;
    const a = new Float64Array(n);
    const b = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(2 * Math.PI * 3 * i / n);
    }
    for (let i = 0; i < n; i++) {
      b[i] = i + delay < n ? a[i + delay] : 0;
    }

    const result = crossCorrelation(a, b, { normalize: true, removeMean: true });

    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < result.values.length; i++) {
      if (result.values[i] > maxVal) {
        maxVal = result.values[i];
        maxIdx = i;
      }
    }

    expect(Math.abs(result.lags[maxIdx] - delay)).toBeLessThanOrEqual(2);
  });

  it('FFT and direct computation match', () => {
    const n = 64;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(2 * Math.PI * i / 16);
      b[i] = Math.cos(2 * Math.PI * i / 16);
    }

    const fftResult = crossCorrelation(a, b, { useFft: true, mode: 'crossproduct', removeMean: false });
    const directResult = crossCorrelation(a, b, { useFft: false, mode: 'crossproduct', removeMean: false });

    expect(fftResult.values.length).toBe(directResult.values.length);
    for (let i = 0; i < fftResult.values.length; i++) {
      expect(fftResult.values[i]).toBeCloseTo(directResult.values[i], 5);
    }
  });

  it('cross-correlation symmetry: corr(a,b)[k] = corr(b,a)[-k]', () => {
    const n = 64;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(2 * Math.PI * i / 16) + 0.5;
      b[i] = Math.cos(2 * Math.PI * i / 8) + 0.3;
    }

    const ab = crossCorrelation(a, b, { mode: 'crossproduct', removeMean: false });
    const ba = crossCorrelation(b, a, { mode: 'crossproduct', removeMean: false });

    const center = Math.floor(ab.values.length / 2);
    for (let k = -10; k <= 10; k++) {
      const abIdx = center + k;
      const baIdx = center - k;
      if (abIdx >= 0 && abIdx < ab.values.length && baIdx >= 0 && baIdx < ba.values.length) {
        expect(ab.values[abIdx]).toBeCloseTo(ba.values[baIdx], 5);
      }
    }
  });

  it('uncorrelated signals have near-zero cross-correlation', () => {
    const n = 256;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = Math.sin(2 * Math.PI * 7 * i / n);
      b[i] = Math.sin(2 * Math.PI * 13 * i / n);
    }

    const result = crossCorrelation(a, b, { normalize: true, removeMean: true });
    let maxAbs = 0;
    for (let i = 0; i < result.values.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(result.values[i]));
    }
    expect(maxAbs).toBeLessThan(0.3);
  });
});
