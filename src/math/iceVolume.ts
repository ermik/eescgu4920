/**
 * Global ice volume models.
 *
 * Spec: PDF §7.3 — four ice volume models driven by an insolation series:
 *   1. Calder (1974)
 *   2. Imbrie & Imbrie (1980)
 *   3. Paillard (1998) — three-state threshold model
 *   4. Paillard & Parrenin (2004) — deglaciation threshold model
 *
 * All models take an insolation forcing series and produce ice volume output.
 * Time must be in kyr with negative = past (convention matched to the caller).
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IceVolumeModel = 'calder' | 'imbrie' | 'paillard' | 'paillard-parrenin';

export interface IceVolumeOptions {
  model: IceVolumeModel;
  /** Time constant for ice growth (kyr). Default varies by model. */
  tauGrowth?: number;
  /** Time constant for ice decay (kyr). Default varies by model. */
  tauDecay?: number;
  /** Threshold for state transitions (W/m², Paillard models). */
  threshold1?: number;
  /** Second threshold (Paillard models). */
  threshold2?: number;
  /** Reference insolation level (W/m²). Default: mean of input. */
  insolationRef?: number;
}

export interface IceVolumeResult {
  index: Float64Array;
  values: Float64Array;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute global ice volume from an insolation forcing series.
 *
 * @param index    Time array (kyr).
 * @param forcing  Insolation values (W/m²), parallel to index.
 * @param options  Model selection and parameters.
 */
export function computeIceVolume(
  index: Float64Array,
  forcing: Float64Array,
  options: IceVolumeOptions,
): IceVolumeResult {
  if (index.length !== forcing.length) {
    throw new RangeError('index and forcing must have the same length.');
  }
  if (index.length < 2) {
    throw new RangeError('Need at least 2 data points.');
  }

  switch (options.model) {
    case 'calder': return calderModel(index, forcing, options);
    case 'imbrie': return imbrieModel(index, forcing, options);
    case 'paillard': return paillardModel(index, forcing, options);
    case 'paillard-parrenin': return paillardParreninModel(index, forcing, options);
  }
}

// ---------------------------------------------------------------------------
// 1. Calder (1974) — simple integrator
// ---------------------------------------------------------------------------

/**
 * Calder's model: dV/dt = -k * (F(t) - F_ref)
 * where V is ice volume and F is insolation forcing.
 * Ice grows when insolation is below reference, melts when above.
 */
function calderModel(
  index: Float64Array,
  forcing: Float64Array,
  options: IceVolumeOptions,
): IceVolumeResult {
  const N = index.length;
  const Fref = options.insolationRef ?? mean(forcing);
  const k = 1 / (options.tauGrowth ?? 10);

  const values = new Float64Array(N);
  values[0] = 0;
  for (let i = 1; i < N; i++) {
    const dt = Math.abs(index[i] - index[i - 1]);
    values[i] = values[i - 1] - k * (forcing[i] - Fref) * dt;
  }

  return { index: new Float64Array(index), values };
}

// ---------------------------------------------------------------------------
// 2. Imbrie & Imbrie (1980) — asymmetric relaxation
// ---------------------------------------------------------------------------

/**
 * dV/dt = -(V - F_norm) / τ
 * where τ = τ_growth when V < F_norm (ice growing),
 *       τ = τ_decay  when V > F_norm (ice decaying).
 */
function imbrieModel(
  index: Float64Array,
  forcing: Float64Array,
  options: IceVolumeOptions,
): IceVolumeResult {
  const N = index.length;
  const tauG = options.tauGrowth ?? 42;
  const tauD = options.tauDecay ?? 10;

  // Normalize forcing to 0-mean, unit std
  const Fnorm = normalize(forcing);

  const values = new Float64Array(N);
  values[0] = Fnorm[0];

  for (let i = 1; i < N; i++) {
    const dt = Math.abs(index[i] - index[i - 1]);
    const tau = values[i - 1] > Fnorm[i] ? tauD : tauG;
    values[i] = values[i - 1] + (Fnorm[i] - values[i - 1]) * dt / tau;
  }

  return { index: new Float64Array(index), values };
}

// ---------------------------------------------------------------------------
// 3. Paillard (1998) — three-state threshold model
// ---------------------------------------------------------------------------

/**
 * Three climate states: i (interglacial), g (mild glacial), G (full glacial).
 * Transitions: i→g (when F < threshold1), g→G (when V > threshold2),
 *              G→i (when F > threshold1, rapid deglaciation).
 */
function paillardModel(
  index: Float64Array,
  forcing: Float64Array,
  options: IceVolumeOptions,
): IceVolumeResult {
  const N = index.length;
  const Fref = options.insolationRef ?? mean(forcing);
  const thresh1 = options.threshold1 ?? (Fref - 10);
  const thresh2 = options.threshold2 ?? 1.5;
  const tauG = options.tauGrowth ?? 30;
  const tauD = options.tauDecay ?? 10;

  const values = new Float64Array(N);
  values[0] = 0;
  let state: 'i' | 'g' | 'G' = 'i'; // start in interglacial

  for (let i = 1; i < N; i++) {
    const dt = Math.abs(index[i] - index[i - 1]);
    const F = forcing[i];

    // State transitions
    switch (state) {
      case 'i':
        if (F < thresh1) state = 'g';
        break;
      case 'g':
        if (values[i - 1] > thresh2) state = 'G';
        break;
      case 'G':
        if (F > thresh1) state = 'i';
        break;
    }

    // Evolution depends on state
    const tau = state === 'i' ? tauD : tauG;
    const target = state === 'i' ? 0 : (Fref - F) / Fref;
    values[i] = values[i - 1] + (target - values[i - 1]) * dt / tau;
  }

  return { index: new Float64Array(index), values };
}

// ---------------------------------------------------------------------------
// 4. Paillard & Parrenin (2004) — deglaciation threshold
// ---------------------------------------------------------------------------

/**
 * Similar to Paillard (1998) but with a more refined deglaciation trigger:
 * deglaciation starts when accumulated ice volume crosses a threshold
 * AND insolation rises above a critical level.
 */
function paillardParreninModel(
  index: Float64Array,
  forcing: Float64Array,
  options: IceVolumeOptions,
): IceVolumeResult {
  const N = index.length;
  const Fref = options.insolationRef ?? mean(forcing);
  const thresh1 = options.threshold1 ?? (Fref - 10);
  const thresh2 = options.threshold2 ?? 1.0;
  const tauG = options.tauGrowth ?? 40;
  const tauD = options.tauDecay ?? 10;

  const values = new Float64Array(N);
  values[0] = 0;
  let deglaciating = false;

  for (let i = 1; i < N; i++) {
    const dt = Math.abs(index[i] - index[i - 1]);
    const F = forcing[i];

    // Deglaciation trigger
    if (!deglaciating && values[i - 1] > thresh2 && F > thresh1) {
      deglaciating = true;
    }
    if (deglaciating && values[i - 1] < 0.1) {
      deglaciating = false;
    }

    const tau = deglaciating ? tauD : tauG;
    const target = deglaciating ? 0 : Math.max(0, (Fref - F) / Fref);
    values[i] = values[i - 1] + (target - values[i - 1]) * dt / tau;
  }

  return { index: new Float64Array(index), values };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr: Float64Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function normalize(arr: Float64Array): Float64Array {
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < arr.length; i++) ss += (arr[i] - m) * (arr[i] - m);
  const std = Math.sqrt(ss / arr.length) || 1;
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - m) / std;
  return out;
}
