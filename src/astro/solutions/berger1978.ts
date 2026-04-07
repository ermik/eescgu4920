/**
 * Berger 1978 analytical orbital solution.
 *
 * Reference: Berger, A. (1978). Long-term variations of daily insolation and
 * quaternary climatic changes. J. Atmos. Sci., 35(12), 2362-2367.
 *
 * Ported from the Python `inso` package (inso/astro.py, class AstroBerger1978).
 */

import type { AstroProvider } from '../types';

const PI = Math.PI;
const DEG = PI / 180;
const SEC = DEG / 3600;

// ---------------------------------------------------------------------------
// Coefficient tables (19 eccentricity, 18 obliquity, 9 precession terms)
// ---------------------------------------------------------------------------

// Eccentricity amplitudes (dimensionless)
const ECC_A = [
  0.01860798, 0.01627522, -0.01300660, 0.00988829, -0.00336700,
  0.00333077, -0.00235400, 0.00140015, 0.00100700, 0.00085700,
  0.00064990, 0.00059900, 0.00037800, -0.00033700, 0.00027600,
  0.00018200, -0.00017400, -0.00012400, 0.00001250,
];

// Eccentricity frequencies (arcsec/yr → rad/yr)
const ECC_B = [
  4.207205, 7.346091, 17.857263, 17.220546, 16.846733,
  5.199079, 18.231076, 26.216758, 6.359169, 16.210016,
  3.065181, 16.583829, 18.493980, 6.190953, 18.867793,
  17.425567, 6.186001, 18.417441, 0.667863,
].map(v => v * SEC);

// Eccentricity phases (degrees → radians)
const ECC_C = [
  28.620089, 193.788772, 308.307024, 320.199637, 279.376984,
  87.195000, 349.129677, 128.443387, 154.143880, 291.269597,
  114.860583, 332.092251, 296.414411, 145.769910, 337.237063,
  152.092288, 126.839891, 210.667199, 72.108838,
].map(v => v * DEG);

// Obliquity mean value (radians)
const OBL_0 = 23.320556 * DEG;

// Obliquity amplitudes (arcsec → radians)
const OBL_A = [
  -2462.22, -857.32, -629.32, -414.28, -311.76, 308.94,
  -162.55, -116.11, 101.12, -67.69, 24.91, 22.58,
  -21.16, -15.65, 15.39, 14.67, -11.73, 10.27,
].map(v => v * SEC);

// Obliquity frequencies (arcsec/yr → rad/yr)
const OBL_B = [
  31.609970, 32.620499, 24.172195, 31.983780, 44.828339,
  30.973251, 43.668243, 32.246689, 30.599442, 42.681320,
  43.836456, 47.439438, 63.219955, 64.230484, 1.010530,
  7.437771, 55.782181, 0.373813,
].map(v => v * SEC);

// Obliquity phases (degrees → radians)
const OBL_C = [
  251.9025, 280.8325, 128.3057, 292.7251, 15.3747, 263.7952,
  308.4258, 240.0099, 222.9725, 268.7810, 316.7998, 319.6023,
  143.8050, 172.7351, 28.9300, 123.5968, 20.2042, 40.8226,
].map(v => v * DEG);

// Precession constants
const PRE_0 = 3.392506 * DEG;
const PRE_RATE = 50.439273 * SEC;

// Precession amplitudes (arcsec → radians)
const PRE_A = [
  7391.02, 2555.15, 2022.76, -1973.65, 1240.23,
  953.87, -931.75, 872.38, 606.35,
].map(v => v * SEC);

// Precession frequencies (arcsec/yr → rad/yr)
const PRE_B = [
  31.609970, 32.620499, 24.172195, 0.636717, 31.983780,
  3.138886, 30.973251, 44.828339, 0.991874,
].map(v => v * SEC);

// Precession phases (degrees → radians)
const PRE_C = [
  251.9025, 280.8325, 128.3057, 348.1074, 292.7251,
  165.1686, 263.7952, 15.3747, 58.5749,
].map(v => v * DEG);

// ---------------------------------------------------------------------------
// Computation helpers
// ---------------------------------------------------------------------------

/** Compute (e*sin(pi_tilde), e*cos(pi_tilde)) from the eccentricity series. */
function eccAndPi(t: number): [number, number] {
  let xes = 0;
  let xec = 0;
  for (let i = 0; i < 19; i++) {
    const arg = ECC_B[i] * t + ECC_C[i];
    xes += ECC_A[i] * Math.sin(arg);
    xec += ECC_A[i] * Math.cos(arg);
  }
  return [xes, xec];
}

/** General precession angle at time t (years). */
function generalPrecession(t: number): number {
  let p = PRE_RATE * t;
  for (let i = 0; i < 9; i++) {
    p += PRE_A[i] * Math.sin(PRE_B[i] * t + PRE_C[i]);
  }
  return p + PRE_0;
}

// ---------------------------------------------------------------------------
// Public provider
// ---------------------------------------------------------------------------

export function createBerger1978(): AstroProvider {
  return {
    hasObliquity: true,
    hasPrecession: true,

    eccentricity(time: number): number {
      const [xes, xec] = eccAndPi(1000 * time);
      return Math.sqrt(xes * xes + xec * xec);
    },

    obliquity(time: number): number {
      const t = 1000 * time;
      let x = OBL_0;
      for (let i = 0; i < 18; i++) {
        x += OBL_A[i] * Math.cos(OBL_B[i] * t + OBL_C[i]);
      }
      return x;
    },

    precessionAngle(time: number): number {
      const t = 1000 * time;
      const [xes, xec] = eccAndPi(t);
      const perh = Math.atan2(xes, xec) + generalPrecession(t);
      // Positive modulo 2*PI
      const r = perh % (2 * PI);
      return r < 0 ? r + 2 * PI : r;
    },

    precessionParameter(time: number): number {
      const [xes, xec] = eccAndPi(1000 * time);
      const ecc = Math.sqrt(xes * xes + xec * xec);
      const pre = this.precessionAngle(time);
      return ecc * Math.sin(pre);
    },

    inRange(_t: number): boolean {
      return true; // Analytical solution valid for all time (accuracy degrades beyond ~5 Myr)
    },
  };
}
