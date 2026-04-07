/**
 * Public API for astronomical orbital parameters and insolation computation.
 */

import type {
  AstroSolution, InsolationType, OrbitalParams, AstroProvider,
} from './types';
import { createBerger1978 } from './solutions/berger1978';
import {
  createLaskar2004, createLaskar1993_01, createLaskar1993_11,
  createLaskar2010a, createLaskar2010b, createLaskar2010c, createLaskar2010d,
} from './solutions/laskar';
import {
  insoDailyRadians, insoMeanRadians, insoCalSummerNH, insoCalWinterNH,
} from './insolation';

export type { AstroSolution, InsolationType, OrbitalParams } from './types';

const DEG_TO_RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Provider cache
// ---------------------------------------------------------------------------

const providerCache = new Map<AstroSolution, AstroProvider>();

async function getProvider(solution: AstroSolution): Promise<AstroProvider> {
  const cached = providerCache.get(solution);
  if (cached) return cached;

  let provider: AstroProvider;
  switch (solution) {
    case 'Berger1978': provider = createBerger1978(); break;
    case 'Laskar2004': provider = await createLaskar2004(); break;
    case 'Laskar1993_01': provider = await createLaskar1993_01(); break;
    case 'Laskar1993_11': provider = await createLaskar1993_11(); break;
    case 'Laskar2010a': provider = await createLaskar2010a(); break;
    case 'Laskar2010b': provider = await createLaskar2010b(); break;
    case 'Laskar2010c': provider = await createLaskar2010c(); break;
    case 'Laskar2010d': provider = await createLaskar2010d(); break;
    default: throw new Error(`Unknown solution: ${solution}`);
  }
  providerCache.set(solution, provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Orbital parameters
// ---------------------------------------------------------------------------

/**
 * Compute orbital parameters at a series of time points.
 *
 * @param solution  Astronomical solution name
 * @param timeKyr   Time points in kiloyears (negative = past)
 * @returns Orbital parameters (eccentricity, obliquity in radians, precession in radians)
 */
export async function computeOrbitalParams(
  solution: AstroSolution,
  timeKyr: Float64Array,
): Promise<OrbitalParams> {
  const provider = await getProvider(solution);
  const n = timeKyr.length;
  const ecc = new Float64Array(n);
  const obl = new Float64Array(n);
  const pre = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = timeKyr[i];
    ecc[i] = provider.eccentricity(t);
    obl[i] = provider.hasObliquity ? provider.obliquity(t) : NaN;
    pre[i] = provider.hasPrecession ? provider.precessionAngle(t) : NaN;
  }

  return { time: timeKyr, eccentricity: ecc, obliquity: obl, precessionAngle: pre };
}

// ---------------------------------------------------------------------------
// Insolation series
// ---------------------------------------------------------------------------

/**
 * Compute an insolation or orbital parameter series from orbital parameters.
 *
 * @param type           Type of output (eccentricity, obliquity, insolation, etc.)
 * @param orbitalParams  Pre-computed orbital parameters
 * @param options        Physical parameters (solar constant, latitude, longitudes)
 * @returns Values array (W/m^2 for insolation, degrees for orbital angles, dimensionless for ecc)
 */
export function computeInsolation(
  type: InsolationType,
  orbitalParams: OrbitalParams,
  options: {
    solarConstant?: number;
    latitude?: number;
    trueLongitude1?: number;
    trueLongitude2?: number;
  } = {},
): Float64Array {
  const S = options.solarConstant ?? 1365;
  const latDeg = options.latitude ?? 65;
  const lon1Deg = options.trueLongitude1 ?? 90;
  const lon2Deg = options.trueLongitude2 ?? 180;

  const lat = latDeg * DEG_TO_RAD;
  const lon1 = lon1Deg * DEG_TO_RAD;
  const lon2 = lon2Deg * DEG_TO_RAD;

  const n = orbitalParams.time.length;
  const { eccentricity, obliquity, precessionAngle } = orbitalParams;
  const values = new Float64Array(n);

  switch (type) {
    case 'Eccentricity':
      values.set(eccentricity);
      break;

    case 'Obliquity':
      for (let i = 0; i < n; i++) values[i] = obliquity[i] / DEG_TO_RAD;
      break;

    case 'Precession angle':
      for (let i = 0; i < n; i++) values[i] = precessionAngle[i] / DEG_TO_RAD;
      break;

    case 'Precession parameter':
      for (let i = 0; i < n; i++) {
        values[i] = eccentricity[i] * Math.sin(precessionAngle[i]);
      }
      break;

    case 'Daily insolation':
      for (let i = 0; i < n; i++) {
        values[i] = S * insoDailyRadians(
          lon1, lat, obliquity[i], eccentricity[i], precessionAngle[i],
        );
      }
      break;

    case 'Integrated insolation between 2 true longitudes':
      for (let i = 0; i < n; i++) {
        values[i] = S * insoMeanRadians(
          lon1, lon2, lat, obliquity[i], eccentricity[i], precessionAngle[i],
        );
      }
      break;

    case 'Caloric summer insolation':
      for (let i = 0; i < n; i++) {
        values[i] = S * insoCalSummerNH(
          lat, obliquity[i], eccentricity[i], precessionAngle[i],
        );
      }
      break;

    case 'Caloric winter insolation':
      for (let i = 0; i < n; i++) {
        values[i] = S * insoCalWinterNH(
          lat, obliquity[i], eccentricity[i], precessionAngle[i],
        );
      }
      break;
  }

  return values;
}
