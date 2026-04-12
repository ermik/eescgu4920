/**
 * Simple arithmetic operations on time series.
 *
 * Spec: PDF §11.1 (v2.0.8) — Simple Function: addition, subtraction,
 * multiplication, division, and scalar operations on series.
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArithOp = 'add' | 'subtract' | 'multiply' | 'divide' | 'negate' | 'abs' | 'log' | 'exp' | 'sqrt' | 'scale' | 'offset';

export interface ArithResult {
  index: Float64Array;
  values: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply an arithmetic operation to one or two series.
 *
 * For binary ops (add, subtract, multiply, divide), both series must have
 * the same length. For unary ops, only `index` and `values` are used.
 *
 * @param index   X positions of the primary series.
 * @param values  Y values of the primary series.
 * @param op      Arithmetic operation.
 * @param param   Scalar parameter (for 'scale' and 'offset').
 * @param values2 Second series Y values (for binary ops).
 */
export function applyArith(
  index: Float64Array,
  values: Float64Array,
  op: ArithOp,
  param: number = 1,
  values2?: Float64Array,
): ArithResult {
  const N = values.length;
  const out = new Float64Array(N);

  switch (op) {
    case 'add':
      if (!values2 || values2.length !== N) throw new RangeError('Second series required with same length.');
      for (let i = 0; i < N; i++) out[i] = values[i] + values2[i];
      break;
    case 'subtract':
      if (!values2 || values2.length !== N) throw new RangeError('Second series required with same length.');
      for (let i = 0; i < N; i++) out[i] = values[i] - values2[i];
      break;
    case 'multiply':
      if (!values2 || values2.length !== N) throw new RangeError('Second series required with same length.');
      for (let i = 0; i < N; i++) out[i] = values[i] * values2[i];
      break;
    case 'divide':
      if (!values2 || values2.length !== N) throw new RangeError('Second series required with same length.');
      for (let i = 0; i < N; i++) out[i] = values2[i] !== 0 ? values[i] / values2[i] : NaN;
      break;
    case 'negate':
      for (let i = 0; i < N; i++) out[i] = -values[i];
      break;
    case 'abs':
      for (let i = 0; i < N; i++) out[i] = Math.abs(values[i]);
      break;
    case 'log':
      for (let i = 0; i < N; i++) out[i] = values[i] > 0 ? Math.log(values[i]) : NaN;
      break;
    case 'exp':
      for (let i = 0; i < N; i++) out[i] = Math.exp(values[i]);
      break;
    case 'sqrt':
      for (let i = 0; i < N; i++) out[i] = values[i] >= 0 ? Math.sqrt(values[i]) : NaN;
      break;
    case 'scale':
      for (let i = 0; i < N; i++) out[i] = values[i] * param;
      break;
    case 'offset':
      for (let i = 0; i < N; i++) out[i] = values[i] + param;
      break;
  }

  return { index: new Float64Array(index), values: out };
}
