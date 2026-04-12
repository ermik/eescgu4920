import { describe, test, expect } from 'vitest';
import { applyArith } from './simpleFunction';

const idx = new Float64Array([0, 1, 2, 3]);
const a = new Float64Array([1, 2, 3, 4]);
const b = new Float64Array([10, 20, 30, 40]);

describe('simpleFunction', () => {
  test('add', () => {
    const r = applyArith(idx, a, 'add', 1, b);
    expect(Array.from(r.values)).toEqual([11, 22, 33, 44]);
  });

  test('subtract', () => {
    const r = applyArith(idx, b, 'subtract', 1, a);
    expect(Array.from(r.values)).toEqual([9, 18, 27, 36]);
  });

  test('multiply', () => {
    const r = applyArith(idx, a, 'multiply', 1, b);
    expect(Array.from(r.values)).toEqual([10, 40, 90, 160]);
  });

  test('divide', () => {
    const r = applyArith(idx, b, 'divide', 1, a);
    expect(Array.from(r.values)).toEqual([10, 10, 10, 10]);
  });

  test('divide by zero gives NaN', () => {
    const zeros = new Float64Array([0, 1, 0, 1]);
    const r = applyArith(idx, a, 'divide', 1, zeros);
    expect(isNaN(r.values[0])).toBe(true);
    expect(r.values[1]).toBe(2);
    expect(isNaN(r.values[2])).toBe(true);
    expect(r.values[3]).toBe(4);
  });

  test('negate', () => {
    const r = applyArith(idx, a, 'negate');
    expect(Array.from(r.values)).toEqual([-1, -2, -3, -4]);
  });

  test('abs', () => {
    const neg = new Float64Array([-1, 2, -3, 4]);
    const r = applyArith(idx, neg, 'abs');
    expect(Array.from(r.values)).toEqual([1, 2, 3, 4]);
  });

  test('log', () => {
    const r = applyArith(idx, new Float64Array([1, Math.E, Math.E * Math.E, -1]), 'log');
    expect(r.values[0]).toBeCloseTo(0, 10);
    expect(r.values[1]).toBeCloseTo(1, 10);
    expect(r.values[2]).toBeCloseTo(2, 10);
    expect(isNaN(r.values[3])).toBe(true);
  });

  test('exp', () => {
    const r = applyArith(idx, new Float64Array([0, 1, 2, -1]), 'exp');
    expect(r.values[0]).toBeCloseTo(1, 10);
    expect(r.values[1]).toBeCloseTo(Math.E, 10);
    expect(r.values[3]).toBeCloseTo(1 / Math.E, 10);
  });

  test('sqrt', () => {
    const r = applyArith(idx, new Float64Array([0, 1, 4, -1]), 'sqrt');
    expect(r.values[0]).toBe(0);
    expect(r.values[1]).toBe(1);
    expect(r.values[2]).toBe(2);
    expect(isNaN(r.values[3])).toBe(true);
  });

  test('scale', () => {
    const r = applyArith(idx, a, 'scale', 3);
    expect(Array.from(r.values)).toEqual([3, 6, 9, 12]);
  });

  test('offset', () => {
    const r = applyArith(idx, a, 'offset', 100);
    expect(Array.from(r.values)).toEqual([101, 102, 103, 104]);
  });

  test('binary op rejects mismatched lengths', () => {
    expect(() => applyArith(idx, a, 'add', 1, new Float64Array([1, 2]))).toThrow();
  });

  test('preserves index', () => {
    const r = applyArith(idx, a, 'negate');
    expect(Array.from(r.index)).toEqual([0, 1, 2, 3]);
  });
});
