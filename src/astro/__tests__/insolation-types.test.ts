/**
 * Comprehensive tests for all 8 insolation / astronomical series types.
 *
 * Verifies the full computation pipeline: Berger 1978 orbital parameters →
 * insolation functions → computeInsolation dispatcher.
 */

import { describe, it, expect } from 'vitest';
import { createBerger1978 } from '../solutions/berger1978';
import { computeOrbitalParams, computeInsolation } from '../index';
import type { InsolationType, OrbitalParams } from '../types';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute orbital params synchronously for Berger1978 (already cached after first call). */
async function bergerParams(timeKyr: number[]): Promise<OrbitalParams> {
  return computeOrbitalParams('Berger1978', new Float64Array(timeKyr));
}

function countNaN(arr: Float64Array): number {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isNaN(arr[i])) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Orbital parameter tests
// ---------------------------------------------------------------------------

describe('Orbital parameter types', () => {
  it('obliquity returns values in expected range (22°–25°)', async () => {
    const orb = await bergerParams([0]);
    const oblDeg = orb.obliquity[0] * 180 / Math.PI;
    expect(oblDeg).toBeGreaterThan(22);
    expect(oblDeg).toBeLessThan(25);
    expect(Number.isNaN(oblDeg)).toBe(false);
  });

  it('precession angle returns non-NaN values', async () => {
    const orb = await bergerParams([0, -10, -100]);
    for (let i = 0; i < orb.precessionAngle.length; i++) {
      expect(Number.isNaN(orb.precessionAngle[i])).toBe(false);
    }
  });

  it('precession parameter can be derived from ecc and precession angle', async () => {
    const orb = await bergerParams([0]);
    const precParam = orb.eccentricity[0] * Math.sin(orb.precessionAngle[0]);
    expect(Number.isNaN(precParam)).toBe(false);
    expect(Math.abs(precParam)).toBeLessThan(0.1); // bounded by eccentricity
  });

  it('obliquity varies over 1 Myr (not constant)', async () => {
    const orb = await bergerParams([0, -100, -200, -500, -1000]);
    const oblValues = Array.from(orb.obliquity).map(v => v / DEG);
    const min = Math.min(...oblValues);
    const max = Math.max(...oblValues);
    expect(max - min).toBeGreaterThan(0.5); // at least 0.5° variation
  });

  it('precession angle varies over 1 Myr', async () => {
    const orb = await bergerParams([0, -10, -20, -30, -40]);
    const preValues = Array.from(orb.precessionAngle);
    const allSame = preValues.every(v => Math.abs(v - preValues[0]) < 1e-6);
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeInsolation dispatch tests — orbital types
// ---------------------------------------------------------------------------

describe('computeInsolation — orbital types', () => {
  it('Eccentricity returns raw dimensionless values', async () => {
    const orb = await bergerParams([0, -100, -500]);
    const values = computeInsolation('Eccentricity', orb);
    expect(values.length).toBe(3);
    for (let i = 0; i < values.length; i++) {
      expect(Number.isNaN(values[i])).toBe(false);
      expect(values[i]).toBeGreaterThan(0);
      expect(values[i]).toBeLessThan(0.07);
    }
  });

  it('Obliquity returns values in degrees', async () => {
    const orb = await bergerParams([0, -100, -500]);
    const values = computeInsolation('Obliquity', orb);
    expect(values.length).toBe(3);
    for (let i = 0; i < values.length; i++) {
      expect(Number.isNaN(values[i])).toBe(false);
      expect(values[i]).toBeGreaterThan(22);
      expect(values[i]).toBeLessThan(25);
    }
  });

  it('Precession angle returns values in degrees (0–360)', async () => {
    const orb = await bergerParams([0, -10, -100]);
    const values = computeInsolation('Precession angle', orb);
    expect(values.length).toBe(3);
    for (let i = 0; i < values.length; i++) {
      expect(Number.isNaN(values[i])).toBe(false);
      expect(values[i]).toBeGreaterThanOrEqual(0);
      expect(values[i]).toBeLessThan(360);
    }
  });

  it('Precession parameter returns small dimensionless values', async () => {
    const orb = await bergerParams([0, -100, -500]);
    const values = computeInsolation('Precession parameter', orb);
    expect(values.length).toBe(3);
    for (let i = 0; i < values.length; i++) {
      expect(Number.isNaN(values[i])).toBe(false);
      expect(Math.abs(values[i])).toBeLessThan(0.1);
    }
  });
});

// ---------------------------------------------------------------------------
// computeInsolation dispatch tests — insolation types
// ---------------------------------------------------------------------------

describe('computeInsolation — insolation types', () => {
  it('Daily insolation at 65N summer solstice returns ~450–550 W/m²', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Daily insolation', orb, {
      solarConstant: 1365,
      latitude: 65,
      trueLongitude1: 90, // summer solstice
    });
    expect(values[0]).toBeGreaterThan(400);
    expect(values[0]).toBeLessThan(600);
    expect(Number.isNaN(values[0])).toBe(false);
  });

  it('Daily insolation at equator equinox returns reasonable value', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Daily insolation', orb, {
      solarConstant: 1365,
      latitude: 0,
      trueLongitude1: 0, // vernal equinox
    });
    // At equator on equinox, daily insolation ≈ S0/π ≈ 434 W/m²
    expect(values[0]).toBeGreaterThan(350);
    expect(values[0]).toBeLessThan(500);
  });

  it('Daily insolation during polar night is zero', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Daily insolation', orb, {
      solarConstant: 1365,
      latitude: 85, // near north pole
      trueLongitude1: 270, // winter solstice
    });
    expect(values[0]).toBeCloseTo(0, 1);
  });

  it('Integrated insolation between two longitudes returns positive value', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation(
      'Integrated insolation between 2 true longitudes', orb, {
        solarConstant: 1365,
        latitude: 65,
        trueLongitude1: 90,
        trueLongitude2: 180,
      },
    );
    expect(values[0]).toBeGreaterThan(0);
    expect(Number.isNaN(values[0])).toBe(false);
  });

  it('Caloric summer > caloric winter for northern hemisphere', async () => {
    const orb = await bergerParams([0]);
    const summer = computeInsolation('Caloric summer insolation', orb, {
      solarConstant: 1365,
      latitude: 65,
    });
    const winter = computeInsolation('Caloric winter insolation', orb, {
      solarConstant: 1365,
      latitude: 65,
    });
    expect(summer[0]).toBeGreaterThan(winter[0]);
    expect(Number.isNaN(summer[0])).toBe(false);
    expect(Number.isNaN(winter[0])).toBe(false);
  });

  it('Caloric summer insolation is in reasonable range for 65N', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Caloric summer insolation', orb, {
      solarConstant: 1365,
      latitude: 65,
    });
    // Summer half-year average at 65N: roughly 200–400 W/m²
    expect(values[0]).toBeGreaterThan(150);
    expect(values[0]).toBeLessThan(500);
  });

  it('Caloric winter insolation is in reasonable range for 65N', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Caloric winter insolation', orb, {
      solarConstant: 1365,
      latitude: 65,
    });
    // Winter half-year average at 65N: roughly 20–150 W/m²
    expect(values[0]).toBeGreaterThan(10);
    expect(values[0]).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// NaN propagation — 1000-point time series for all types
// ---------------------------------------------------------------------------

describe('No NaN propagation across 1000-point series', () => {
  const types: InsolationType[] = [
    'Eccentricity',
    'Obliquity',
    'Precession angle',
    'Precession parameter',
    'Daily insolation',
    'Integrated insolation between 2 true longitudes',
    'Caloric summer insolation',
    'Caloric winter insolation',
  ];

  for (const type of types) {
    it(`${type} — no NaN in 1001-point series`, async () => {
      const t = new Float64Array(1001);
      for (let i = 0; i <= 1000; i++) t[i] = -i; // 0 to -1000 kyr

      const orb = await computeOrbitalParams('Berger1978', t);
      const values = computeInsolation(type, orb, {
        solarConstant: 1365,
        latitude: 65,
        trueLongitude1: 90,
        trueLongitude2: 180,
      });

      expect(values.length).toBe(1001);
      const nanCount = countNaN(values);
      expect(nanCount).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------
// UI wiring test — every type maps to a computation path
// ---------------------------------------------------------------------------

describe('Every insolation type maps to a computation path', () => {
  const allTypes: InsolationType[] = [
    'Eccentricity',
    'Obliquity',
    'Precession angle',
    'Precession parameter',
    'Daily insolation',
    'Integrated insolation between 2 true longitudes',
    'Caloric summer insolation',
    'Caloric winter insolation',
  ];

  it('all 8 types produce non-empty, non-NaN results', async () => {
    const timeKyr = new Float64Array([0, -10, -100]);
    const orb = await computeOrbitalParams('Berger1978', timeKyr);

    for (const type of allTypes) {
      const result = computeInsolation(type, orb, {
        solarConstant: 1365,
        latitude: 65,
        trueLongitude1: 90,
        trueLongitude2: 180,
      });

      expect(result.length).toBe(3);
      for (let i = 0; i < result.length; i++) {
        expect(Number.isNaN(result[i])).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-validation: Berger1978 provider vs computeInsolation
// ---------------------------------------------------------------------------

describe('Berger1978 provider consistency', () => {
  it('precessionParameter matches eccentricity * sin(precessionAngle)', async () => {
    const berger = createBerger1978();
    const times = [-50, -200, -800];
    for (const t of times) {
      const ecc = berger.eccentricity(t);
      const pre = berger.precessionAngle(t);
      const pp = berger.precessionParameter(t);
      expect(pp).toBeCloseTo(ecc * Math.sin(pre), 10);
    }
  });

  it('computeOrbitalParams returns same values as direct provider calls', async () => {
    const berger = createBerger1978();
    const timeKyr = new Float64Array([-100, -500]);
    const orb = await computeOrbitalParams('Berger1978', timeKyr);

    for (let i = 0; i < timeKyr.length; i++) {
      const t = timeKyr[i];
      expect(orb.eccentricity[i]).toBeCloseTo(berger.eccentricity(t), 12);
      expect(orb.obliquity[i]).toBeCloseTo(berger.obliquity(t), 12);
      expect(orb.precessionAngle[i]).toBeCloseTo(berger.precessionAngle(t), 12);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-validation against Python reference values (inso package)
// ---------------------------------------------------------------------------

describe('Cross-validation against Python inso package', () => {
  // Reference values computed with:
  //   from inso import astro, inso
  //   b = astro.AstroBerger1978()
  //   t = np.array([0.0])
  //   ecc, obl, pre = b.eccentricity(t), b.obliquity(t), b.precession_angle(t)

  it('present-day orbital parameters match Python to 10 decimal places', async () => {
    const orb = await bergerParams([0]);
    expect(orb.eccentricity[0]).toBeCloseTo(0.0167239330, 10);
    expect(orb.obliquity[0]).toBeCloseTo(0.4092230819, 10);
    expect(orb.precessionAngle[0]).toBeCloseTo(1.7829843620, 10);
  });

  it('daily insolation 65N summer solstice matches Python', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Daily insolation', orb, {
      solarConstant: 1365, latitude: 65, trueLongitude1: 90,
    });
    expect(values[0]).toBeCloseTo(479.3973, 2);
  });

  it('integrated insolation 65N 90-180° matches Python', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation(
      'Integrated insolation between 2 true longitudes', orb, {
        solarConstant: 1365, latitude: 65, trueLongitude1: 90, trueLongitude2: 180,
      },
    );
    expect(values[0]).toBeCloseTo(361.8454, 2);
  });

  it('caloric summer 65N matches Python', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Caloric summer insolation', orb, {
      solarConstant: 1365, latitude: 65,
    });
    expect(values[0]).toBeCloseTo(367.1360, 2);
  });

  it('caloric winter 65N matches Python', async () => {
    const orb = await bergerParams([0]);
    const values = computeInsolation('Caloric winter insolation', orb, {
      solarConstant: 1365, latitude: 65,
    });
    expect(values[0]).toBeCloseTo(61.5414, 2);
  });
});
