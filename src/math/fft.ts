/**
 * Radix-2 Cooley-Tukey FFT implementation.
 *
 * Operates on interleaved real/imaginary Float64Arrays:
 *   [re0, im0, re1, im1, ...] with length = 2 * N where N is a power of 2.
 */

/**
 * In-place radix-2 decimation-in-time FFT.
 * @param data  Interleaved [re, im, re, im, ...] of length 2*N (N must be power of 2)
 * @param inverse  If true, compute the inverse FFT (with 1/N scaling)
 */
export function fft(data: Float64Array, inverse: boolean = false): void {
  const N = data.length / 2;
  if (N < 1 || (N & (N - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, got ${N}`);
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      // Swap complex elements i and j
      let t = data[2 * i]; data[2 * i] = data[2 * j]; data[2 * j] = t;
      t = data[2 * i + 1]; data[2 * i + 1] = data[2 * j + 1]; data[2 * j + 1] = t;
    }
  }

  // Butterfly stages
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= N; len *= 2) {
    const halfLen = len / 2;
    const angle = sign * 2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const uIdx = 2 * (i + j);
        const vIdx = 2 * (i + j + halfLen);

        const tRe = curRe * data[vIdx] - curIm * data[vIdx + 1];
        const tIm = curRe * data[vIdx + 1] + curIm * data[vIdx];

        data[vIdx] = data[uIdx] - tRe;
        data[vIdx + 1] = data[uIdx + 1] - tIm;
        data[uIdx] += tRe;
        data[uIdx + 1] += tIm;

        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }

  // Scale for inverse
  if (inverse) {
    for (let i = 0; i < data.length; i++) {
      data[i] /= N;
    }
  }
}

/** Return the smallest power of 2 >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
