/**
 * Noise signal generators.
 *
 * Spec: PDF §7.2 — Noise generation with multiple distribution types,
 * optional red noise (AR(1) autocorrelation).
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoiseType =
  | 'uniform'
  | 'gaussian'
  | 'exponential'
  | 'double-exponential'
  | 'lorentzian';

export interface NoiseOptions {
  /** Distribution type (default: 'gaussian'). */
  type?: NoiseType;
  /** Number of output points. */
  nPoints: number;
  /** Start x value. */
  xStart: number;
  /** End x value. */
  xEnd: number;
  /** Center (mean) of the distribution (default: 0). */
  center?: number;
  /** Variance of the distribution (default: 1). */
  variance?: number;
  /**
   * AR(1) autocorrelation coefficient for red noise (0 = white, 0.9 = very red).
   * Default: 0.
   */
  redNoise?: number;
  /** PRNG seed for reproducibility (default: random). */
  seed?: number;
}

export interface NoiseResult {
  index: Float64Array;
  values: Float64Array;
}

// ---------------------------------------------------------------------------
// Simple seeded PRNG (xoshiro128**)
// ---------------------------------------------------------------------------

function splitmix32(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x9e3779b9 | 0;
    let t = a ^ a >>> 16; t = Math.imul(t, 0x21f0aaad);
    t = t ^ t >>> 15; t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Distribution samplers
// ---------------------------------------------------------------------------

/** Uniform in [center - half, center + half] where half = sqrt(3*variance). */
function uniformSample(rng: () => number, center: number, variance: number): number {
  const half = Math.sqrt(3 * variance);
  return center + (rng() * 2 - 1) * half;
}

/** Gaussian via Box-Muller. */
function gaussianSample(rng: () => number, center: number, variance: number): number {
  const u1 = rng() || 1e-15;
  const u2 = rng();
  return center + Math.sqrt(variance) * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Exponential (shifted to center). */
function exponentialSample(rng: () => number, center: number, variance: number): number {
  const lambda = 1 / Math.sqrt(variance);
  const u = rng() || 1e-15;
  return center + (-Math.log(u) / lambda - Math.sqrt(variance));
}

/** Double exponential (Laplace). */
function doubleExponentialSample(rng: () => number, center: number, variance: number): number {
  const b = Math.sqrt(variance / 2);
  const u = rng() - 0.5;
  return center - b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/** Lorentzian (Cauchy). */
function lorentzianSample(rng: () => number, center: number, _variance: number): number {
  const gamma = Math.sqrt(_variance);
  const u = rng();
  return center + gamma * Math.tan(Math.PI * (u - 0.5));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a noise time series.
 */
export function generateNoise(options: NoiseOptions): NoiseResult {
  const {
    type = 'gaussian',
    nPoints,
    xStart,
    xEnd,
    center = 0,
    variance = 1,
    redNoise = 0,
    seed,
  } = options;

  if (nPoints < 1) throw new RangeError('nPoints must be at least 1.');

  const rng = splitmix32(seed ?? (Math.random() * 0xFFFFFFFF) | 0);

  // Select sampler
  let sampler: (rng: () => number, center: number, variance: number) => number;
  switch (type) {
    case 'uniform': sampler = uniformSample; break;
    case 'gaussian': sampler = gaussianSample; break;
    case 'exponential': sampler = exponentialSample; break;
    case 'double-exponential': sampler = doubleExponentialSample; break;
    case 'lorentzian': sampler = lorentzianSample; break;
  }

  // Generate white noise
  const white = new Float64Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    white[i] = sampler(rng, 0, variance);
  }

  // Apply AR(1) red noise filter: y[n] = redNoise * y[n-1] + white[n]
  const values = new Float64Array(nPoints);
  values[0] = white[0] + center;
  const rho = Math.max(-0.99, Math.min(0.99, redNoise));
  for (let i = 1; i < nPoints; i++) {
    values[i] = rho * (values[i - 1] - center) + white[i] + center;
  }

  // Index
  const index = new Float64Array(nPoints);
  const step = nPoints > 1 ? (xEnd - xStart) / (nPoints - 1) : 0;
  for (let i = 0; i < nPoints; i++) index[i] = xStart + i * step;

  return { index, values };
}
