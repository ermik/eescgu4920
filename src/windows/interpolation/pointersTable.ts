/**
 * Pointers table — HTML table displaying the sorted tie-point coordinates.
 */

import { html, render } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import type { InterpolationState } from './state.js';
import { formatNumber } from '../../utils.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the pointers table container element.
 */
export function createPointersTable(): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'as-pointers-table-container';
  container.style.overflow = 'auto';
  container.style.height = '100%';
  return container;
}

const thStyle = { fontStyle: 'italic', padding: '4px 8px', borderBottom: '2px solid #ccc', textAlign: 'right' };
const tdStyle = { padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace' };

/**
 * Update the pointers table with current connection data.
 */
export function updatePointersTable(
  container: HTMLDivElement,
  state: InterpolationState,
): void {
  const { x1Coords, x2Coords } = state;

  if (x1Coords.length === 0) {
    render(html`
      <p style="padding:12px; color:#666">
        No tie-points defined. Use Shift+Click to place pointers, then press C to connect.
      </p>
    `, container);
    return;
  }

  render(html`
    <table class="as-data-table" style="width:100%; border-collapse:collapse">
      <thead>
        <tr>
          <th style=${styleMap(thStyle)}>Distorted: ${state.distItem.xLabel}</th>
          <th style=${styleMap(thStyle)}>Reference: ${state.refItem.xLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${x1Coords.map((_, i) => html`
          <tr style=${styleMap({ backgroundColor: i % 2 === 0 ? 'white' : 'whitesmoke' })}>
            <td style=${styleMap(tdStyle)}>${formatNumber(x2Coords[i])}</td>
            <td style=${styleMap(tdStyle)}>${formatNumber(x1Coords[i])}</td>
          </tr>
        `)}
      </tbody>
    </table>
  `, container);
}
