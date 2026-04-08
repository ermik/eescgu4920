/**
 * Tests for the CSV/TSV parsing logic used by the import dialog.
 *
 * Since parseText is a private method on ImportDialog, we test the PapaParse
 * configuration directly — verifying the same options used in the dialog
 * produce correct results for edge cases.
 */

import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';

/** Parse text using the same PapaParse options as ImportDialog.parseText */
function parseText(text: string): { headers: string[]; rows: string[][] } {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const data = result.data;
  if (data.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = data[0].map(h => h.trim());
  const rows = data.slice(1).map(row => row.map(c => c.trim()));
  return { headers, rows };
}

describe('CSV/TSV parser edge cases', () => {
  it('parses comma-separated data with quoted fields containing commas', () => {
    const text = '"col1","col2","col3"\n"value1","hello, world","value3"';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2', 'col3']);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['value1', 'hello, world', 'value3']);
  });

  it('parses TSV data with quoted fields containing tabs', () => {
    const text = 'col1\tcol2\tcol3\n"val\t1"\tval2\tval3';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2', 'col3']);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['val\t1', 'val2', 'val3']);
  });

  it('strips UTF-8 BOM from start of file', () => {
    const text = '\uFEFFcol1,col2\nval1,val2';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2']);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['val1', 'val2']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const text = 'col1,col2\n"he said ""hello""",normal';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2']);
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('he said "hello"');
    expect(rows[0][1]).toBe('normal');
  });

  it('trailing empty rows are stripped', () => {
    const text = 'col1,col2\nval1,val2\n\n\n';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2']);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['val1', 'val2']);
  });

  it('handles \\r\\n and \\r line endings', () => {
    const text = 'col1,col2\r\nval1,val2\rval3,val4';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['col1', 'col2']);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['val1', 'val2']);
    expect(rows[1]).toEqual(['val3', 'val4']);
  });

  it('parses basic tab-separated data', () => {
    const text = 'Depth\tValue\n1.0\t10.5\n2.0\t20.3';
    const { headers, rows } = parseText(text);
    expect(headers).toEqual(['Depth', 'Value']);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['1.0', '10.5']);
    expect(rows[1]).toEqual(['2.0', '20.3']);
  });
});
