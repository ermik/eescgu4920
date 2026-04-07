/**
 * Tests for insolation computation.
 */

import { describe, it, expect } from 'vitest';
import { insoDailyRadians, insoMeanRadians, insoCalSummerNH, insoCalWinterNH } from '../insolation';
import { createBerger1978 } from '../solutions/berger1978';

const DEG = Math.PI / 180;
const S0 = 1365; // Solar constant

describe('Daily insolation', () => {
  const berger = createBerger1978();

  it('summer solstice 65N at present gives ~450-550 W/m²', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);
    const lon = 90 * DEG; // summer solstice
    const lat = 65 * DEG;

    const inso = S0 * insoDailyRadians(lon, lat, obl, ecc, pre);
    expect(inso).toBeGreaterThan(400);
    expect(inso).toBeLessThan(600);
  });

  it('equator at equinox gives reasonable value', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);
    const lon = 0; // vernal equinox
    const lat = 0; // equator

    const inso = S0 * insoDailyRadians(lon, lat, obl, ecc, pre);
    // At equinox, equator gets roughly S0/PI * (a/r)^2
    expect(inso).toBeGreaterThan(300);
    expect(inso).toBeLessThan(500);
  });

  it('polar night gives 0 W/m²', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);
    // Winter at 90N: true longitude = 270° (winter solstice in NH)
    const lon = 270 * DEG;
    const lat = 90 * DEG;

    const inso = S0 * insoDailyRadians(lon, lat, obl, ecc, pre);
    expect(inso).toBeCloseTo(0, 5);
  });

  it('high latitude (89°) does not produce NaN', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);
    const lon = 90 * DEG;
    const lat = 89 * DEG;

    const inso = insoDailyRadians(lon, lat, obl, ecc, pre);
    expect(isNaN(inso)).toBe(false);
    expect(inso).toBeGreaterThanOrEqual(0);
  });

  it('zero solar constant produces zero everywhere', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);

    const inso = 0 * insoDailyRadians(90 * DEG, 65 * DEG, obl, ecc, pre);
    expect(inso).toBe(0);
  });
});

describe('Mean (integrated) insolation', () => {
  const berger = createBerger1978();

  it('integrated insolation between 0 and 180° is positive and bounded', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);

    const inso = S0 * insoMeanRadians(0, Math.PI, 65 * DEG, obl, ecc, pre);
    expect(inso).toBeGreaterThan(0);
    expect(inso).toBeLessThan(S0);
  });

  it('integrated insolation does not produce NaN', () => {
    const ecc = berger.eccentricity(-100);
    const obl = berger.obliquity(-100);
    const pre = berger.precessionAngle(-100);

    const inso = insoMeanRadians(0, Math.PI, 45 * DEG, obl, ecc, pre);
    expect(isNaN(inso)).toBe(false);
  });
});

describe('Caloric seasons', () => {
  const berger = createBerger1978();

  it('caloric summer > caloric winter for 65N', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);
    const lat = 65 * DEG;

    const summer = S0 * insoCalSummerNH(lat, obl, ecc, pre);
    const winter = S0 * insoCalWinterNH(lat, obl, ecc, pre);

    expect(summer).toBeGreaterThan(winter);
    expect(summer).toBeGreaterThan(0);
    expect(winter).toBeGreaterThanOrEqual(0);
  });

  it('caloric summer at equator is positive', () => {
    const ecc = berger.eccentricity(0);
    const obl = berger.obliquity(0);
    const pre = berger.precessionAngle(0);

    const summer = S0 * insoCalSummerNH(0, obl, ecc, pre);
    expect(summer).toBeGreaterThan(0);
    expect(isNaN(summer)).toBe(false);
  });
});
