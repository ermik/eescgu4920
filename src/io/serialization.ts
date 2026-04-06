/**
 * Portable JSON serialization for worksheets.
 *
 * IndexedDB uses structured clone which handles Float64Array natively.
 * File export/import needs an explicit conversion since JSON.stringify
 * turns Float64Array into `{}`.
 *
 * Convention: `{ "__type": "Float64Array", "data": [1.0, 2.0, ...] }`
 *
 * Batch F changes:
 * - Created module for JSON file export/import of worksheets
 */

import type { Worksheet } from '../types';
import { generateId } from '../utils';

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Deep-clone a value, converting every Float64Array to the portable
 * `{ __type, data }` form. Plain objects and arrays are walked recursively.
 */
function toPortable(value: unknown): unknown {
  if (value instanceof Float64Array) {
    return { __type: 'Float64Array', data: Array.from(value) };
  }
  if (Array.isArray(value)) {
    return value.map(toPortable);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toPortable(v);
    }
    return out;
  }
  return value;
}

/** Serialize a worksheet to a portable JSON string. */
export function serializeWorksheet(ws: Worksheet): string {
  const portable = toPortable(ws);
  return JSON.stringify(portable, null, 2);
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

/**
 * Recursively walk a parsed JSON value and reconstruct Float64Array fields
 * from `{ __type: "Float64Array", data: [...] }` markers.
 */
function fromPortable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(fromPortable);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.__type === 'Float64Array' && Array.isArray(obj.data)) {
      return new Float64Array(obj.data as number[]);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = fromPortable(v);
    }
    return out;
  }
  return value;
}

/** Parse a portable JSON string back into a Worksheet. */
export function deserializeWorksheet(json: string): Worksheet {
  const parsed = JSON.parse(json);
  return fromPortable(parsed) as Worksheet;
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

/** Trigger a browser file download for the given worksheet. */
export function downloadWorksheet(ws: Worksheet): void {
  const json = serializeWorksheet(ws);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${ws.name}.analyseries.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// File open
// ---------------------------------------------------------------------------

/**
 * Open a file picker for `.analyseries.json` (or `.json`) files, parse the
 * selected file, and return the reconstructed Worksheet.
 *
 * If the imported worksheet's ID collides with an existing worksheet in
 * `existingIds`, a fresh ID is generated.
 */
export function openWorksheetFile(
  existingIds: Set<string>,
): Promise<Worksheet | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.analyseries.json';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const ws = deserializeWorksheet(reader.result as string);
          // Generate new ID if collision
          if (existingIds.has(ws.id)) {
            (ws as { id: string }).id = generateId();
          }
          ws.modified = true;
          resolve(ws);
        } catch (err) {
          console.error('Failed to parse worksheet file:', err);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });

    // User cancelled the picker
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
