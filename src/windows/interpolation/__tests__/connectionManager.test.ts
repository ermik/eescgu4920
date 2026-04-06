/**
 * Tests for connection validation — the crossing detection algorithm.
 */

import { describe, it, expect } from 'vitest';
import { validateNoCrossing, searchSorted } from '../state.js';

// ---------------------------------------------------------------------------
// searchSorted
// ---------------------------------------------------------------------------

describe('searchSorted', () => {
  it('returns 0 for empty array', () => {
    expect(searchSorted([], 5)).toBe(0);
  });

  it('returns 0 for value before all elements', () => {
    expect(searchSorted([10, 20, 30], 5)).toBe(0);
  });

  it('returns length for value after all elements', () => {
    expect(searchSorted([10, 20, 30], 35)).toBe(3);
  });

  it('returns correct index for value between elements', () => {
    expect(searchSorted([10, 20, 30], 15)).toBe(1);
    expect(searchSorted([10, 20, 30], 25)).toBe(2);
  });

  it('returns the index of exact match (left insertion)', () => {
    expect(searchSorted([10, 20, 30], 20)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// validateNoCrossing — core crossing detection
// ---------------------------------------------------------------------------

describe('validateNoCrossing', () => {
  it('first connection is always valid', () => {
    expect(validateNoCrossing([], [], 100, 50)).toBe(true);
  });

  describe('with existing connections [(100, 50), (300, 150)]', () => {
    const x1 = [100, 300];
    const x2 = [50, 150];

    it('valid: between both in both axes', () => {
      expect(validateNoCrossing(x1, x2, 200, 100)).toBe(true);
    });

    it('invalid: x1 between but x2 beyond second', () => {
      expect(validateNoCrossing(x1, x2, 200, 160)).toBe(false);
    });

    it('invalid: x1 before first but x2 between', () => {
      expect(validateNoCrossing(x1, x2, 50, 100)).toBe(false);
    });

    it('valid: before both in both axes', () => {
      expect(validateNoCrossing(x1, x2, 50, 25)).toBe(true);
    });

    it('valid: after both in both axes', () => {
      expect(validateNoCrossing(x1, x2, 400, 200)).toBe(true);
    });
  });

  describe('second connection (one existing)', () => {
    const x1 = [100];
    const x2 = [50];

    it('valid: both before', () => {
      expect(validateNoCrossing(x1, x2, 50, 25)).toBe(true);
    });

    it('valid: both after', () => {
      expect(validateNoCrossing(x1, x2, 200, 100)).toBe(true);
    });

    it('invalid: x1 before but x2 after', () => {
      expect(validateNoCrossing(x1, x2, 50, 100)).toBe(false);
    });

    it('invalid: x1 after but x2 before', () => {
      expect(validateNoCrossing(x1, x2, 200, 25)).toBe(false);
    });
  });

  describe('many existing connections', () => {
    // 5 connections forming a monotonic mapping
    const x1 = [10, 20, 30, 40, 50];
    const x2 = [100, 200, 300, 400, 500];

    it('valid: insert in the middle maintaining order', () => {
      expect(validateNoCrossing(x1, x2, 25, 250)).toBe(true);
    });

    it('invalid: insert in x1 gap but wrong x2 position', () => {
      // x1=25 goes between 20 and 30 (position 2)
      // x2=450 goes between 400 and 500 (position 4)
      // positions differ → crossing
      expect(validateNoCrossing(x1, x2, 25, 450)).toBe(false);
    });

    it('valid: insert at the very beginning', () => {
      expect(validateNoCrossing(x1, x2, 5, 50)).toBe(true);
    });

    it('valid: insert at the very end', () => {
      expect(validateNoCrossing(x1, x2, 60, 600)).toBe(true);
    });
  });
});
