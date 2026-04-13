/**
 * Pointers table — HTML table displaying the sorted tie-point coordinates.
 */

import { html, render } from 'lit';
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
  return container;
}

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
      <p class="as-pointers-empty">
        No tie-points defined. Use Shift+Click to place pointers, then press C to connect.
      </p>
    `, container);
    return;
  }

  render(html`
    <table class="as-pointers-table">
      <thead>
        <tr>
          <th>Distorted: ${state.distItem.xLabel}</th>
          <th>Reference: ${state.refItem.xLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${x1Coords.map((_, i) => html`
          <tr>
            <td>${formatNumber(x2Coords[i])}</td>
            <td>${formatNumber(x1Coords[i])}</td>
          </tr>
        `)}
      </tbody>
    </table>
  `, container);
}
