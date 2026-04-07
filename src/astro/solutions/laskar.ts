/**
 * Laskar precomputed orbital solutions.
 *
 * Each solution reads a JSON table of orbital parameters at 1 kyr intervals
 * and interpolates linearly. Tables are lazy-loaded on first use.
 *
 * Supported solutions:
 * - Laskar2004: -101000 to +21000 kyr (ecc, obl, pre)
 * - Laskar1993_01, Laskar1993_11: -20000 to +10000 kyr (ecc, obl, pre)
 * - Laskar2010a/b/c/d: -249999 to 0 kyr (eccentricity only)
 */

import type { AstroProvider, LaskarTableData } from '../types';

// ---------------------------------------------------------------------------
// Table cache and loader
// ---------------------------------------------------------------------------

const tableCache = new Map<string, LaskarTableData>();

/** Resolve the base URL for static assets. Works in Vite and test environments. */
function getBaseUrl(): string {
  try {
    // Vite injects import.meta.env at build time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = import.meta as any;
    return meta.env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

async function loadTable(name: string): Promise<LaskarTableData> {
  const cached = tableCache.get(name);
  if (cached) return cached;

  const base = getBaseUrl();
  const url = `${base}astro-tables/${name}.json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load astronomical table "${name}": ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as LaskarTableData;
  tableCache.set(name, data);
  return data;
}

/** Allow tests to inject table data directly. */
export function injectTable(name: string, data: LaskarTableData): void {
  tableCache.set(name, data);
}

// ---------------------------------------------------------------------------
// Linear interpolation on evenly-spaced table
// ---------------------------------------------------------------------------

function lerpTable(arr: number[], tMin: number, tStep: number, t: number): number {
  const idx = (t - tMin) / tStep;
  const i0 = Math.floor(idx);
  const i1 = i0 + 1;
  if (i0 < 0 || i1 >= arr.length) return NaN;
  const frac = idx - i0;
  return arr[i0] * (1 - frac) + arr[i1] * frac;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

function createLaskarFullProvider(data: LaskarTableData): AstroProvider {
  const { tMin, tStep, ecc, obl, sinPre, cosPre } = data;
  const hasObl = !!obl;
  const hasPre = !!sinPre && !!cosPre;

  return {
    hasObliquity: hasObl,
    hasPrecession: hasPre,

    eccentricity(t: number): number {
      return lerpTable(ecc, tMin, tStep, t);
    },

    obliquity(t: number): number {
      if (!obl) return NaN;
      return lerpTable(obl, tMin, tStep, t);
    },

    precessionAngle(t: number): number {
      if (!sinPre || !cosPre) return NaN;
      const sp = lerpTable(sinPre, tMin, tStep, t);
      const cp = lerpTable(cosPre, tMin, tStep, t);
      const angle = Math.atan2(sp, cp);
      return angle < 0 ? angle + 2 * Math.PI : angle;
    },

    precessionParameter(t: number): number {
      return this.eccentricity(t) * Math.sin(this.precessionAngle(t));
    },

    inRange(t: number): boolean {
      return t >= data.tMin && t <= data.tMax;
    },
  };
}

function createLaskarEccOnlyProvider(data: LaskarTableData): AstroProvider {
  const { tMin, tStep, ecc } = data;

  return {
    hasObliquity: false,
    hasPrecession: false,

    eccentricity(t: number): number {
      return lerpTable(ecc, tMin, tStep, t);
    },

    obliquity(_t: number): number {
      return NaN;
    },

    precessionAngle(_t: number): number {
      return NaN;
    },

    precessionParameter(_t: number): number {
      return NaN;
    },

    inRange(t: number): boolean {
      return t >= data.tMin && t <= data.tMax;
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory functions
// ---------------------------------------------------------------------------

export async function createLaskar2004(): Promise<AstroProvider> {
  const data = await loadTable('laskar2004');
  return createLaskarFullProvider(data);
}

export async function createLaskar1993_01(): Promise<AstroProvider> {
  const data = await loadTable('laskar1993_01');
  return createLaskarFullProvider(data);
}

export async function createLaskar1993_11(): Promise<AstroProvider> {
  const data = await loadTable('laskar1993_11');
  return createLaskarFullProvider(data);
}

export async function createLaskar2010a(): Promise<AstroProvider> {
  const data = await loadTable('laskar2010a');
  return createLaskarEccOnlyProvider(data);
}

export async function createLaskar2010b(): Promise<AstroProvider> {
  const data = await loadTable('laskar2010b');
  return createLaskarEccOnlyProvider(data);
}

export async function createLaskar2010c(): Promise<AstroProvider> {
  const data = await loadTable('laskar2010c');
  return createLaskarEccOnlyProvider(data);
}

export async function createLaskar2010d(): Promise<AstroProvider> {
  const data = await loadTable('laskar2010d');
  return createLaskarEccOnlyProvider(data);
}
