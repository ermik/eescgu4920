/**
 * Type definitions for the astronomical computation module.
 */

export type AstroSolution =
  | 'Berger1978'
  | 'Laskar1993_01'
  | 'Laskar1993_11'
  | 'Laskar2004'
  | 'Laskar2010a'
  | 'Laskar2010b'
  | 'Laskar2010c'
  | 'Laskar2010d';

export type InsolationType =
  | 'Eccentricity'
  | 'Obliquity'
  | 'Precession angle'
  | 'Precession parameter'
  | 'Daily insolation'
  | 'Integrated insolation between 2 true longitudes'
  | 'Caloric summer insolation'
  | 'Caloric winter insolation';

export interface OrbitalParams {
  time: Float64Array;
  eccentricity: Float64Array;
  obliquity: Float64Array;
  precessionAngle: Float64Array;
}

/** Interface for an astronomical solution provider. */
export interface AstroProvider {
  eccentricity(t: number): number;
  obliquity(t: number): number;
  precessionAngle(t: number): number;
  precessionParameter(t: number): number;
  inRange(t: number): boolean;
  readonly hasObliquity: boolean;
  readonly hasPrecession: boolean;
}

/** JSON format for precomputed Laskar table data. */
export interface LaskarTableData {
  tMin: number;
  tMax: number;
  tStep: number;
  ecc: number[];
  obl?: number[];
  sinPre?: number[];
  cosPre?: number[];
}
