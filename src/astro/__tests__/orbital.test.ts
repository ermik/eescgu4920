/**
 * Tests for orbital parameter computation (Berger 1978).
 */

import { describe, it, expect } from 'vitest';
import { createBerger1978 } from '../solutions/berger1978';

const DEG = Math.PI / 180;

describe('Berger 1978 orbital parameters', () => {
  const berger = createBerger1978();

  it('present-day eccentricity is approximately 0.0167', () => {
    const ecc = berger.eccentricity(0);
    expect(ecc).toBeCloseTo(0.0167, 2);
    expect(ecc).toBeGreaterThan(0.01);
    expect(ecc).toBeLessThan(0.03);
  });

  it('present-day obliquity is approximately 23.44 degrees', () => {
    const obl = berger.obliquity(0);
    const oblDeg = obl / DEG;
    expect(oblDeg).toBeCloseTo(23.44, 1);
    expect(oblDeg).toBeGreaterThan(22);
    expect(oblDeg).toBeLessThan(25);
  });

  it('present-day precession angle is in [0, 2*PI]', () => {
    const pre = berger.precessionAngle(0);
    expect(pre).toBeGreaterThanOrEqual(0);
    expect(pre).toBeLessThan(2 * Math.PI);
  });

  it('eccentricity at 10 kyr ago differs from present', () => {
    const ecc0 = berger.eccentricity(0);
    const ecc10 = berger.eccentricity(-10);
    expect(ecc10).not.toBeCloseTo(ecc0, 4);
    expect(ecc10).toBeGreaterThan(0);
    expect(ecc10).toBeLessThan(0.07);
  });

  it('obliquity at 100 kyr ago is in the valid range', () => {
    const obl = berger.obliquity(-100);
    const oblDeg = obl / DEG;
    expect(oblDeg).toBeGreaterThan(22);
    expect(oblDeg).toBeLessThan(25);
  });

  it('eccentricity at 400 kyr ago is in valid range', () => {
    const ecc = berger.eccentricity(-400);
    expect(ecc).toBeGreaterThan(0);
    expect(ecc).toBeLessThan(0.07);
  });

  it('eccentricity at 800 kyr ago is different from present (cycle test)', () => {
    const ecc0 = berger.eccentricity(0);
    const ecc800 = berger.eccentricity(-800);
    // Eccentricity has ~100 kyr and ~400 kyr cycles
    // At 800 kyr ago it should be at a different phase
    expect(Math.abs(ecc800 - ecc0)).toBeGreaterThan(0.001);
  });

  it('inRange always returns true for Berger1978', () => {
    expect(berger.inRange(0)).toBe(true);
    expect(berger.inRange(-5000)).toBe(true);
    expect(berger.inRange(5000)).toBe(true);
  });

  it('precession parameter is e*sin(omega)', () => {
    const t = -50;
    const ecc = berger.eccentricity(t);
    const pre = berger.precessionAngle(t);
    const pp = berger.precessionParameter(t);
    expect(pp).toBeCloseTo(ecc * Math.sin(pre), 10);
  });

  it('hasObliquity and hasPrecession are true', () => {
    expect(berger.hasObliquity).toBe(true);
    expect(berger.hasPrecession).toBe(true);
  });
});
