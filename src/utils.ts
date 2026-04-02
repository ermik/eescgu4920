/**
 * General-purpose utility functions used throughout the AnalySeries browser
 * application.
 *
 * Reference: PyAnalySeries/resources/misc.py
 *
 * No runtime dependencies; no DOM/Node APIs.
 */

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a unique item identifier in the format `"Id-XXXXXXXX"` where
 * X is an uppercase hex character.
 *
 * Uses `crypto.randomUUID()` (available in all modern browsers and Node ≥ 15)
 * so the collision probability is negligible in practice.
 *
 * @returns A string like `"Id-3F7A2C1B"`.
 */
export function generateId(): string {
  const uuid = crypto.randomUUID(); // e.g. "550e8400-e29b-41d4-a716-446655440000"
  // Take the first 8 hex characters and uppercase them
  const hex = uuid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `Id-${hex}`;
}

// ---------------------------------------------------------------------------
// Colour utilities
// ---------------------------------------------------------------------------

/**
 * The 20 colours from matplotlib's `tab20` categorical palette, expressed as
 * lowercase hex strings.
 *
 * Derived by evaluating `QColor(*(int(c * 255) for c in cm.tab20(i)[:3])).name()`
 * for i = 0…19, matching the Python reference implementation exactly.
 */
const TAB20_COLORS: readonly string[] = [
  '#1f77b4', // 0  blue
  '#aec7e8', // 1  light blue
  '#ff7f0e', // 2  orange
  '#ffbb78', // 3  light orange
  '#2ca02c', // 4  green
  '#98df8a', // 5  light green
  '#d62728', // 6  red
  '#ff9896', // 7  light red
  '#9467bd', // 8  purple
  '#c5b0d5', // 9  light purple
  '#8c564b', // 10 brown
  '#c49c94', // 11 light brown
  '#e377c2', // 12 pink
  '#f7b6d2', // 13 light pink
  '#7f7f7f', // 14 grey
  '#c7c7c7', // 15 light grey
  '#bcbd22', // 16 yellow-green
  '#dbdb8d', // 17 light yellow-green
  '#17becf', // 18 cyan
  '#9edae5', // 19 light cyan
] as const;

/**
 * Return a random colour from the matplotlib `tab20` categorical palette.
 *
 * If `excludeColor` is provided and is one of the 20 palette entries, it is
 * removed from the candidate pool before selection so that two adjacent series
 * never share the same colour.
 *
 * @param excludeColor - Optional hex colour to exclude (e.g. `"#1f77b4"`).
 * @returns A lowercase hex colour string, e.g. `"#ff7f0e"`.
 */
export function generateColor(excludeColor?: string): string {
  const pool = excludeColor
    ? TAB20_COLORS.filter(c => c !== excludeColor)
    : TAB20_COLORS;
  // pool will always have at least 19 entries, never empty
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Linearly blend two CSS hex colours.
 *
 * @param color1 - Source colour, e.g. `"#1f77b4"`.
 * @param color2 - Target colour.
 * @param ratio  - Blend weight in [0, 1].  0 → all color1; 1 → all color2.
 * @returns Blended colour as a lowercase 7-character hex string.
 */
export function blendColors(color1: string, color2: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);
  const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
  const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
  const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
  return rgbToHex(r, g, b);
}

/** Parse a 6-digit hex colour string into [r, g, b] components (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Format three 0–255 components as a lowercase 7-character hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// History / provenance
// ---------------------------------------------------------------------------

/**
 * Append a new HTML entry to an existing history string.
 *
 * If the existing string is non-empty, a `<li>` separator is inserted between
 * the existing content and the new entry, matching the Python
 * `append_to_htmlText` behaviour.
 *
 * @param existing - Current history HTML (may be empty).
 * @param entry    - New entry to append (plain text or HTML).
 * @returns Updated history string.
 */
export function appendHistory(existing: string, entry: string): string {
  if (existing) {
    return existing + '<li>' + entry;
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/**
 * Return `true` if every element of `arr` is strictly greater than the
 * preceding element.
 *
 * An empty or single-element array is considered monotonically increasing.
 *
 * @param arr - Array to test.
 */
export function isMonotonicIncreasing(arr: number[] | Float64Array): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) return false;
  }
  return true;
}

/**
 * Format a number with a fixed number of decimal places.
 *
 * NaN values are rendered as the string `"NaN"` rather than causing
 * downstream formatting errors.
 *
 * @param value    - The number to format.
 * @param decimals - Decimal places (default 6).
 * @returns Formatted string.
 */
export function formatNumber(value: number, decimals = 6): string {
  if (isNaN(value)) return 'NaN';
  return value.toFixed(decimals);
}
