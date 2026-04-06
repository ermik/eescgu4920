/**
 * Pointers table — HTML table displaying the sorted tie-point coordinates.
 */

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

/**
 * Update the pointers table with current connection data.
 */
export function updatePointersTable(
  container: HTMLDivElement,
  state: InterpolationState,
): void {
  container.innerHTML = '';

  const { x1Coords, x2Coords } = state;
  if (x1Coords.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No tie-points defined. Use Shift+Click to place pointers, then press C to connect.';
    empty.style.padding = '12px';
    empty.style.color = '#666';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'as-data-table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [
    `Distorted: ${state.distItem.xLabel}`,
    `Reference: ${state.refItem.xLabel}`,
  ];
  for (const text of headers) {
    const th = document.createElement('th');
    th.textContent = text;
    th.style.fontStyle = 'italic';
    th.style.padding = '4px 8px';
    th.style.borderBottom = '2px solid #ccc';
    th.style.textAlign = 'right';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (let i = 0; i < x1Coords.length; i++) {
    const tr = document.createElement('tr');
    tr.style.backgroundColor = i % 2 === 0 ? 'white' : 'whitesmoke';

    const tdDist = document.createElement('td');
    tdDist.textContent = formatNumber(x2Coords[i]);
    tdDist.style.padding = '2px 8px';
    tdDist.style.textAlign = 'right';
    tdDist.style.fontFamily = 'monospace';

    const tdRef = document.createElement('td');
    tdRef.textContent = formatNumber(x1Coords[i]);
    tdRef.style.padding = '2px 8px';
    tdRef.style.textAlign = 'right';
    tdRef.style.fontFamily = 'monospace';

    tr.appendChild(tdDist);
    tr.appendChild(tdRef);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}
