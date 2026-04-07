/**
 * Insolation computation from orbital parameters.
 *
 * Ported from the Python `inso` package (inso/inso.py).
 * Uses numerical integration (Simpson's rule) for mean insolation
 * to avoid implementing elliptic integral special functions.
 */

const PI = Math.PI;
const TWO_PI = 2 * PI;

// ---------------------------------------------------------------------------
// Kepler equation and orbital mechanics
// ---------------------------------------------------------------------------

/**
 * Solve Kepler's equation: x - e*sin(x) = v
 * using Newton-Raphson iteration.
 */
function solveKepler(e: number, v: number): number {
  let x = v;
  for (let i = 0; i < 30; i++) {
    const sinx = Math.sin(x);
    const cosx = Math.cos(x);
    const dx = (x - e * sinx - v) / (1 - e * cosx);
    x -= dx;
    if (Math.abs(dx) < 1e-15) break;
  }
  return x;
}

/**
 * Compute the true anomaly from the mean anomaly.
 * Both in radians. Handles arbitrary values via modular arithmetic.
 */
function trueAnomaly(e: number, meanA: number): number {
  // Reduce to [-PI, PI)
  let n = Math.floor((meanA + PI) / TWO_PI);
  let vm = meanA - n * TWO_PI;
  // vm should be in [-PI, PI)
  if (vm >= PI) { vm -= TWO_PI; n++; }
  if (vm < -PI) { vm += TWO_PI; n--; }

  const sg = vm >= 0 ? 1 : -1;
  const cosE = Math.cos(solveKepler(e, vm));
  const denom = 1 - e * cosE;
  const v = sg * Math.acos(Math.max(-1, Math.min(1, (cosE - e) / denom)));
  return v + meanA - vm;
}

/**
 * Compute the mean anomaly from the true anomaly.
 * Both in radians.
 */
function meanAnomaly(e: number, trueA: number): number {
  // Reduce to [-PI, PI)
  let n = Math.floor((trueA + PI) / TWO_PI);
  let v = trueA - n * TWO_PI;
  if (v >= PI) { v -= TWO_PI; n++; }
  if (v < -PI) { v += TWO_PI; n--; }

  const sqte = Math.sqrt(1 - e * e);
  // Eccentric anomaly from reduced true anomaly
  const E = 2 * Math.atan(Math.tan(v / 2) * (1 - e) / sqte) + trueA - v;
  // M = E - e * sin(E), using identity e*sin(E) = e*sqrt(1-e^2)*sin(v)/(1+e*cos(v))
  return E - e * sqte * Math.sin(v) / (1 + e * Math.cos(v));
}

/**
 * Convert mean longitude (time from reference point) to true longitude.
 * @param meanL  Mean longitude in radians (time from refL)
 * @param e      Eccentricity
 * @param perL   Longitude of perihelion (precession angle) in radians
 * @param refL   Reference true longitude (default 0 = vernal equinox)
 */
function trueLongitude(
  meanL: number, e: number, perL: number, refL: number = 0,
): number {
  return trueAnomaly(e, meanL + meanAnomaly(e, refL - perL + PI)) + perL - PI;
}

// ---------------------------------------------------------------------------
// Daily insolation geometry
// ---------------------------------------------------------------------------

/**
 * Compute (s, p, ac) — the geometric quantities for daily insolation.
 * a = sin(eps)*sin(lon), b = sin(phi)
 * s = max(0, 1 - a^2 - b^2)
 * p = a*b
 * ac = hour angle at sunrise/sunset
 */
function insoAc(a: number, b: number): [number, number, number] {
  const s = Math.max(0, 1 - a * a - b * b);
  const p = a * b;
  const sp2 = s + p * p;
  if (sp2 === 0) {
    return [s, p, PI / 2];
  }
  const sq = Math.sqrt(sp2);
  const ac = Math.acos(Math.max(-1, Math.min(1, -p / sq)));
  return [s, p, ac];
}

/**
 * Dimensionless daily insolation at distance = semi-major axis.
 * g(a, b) = (sqrt(s) + p * ac) / PI
 */
function insoG(a: number, b: number): number {
  const [s, p, ac] = insoAc(a, b);
  return (Math.sqrt(s) + p * ac) / PI;
}

// ---------------------------------------------------------------------------
// Public insolation functions
// ---------------------------------------------------------------------------

/**
 * Dimensionless daily insolation. Multiply by solar constant for W/m^2.
 *
 * @param lon  True longitude (radians)
 * @param phi  Latitude (radians)
 * @param eps  Obliquity (radians)
 * @param e    Eccentricity
 * @param per  Precession angle / longitude of perihelion (radians)
 */
export function insoDailyRadians(
  lon: number, phi: number, eps: number, e: number, per: number,
): number {
  const sinEps = Math.sin(eps);
  const sinPhi = Math.sin(phi);
  const sinLon = Math.sin(lon);
  const g = insoG(sinEps * sinLon, sinPhi);
  // Distance ratio a/r
  const ar = (1 - e * Math.cos(lon - per)) / (1 - e * e);
  return ar * ar * g;
}

/**
 * Dimensionless integrated insolation between two true longitudes.
 * Uses Simpson's rule numerical integration over mean anomaly (time).
 *
 * @param lon1  Start true longitude (radians)
 * @param lon2  End true longitude (radians)
 * @param phi   Latitude (radians)
 * @param eps   Obliquity (radians)
 * @param e     Eccentricity
 * @param per   Precession angle (radians)
 */
export function insoMeanRadians(
  lon1: number, lon2: number, phi: number, eps: number,
  e: number, per: number,
): number {
  // Convert true longitudes to mean anomalies
  const M1 = meanAnomaly(e, lon1 - per + PI);
  const M2 = meanAnomaly(e, lon2 - per + PI);
  const dM = M2 - M1;

  if (Math.abs(dM) < 1e-12) return 0;

  // Simpson's rule with 200 subintervals
  const N = 200;
  const h = dM / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const M = M1 + i * h;
    const v = trueAnomaly(e, M);
    const lon = v + per - PI;
    const daily = insoDailyRadians(lon, phi, eps, e, per);
    const w = (i === 0 || i === N) ? 1 : (i % 2 === 0) ? 2 : 4;
    sum += w * daily;
  }

  return (sum * h / 3) / dM;
}

/**
 * Dimensionless integrated insolation between two mean longitudes (times).
 *
 * @param tr1   Start mean longitude (radians from refL)
 * @param tr2   End mean longitude (radians from refL)
 * @param phi   Latitude (radians)
 * @param eps   Obliquity (radians)
 * @param e     Eccentricity
 * @param per   Precession angle (radians)
 * @param refL  Reference true longitude (radians)
 */
function insoMeanTimeRadians(
  tr1: number, tr2: number, phi: number, eps: number,
  e: number, per: number, refL: number = 0,
): number {
  const l1 = trueLongitude(tr1, e, per, refL);
  const l2 = trueLongitude(tr2, e, per, refL);
  return insoMeanRadians(l1, l2, phi, eps, e, per);
}

/**
 * Milankovitch caloric summer insolation (Northern Hemisphere).
 * Mean insolation over the half-year centered on summer solstice.
 */
export function insoCalSummerNH(
  phi: number, eps: number, e: number, per: number,
): number {
  return insoMeanTimeRadians(-PI / 2, PI / 2, phi, eps, e, per, PI / 2);
}

/**
 * Milankovitch caloric winter insolation (Northern Hemisphere).
 * Mean insolation over the half-year centered on winter solstice.
 */
export function insoCalWinterNH(
  phi: number, eps: number, e: number, per: number,
): number {
  return insoMeanTimeRadians(-PI / 2, PI / 2, phi, eps, e, per, 3 * PI / 2);
}
