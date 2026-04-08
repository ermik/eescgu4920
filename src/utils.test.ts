import { describe, test, expect } from 'vitest';
import {
  generateId,
  generateColor,
  blendColors,
  appendHistory,
  isMonotonicIncreasing,
} from './utils';

describe('Utils', () => {
  test('generateId format is Id-[0-9A-F]{8}', () => {
    expect(generateId()).toMatch(/^Id-[0-9A-F]{8}$/);
  });

  test('generateId uniqueness', () => {
    expect(generateId()).not.toBe(generateId());
  });

  test('generateColor format', () => {
    expect(generateColor()).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('generateColor excludes specified color (50 draws)', () => {
    const excluded = '#1f77b4';
    for (let i = 0; i < 50; i++) {
      expect(generateColor(excluded)).not.toBe(excluded);
    }
  });

  test('blendColors midpoint (#000000 + #ffffff at 0.5)', () => {
    expect(blendColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  test('blendColors ratio=0 returns color1', () => {
    expect(blendColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  test('blendColors ratio=1 returns color2', () => {
    expect(blendColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  test('appendHistory — empty base', () => {
    expect(appendHistory('', 'first entry')).toBe('first entry');
  });

  test('appendHistory — non-empty base adds <li>', () => {
    expect(appendHistory('old', 'new')).toBe('old<li>new');
  });

  test('isMonotonicIncreasing — true cases', () => {
    expect(isMonotonicIncreasing([1, 2, 3])).toBe(true);
    expect(isMonotonicIncreasing([])).toBe(true);
    expect(isMonotonicIncreasing([42])).toBe(true);
    expect(isMonotonicIncreasing(new Float64Array([0.1, 0.2, 0.3]))).toBe(true);
  });

  test('isMonotonicIncreasing — false cases', () => {
    expect(isMonotonicIncreasing([1, 3, 2])).toBe(false);
    expect(isMonotonicIncreasing([1, 1, 2])).toBe(false);
    expect(isMonotonicIncreasing([3, 2, 1])).toBe(false);
  });
});
