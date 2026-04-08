import { describe, it, expect } from 'vitest';
import { fft, nextPow2 } from './fft';

describe('FFT', () => {
  it('nextPow2 returns correct values', () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(100)).toBe(128);
  });

  it('forward + inverse FFT recovers original signal', () => {
    const N = 8;
    const data = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
      data[2 * i] = Math.sin(2 * Math.PI * i / N);
      data[2 * i + 1] = 0;
    }
    const original = new Float64Array(data);

    fft(data, false);
    fft(data, true);

    for (let i = 0; i < 2 * N; i++) {
      expect(data[i]).toBeCloseTo(original[i], 10);
    }
  });

  it('Parseval theorem: energy preserved', () => {
    const N = 16;
    const data = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
      data[2 * i] = Math.cos(2 * Math.PI * 3 * i / N);
    }

    let energyTime = 0;
    for (let i = 0; i < N; i++) {
      energyTime += data[2 * i] * data[2 * i];
    }

    fft(data, false);

    let energyFreq = 0;
    for (let i = 0; i < N; i++) {
      energyFreq += data[2 * i] * data[2 * i] + data[2 * i + 1] * data[2 * i + 1];
    }
    energyFreq /= N;

    expect(energyFreq).toBeCloseTo(energyTime, 8);
  });
});
