/**
 * G2 — Excel (.xlsx) worksheet import/export.
 *
 * Interoperable with PyAnalySeries' load_WorkSheet / save_WorkSheet.
 *
 * Sheet naming conventions:
 * - "Series Id-XXXXXXXX"       → series data
 * - "FILTER Id-XXXXXXXX"       → filter definition
 * - "SAMPLE Id-XXXXXXXX"       → sample definition
 * - "INTERPOLATION Id-XXXXXXXX" → interpolation pointers
 * - "Information"              → version/timestamp metadata
 */

import * as XLSX from 'xlsx';
import type {
  Worksheet, WorksheetItem, SeriesItem,
  FilterItem, SampleItem, InterpolationItem,
} from '../types';
import { generateId } from '../utils';

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Parse a PyAnalySeries .xlsx file into a Worksheet.
 */
export async function importExcelWorksheet(file: File): Promise<Worksheet> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });

  const items: WorksheetItem[] = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName.startsWith('Serie Id-') || sheetName.startsWith('Series Id-')) {
      const item = parseSeriesSheet(wb.Sheets[sheetName], sheetName);
      if (item) items.push(item);
    } else if (sheetName.startsWith('FILTER Id-')) {
      const item = parseFilterSheet(wb.Sheets[sheetName], sheetName);
      if (item) items.push(item);
    } else if (sheetName.startsWith('SAMPLE Id-')) {
      const item = parseSampleSheet(wb.Sheets[sheetName], sheetName);
      if (item) items.push(item);
    } else if (sheetName.startsWith('INTERPOLATION Id-')) {
      const item = parseInterpolationSheet(wb.Sheets[sheetName], sheetName);
      if (item) items.push(item);
    }
    // 'Information' sheet is ignored
  }

  // Derive worksheet name from filename
  const wsName = file.name.replace(/\.xlsx$/i, '').replace(/\.analyseries$/i, '');

  return {
    id: generateId(),
    name: wsName,
    items,
    modified: true,
  };
}

function extractId(sheetName: string): string {
  const match = sheetName.match(/Id-([A-Fa-f0-9]+)/);
  return match ? `Id-${match[1]}` : generateId();
}

function cleanHistory(history: string): string {
  if (!history) return '';
  let h = String(history);
  // Remove leading <br/>
  h = h.replace(/^(<br\s*\/?>)/i, '');
  // Fix spelling: serie → series, Serie → Series
  h = h.replace(/\bserie\b/g, 'series');
  h = h.replace(/\bSerie\b/g, 'Series');
  return h;
}

function getSheetData(sheet: XLSX.WorkSheet): unknown[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? NaN : n;
  }
  return NaN;
}

function parseSeriesSheet(sheet: XLSX.WorkSheet, sheetName: string): SeriesItem | null {
  try {
    const rows = getSheetData(sheet);
    if (rows.length < 2) return null;

    const headers = rows[0] as string[];
    const xLabel = String(headers[0] ?? 'X');
    const yLabel = String(headers[1] ?? 'Y');

    // Read metadata from row 2 (columns 3-8)
    const metaRow = rows[1];
    let itemType = String(metaRow[2] ?? 'Series');
    itemType = itemType.replace(/\bSerie\b/g, 'Series');
    const name = String(metaRow[3] ?? '');
    const color = String(metaRow[4] ?? '#1f77b4');
    const date = String(metaRow[5] ?? '');
    const comment = String(metaRow[6] ?? '');
    const history = cleanHistory(String(metaRow[7] ?? ''));

    // Read data (columns 1 and 2)
    const xVals: number[] = [];
    const yVals: number[] = [];
    for (let r = 1; r < rows.length; r++) {
      const x = toNumber(rows[r][0]);
      const y = toNumber(rows[r][1]);
      if (isNaN(x)) continue;
      xVals.push(x);
      yVals.push(isNaN(y) ? NaN : y);
    }

    // Trim trailing NaNs from values
    while (yVals.length > 0 && isNaN(yVals[yVals.length - 1])) {
      yVals.pop();
      xVals.pop();
    }

    const item: SeriesItem = {
      id: extractId(sheetName),
      type: itemType as SeriesItem['type'],
      name,
      date,
      comment,
      history,
      xLabel,
      yLabel,
      color,
      index: new Float64Array(xVals),
      values: new Float64Array(yVals),
    };

    // Check for interpolation overlay (columns 9-12)
    if (headers.length >= 9 && String(headers[8]) === 'InterpolationMode') {
      const interpMode = String(metaRow[8] ?? 'Linear') as 'Linear' | 'PCHIP';
      const x1Coords: number[] = [];
      const x2Coords: number[] = [];
      const xOriginalValues: number[] = [];
      const xOriginalLabel = String(headers[11] ?? 'XOriginal');

      for (let r = 1; r < rows.length; r++) {
        const c10 = toNumber(rows[r][9]);
        if (!isNaN(c10)) x1Coords.push(c10);
        const c11 = toNumber(rows[r][10]);
        if (!isNaN(c11)) x2Coords.push(c11);
        const c12 = toNumber(rows[r][11]);
        if (!isNaN(c12)) xOriginalValues.push(c12);
      }

      if (x1Coords.length >= 2) {
        item.interpolation = {
          interpolationMode: interpMode,
          x1Coords,
          x2Coords,
          xOriginalLabel,
          xOriginalValues: new Float64Array(xOriginalValues),
        };
      }
    }

    return item;
  } catch {
    return null;
  }
}

function parseFilterSheet(sheet: XLSX.WorkSheet, sheetName: string): FilterItem | null {
  try {
    const rows = getSheetData(sheet);
    if (rows.length < 2) return null;

    const metaRow = rows[1];
    const params = String(metaRow[2] ?? '1');
    const windowSize = parseInt(params, 10) || 1;

    return {
      id: extractId(sheetName),
      type: 'FILTER',
      name: String(metaRow[1] ?? ''),
      date: String(metaRow[3] ?? ''),
      comment: String(metaRow[4] ?? ''),
      history: cleanHistory(String(metaRow[5] ?? '')),
      windowSize,
    };
  } catch {
    return null;
  }
}

function parseSampleSheet(sheet: XLSX.WorkSheet, sheetName: string): SampleItem | null {
  try {
    const rows = getSheetData(sheet);
    if (rows.length < 2) return null;

    const headers = rows[0] as string[];
    const metaRow = rows[1];
    const params = String(metaRow[2] ?? '');

    // Parse parameters string for step/kind/integrated
    let step: number | null = null;
    let kind: SampleItem['kind'] = 'linear';
    let integrated = false;

    // The Parameters field contains the sampling step or method info
    const parsed = parseFloat(params);
    if (!isNaN(parsed)) step = parsed;

    // Check for XCoords column
    let xCoords: number[] | null = null;
    const xcIdx = headers.indexOf('XCoords');
    if (xcIdx >= 0) {
      xCoords = [];
      for (let r = 1; r < rows.length; r++) {
        const v = toNumber(rows[r][xcIdx]);
        if (!isNaN(v)) xCoords.push(v);
      }
      if (xCoords.length === 0) xCoords = null;
    }

    return {
      id: extractId(sheetName),
      type: 'SAMPLE',
      name: String(metaRow[1] ?? ''),
      date: String(metaRow[3] ?? ''),
      comment: String(metaRow[4] ?? ''),
      history: cleanHistory(String(metaRow[5] ?? '')),
      step,
      kind,
      integrated,
      xCoords,
    };
  } catch {
    return null;
  }
}

function parseInterpolationSheet(sheet: XLSX.WorkSheet, sheetName: string): InterpolationItem | null {
  try {
    const rows = getSheetData(sheet);
    if (rows.length < 2) return null;

    const metaRow = rows[1];

    const x1Coords: number[] = [];
    const x2Coords: number[] = [];
    for (let r = 1; r < rows.length; r++) {
      const v1 = toNumber(rows[r][0]);
      const v2 = toNumber(rows[r][1]);
      if (!isNaN(v1)) x1Coords.push(v1);
      if (!isNaN(v2)) x2Coords.push(v2);
    }

    if (x1Coords.length < 2) return null;

    return {
      id: extractId(sheetName),
      type: 'INTERPOLATION',
      name: String(metaRow[4] ?? ''),
      date: String(metaRow[5] ?? ''),
      comment: String(metaRow[6] ?? ''),
      history: cleanHistory(String(metaRow[7] ?? '')),
      x1Coords,
      x2Coords,
      x1Name: String(metaRow[2] ?? ''),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export a Worksheet as an Excel (.xlsx) file, compatible with PyAnalySeries.
 */
export function exportExcelWorksheet(ws: Worksheet): Blob {
  const wb = XLSX.utils.book_new();

  // Information sheet
  const infoData = [
    ['Created with AnalySeries (browser)'],
    [],
    ['This file has been created with AnalySeries software.'],
    ['Do not modify or accordingly with documentation.'],
    [],
    [new Date().toLocaleString('sv', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', ' at')],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, infoSheet, 'Information');

  for (const item of ws.items) {
    if (item.type === 'Series' || item.type === 'Series filtered' ||
        item.type === 'Series sampled' || item.type === 'Series interpolated') {
      writeSeriesSheet(wb, item as SeriesItem);
    } else if (item.type === 'FILTER') {
      writeFilterSheet(wb, item as FilterItem);
    } else if (item.type === 'SAMPLE') {
      writeSampleSheet(wb, item as SampleItem);
    } else if (item.type === 'INTERPOLATION') {
      writeInterpolationSheet(wb, item as InterpolationItem);
    }
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function writeSeriesSheet(wb: XLSX.WorkBook, item: SeriesItem): void {
  const sheetName = `Series ${item.id}`;
  const n = item.index.length;

  // Build header row
  const headers = [item.xLabel, item.yLabel, 'Type', 'Name', 'Color', 'Date', 'Comment', 'History'];

  if (item.interpolation) {
    headers.push('InterpolationMode', 'X1Coords', 'X2Coords', item.interpolation.xOriginalLabel);
  }

  const data: unknown[][] = [headers];

  // Data rows
  for (let i = 0; i < n; i++) {
    const row: unknown[] = [item.index[i], item.values[i]];
    if (i === 0) {
      row.push(item.type, item.name, item.color, item.date, item.comment, item.history);
      if (item.interpolation) {
        row.push(
          item.interpolation.interpolationMode,
          item.interpolation.x1Coords[0] ?? '',
          item.interpolation.x2Coords[0] ?? '',
          item.interpolation.xOriginalValues[0] ?? '',
        );
      }
    } else {
      row.push('', '', '', '', '', '');
      if (item.interpolation) {
        row.push(
          '',
          i < item.interpolation.x1Coords.length ? item.interpolation.x1Coords[i] : '',
          i < item.interpolation.x2Coords.length ? item.interpolation.x2Coords[i] : '',
          i < item.interpolation.xOriginalValues.length ? item.interpolation.xOriginalValues[i] : '',
        );
      }
    }
    data.push(row);
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  autofitColumns(sheet, data);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31));
}

function writeFilterSheet(wb: XLSX.WorkBook, item: FilterItem): void {
  const sheetName = `FILTER ${item.id}`;
  const data: unknown[][] = [
    ['Type', 'Name', 'Parameters', 'Date', 'Comment', 'History'],
    [item.type, item.name, String(item.windowSize), item.date, item.comment, item.history],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  autofitColumns(sheet, data);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31));
}

function writeSampleSheet(wb: XLSX.WorkBook, item: SampleItem): void {
  const sheetName = `SAMPLE ${item.id}`;
  const headers = ['Type', 'Name', 'Parameters', 'Date', 'Comment', 'History'];
  const params = item.step !== null ? String(item.step) : item.kind;

  if (item.xCoords) {
    headers.push('XCoords');
  }

  const data: unknown[][] = [headers];
  const row1: unknown[] = [item.type, item.name, params, item.date, item.comment, item.history];
  if (item.xCoords) row1.push(item.xCoords[0] ?? '');
  data.push(row1);

  if (item.xCoords) {
    for (let i = 1; i < item.xCoords.length; i++) {
      const row: unknown[] = ['', '', '', '', '', '', item.xCoords[i]];
      data.push(row);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  autofitColumns(sheet, data);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31));
}

function writeInterpolationSheet(wb: XLSX.WorkBook, item: InterpolationItem): void {
  const sheetName = `INTERPOLATION ${item.id}`;
  const n = Math.max(item.x1Coords.length, item.x2Coords.length);

  const data: unknown[][] = [
    ['X1Coords', 'X2Coords', 'X1Name', 'Type', 'Name', 'Date', 'Comment', 'History'],
  ];

  for (let i = 0; i < n; i++) {
    const row: unknown[] = [
      i < item.x1Coords.length ? item.x1Coords[i] : '',
      i < item.x2Coords.length ? item.x2Coords[i] : '',
    ];
    if (i === 0) {
      row.push(item.x1Name, item.type, item.name, item.date, item.comment, item.history);
    } else {
      row.push('', '', '', '', '', '');
    }
    data.push(row);
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  autofitColumns(sheet, data);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31));
}

function autofitColumns(sheet: XLSX.WorkSheet, data: unknown[][]): void {
  const colWidths: number[] = [];
  for (const row of data) {
    for (let c = 0; c < row.length; c++) {
      const len = String(row[c] ?? '').length;
      colWidths[c] = Math.max(colWidths[c] ?? 0, len);
    }
  }
  sheet['!cols'] = colWidths.map(w => ({ wch: w + 5 }));
}
