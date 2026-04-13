import { describe, it, expect, afterEach } from 'vitest';
import { createPointersTable, updatePointersTable } from './pointersTable';
import { InterpolationState } from './state';
import type { TiePointConnection } from './types';
import { mockSeriesItem, resetFixtureIds, stripLitMarkers } from '../../fixtures';

describe('pointersTable', () => {
  afterEach(() => resetFixtureIds());

  function makeState() {
    const ref = mockSeriesItem({ xLabel: 'Ref Age' });
    const dist = mockSeriesItem({ xLabel: 'Dist Depth' });
    return new InterpolationState(ref, dist);
  }

  function conn(id: number, x1: number, x2: number): TiePointConnection {
    return {
      id: `c${id}`,
      x1,
      x2,
      vlineRef: `vr${id}`,
      vlineDist: `vd${id}`,
      overlayLineId: `ol${id}`,
    };
  }

  it('createPointersTable returns a container div', () => {
    const container = createPointersTable();
    expect(container.className).toBe('as-pointers-table-container');
    expect(container.tagName).toBe('DIV');
  });

  it('empty state shows no tie-points message', () => {
    const container = createPointersTable();
    const state = makeState();
    updatePointersTable(container, state);
    expect(container.textContent).toContain('No tie-points defined');
  });

  it('with connections shows table with header and rows', () => {
    const container = createPointersTable();
    const state = makeState();
    state.connections.push(conn(0, 0, 0), conn(1, 10, 12), conn(2, 20, 22));
    updatePointersTable(container, state);

    const table = container.querySelector('table')!;
    expect(table).toBeTruthy();
    expect(table.className).toBe('as-pointers-table');

    const ths = table.querySelectorAll('th');
    expect(ths.length).toBe(2);
    expect(ths[0].textContent).toContain('Distorted');
    expect(ths[1].textContent).toContain('Reference');

    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('alternating row colors (via :nth-child CSS on .as-pointers-table)', () => {
    const container = createPointersTable();
    const state = makeState();
    state.connections.push(conn(0, 0, 0), conn(1, 10, 12));
    updatePointersTable(container, state);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    // Styling is handled by the .as-pointers-table tr:nth-child(even) rule
    // in style.css — we only verify the table carries the right class here.
    const table = container.querySelector('table')!;
    expect(table.className).toBe('as-pointers-table');
  });

  it('snapshot with 3 tie points', () => {
    const container = createPointersTable();
    const state = makeState();
    state.connections.push(conn(0, 0, 0), conn(1, 10, 12), conn(2, 20, 22));
    updatePointersTable(container, state);
    expect(stripLitMarkers(container.innerHTML)).toMatchSnapshot();
  });
});
