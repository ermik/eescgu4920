/**
 * Tests for InterpolationState — state transitions, sorting consistency,
 * and connection lifecycle.
 */

import { describe, it, expect } from 'vitest';
import { InterpolationState } from '../state.js';
import type { SeriesItem } from '../../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeries(id: string, xLabel = 'X', yLabel = 'Y'): SeriesItem {
  return {
    id,
    type: 'Series',
    name: `Series ${id}`,
    date: '',
    comment: '',
    history: '',
    xLabel,
    yLabel,
    color: '#000000',
    index: new Float64Array([0, 1, 2, 3, 4]),
    values: new Float64Array([0, 1, 2, 3, 4]),
  };
}

/** Stub for assignIds — returns predictable shape IDs. */
let shapeCounter = 0;
function assignIds(_conn: { x1: number; x2: number }) {
  const n = shapeCounter++;
  return {
    vlineRef: `ref-${n}`,
    vlineDist: `dist-${n}`,
    overlayLineId: `overlay-${n}`,
  };
}

function resetShapeCounter() {
  shapeCounter = 0;
}

// ---------------------------------------------------------------------------
// Basic state transitions
// ---------------------------------------------------------------------------

describe('InterpolationState', () => {
  it('starts with no pointers and no connections', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    expect(state.pendingRef).toBeNull();
    expect(state.pendingDist).toBeNull();
    expect(state.connections).toHaveLength(0);
    expect(state.canInterpolate).toBe(false);
  });

  it('placePointer sets pendingRef for subplot 0', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    const result = state.placePointer({
      subplot: 0, x: 100, snapped: false, shapeId: 's1',
    });
    expect(result.kind).toBe('pointer-placed');
    expect(state.pendingRef).not.toBeNull();
    expect(state.pendingRef!.x).toBe(100);
    expect(state.pendingDist).toBeNull();
  });

  it('placePointer sets pendingDist for subplot 1', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 200, snapped: false, shapeId: 's2' });
    expect(state.pendingRef).not.toBeNull();
    expect(state.pendingDist).not.toBeNull();
  });

  it('placePointer replaces existing pointer, returning old one', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    const result = state.placePointer({
      subplot: 0, x: 150, snapped: false, shapeId: 's2',
    });
    expect(result.kind).toBe('pointer-placed');
    if (result.kind === 'pointer-placed') {
      expect(result.replaced).not.toBeNull();
      expect(result.replaced!.x).toBe(100);
    }
    expect(state.pendingRef!.x).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Connection creation
// ---------------------------------------------------------------------------

describe('createConnection', () => {
  it('fails without both pointers', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    const result = state.createConnection(assignIds);
    expect(result.kind).toBe('connection-failed');
  });

  it('creates a connection when both pointers are set', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 200, snapped: false, shapeId: 's2' });
    const result = state.createConnection(assignIds);
    expect(result.kind).toBe('connection-created');
    expect(state.connections).toHaveLength(1);
    expect(state.pendingRef).toBeNull();
    expect(state.pendingDist).toBeNull();
  });

  it('connections are sorted by x1', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    // Add in non-sorted order
    state.placePointer({ subplot: 0, x: 300, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 150, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's3' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's4' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 's5' });
    state.placePointer({ subplot: 1, x: 100, snapped: false, shapeId: 's6' });
    state.createConnection(assignIds);

    expect(state.x1Coords).toEqual([100, 200, 300]);
    expect(state.x2Coords).toEqual([50, 100, 150]);
  });

  it('rejects crossing connections', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 300, snapped: false, shapeId: 's3' });
    state.placePointer({ subplot: 1, x: 150, snapped: false, shapeId: 's4' });
    state.createConnection(assignIds);

    // Try crossing: x1 between 100-300 but x2 beyond 150
    state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 's5' });
    state.placePointer({ subplot: 1, x: 160, snapped: false, shapeId: 's6' });
    const result = state.createConnection(assignIds);
    expect(result.kind).toBe('connection-failed');
    expect(state.connections).toHaveLength(2);
  });

  it('rejects duplicate x1 coordinates', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's3' });
    state.placePointer({ subplot: 1, x: 75, snapped: false, shapeId: 's4' });
    const result = state.createConnection(assignIds);
    expect(result.kind).toBe('connection-failed');
  });
});

// ---------------------------------------------------------------------------
// Undo (toggle last connection)
// ---------------------------------------------------------------------------

describe('toggleLastConnection', () => {
  it('no-op when no connections exist', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    const result = state.toggleLastConnection();
    expect(result.kind).toBe('no-op');
  });

  it('removes last connection on first toggle', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    const result = state.toggleLastConnection();
    expect(result.kind).toBe('connection-removed');
    expect(state.connections).toHaveLength(0);
    expect(state.lastConnectionRemoved).toBe(true);
  });

  it('restores last connection on second toggle', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.toggleLastConnection(); // remove
    const result = state.toggleLastConnection(); // restore
    expect(result.kind).toBe('connection-restored');
    expect(state.connections).toHaveLength(1);
    expect(state.lastConnectionRemoved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// removeConnection
// ---------------------------------------------------------------------------

describe('removeConnection', () => {
  it('removes a specific connection', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 's3' });
    state.placePointer({ subplot: 1, x: 100, snapped: false, shapeId: 's4' });
    state.createConnection(assignIds);

    const connId = state.connections[0].id;
    state.removeConnection(connId);

    expect(state.connections).toHaveLength(1);
    expect(state.connections[0].x1).toBe(200);
  });

  it('remaining connections stay sorted after removal', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    // Create 4 connections
    const coords = [
      [100, 50], [200, 100], [300, 150], [400, 200],
    ];
    for (const [x1, x2] of coords) {
      state.placePointer({ subplot: 0, x: x1, snapped: false, shapeId: `r${x1}` });
      state.placePointer({ subplot: 1, x: x2, snapped: false, shapeId: `d${x2}` });
      state.createConnection(assignIds);
    }

    // Remove the middle one (x1=200)
    const middle = state.connections.find(c => c.x1 === 200)!;
    state.removeConnection(middle.id);

    expect(state.x1Coords).toEqual([100, 300, 400]);
    expect(state.x2Coords).toEqual([50, 150, 200]);
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe('clearAll', () => {
  it('clears all state', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.clearAll();

    expect(state.connections).toHaveLength(0);
    expect(state.pendingRef).toBeNull();
    expect(state.pendingDist).toBeNull();
    expect(state.lastConnection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// switchSeries
// ---------------------------------------------------------------------------

describe('switchSeries', () => {
  it('clears all connections and resets', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.switchSeries(makeSeries('c'), makeSeries('d'));

    expect(state.connections).toHaveLength(0);
    expect(state.refItem.id).toBe('c');
    expect(state.distItem.id).toBe('d');
  });
});

// ---------------------------------------------------------------------------
// canInterpolate
// ---------------------------------------------------------------------------

describe('canInterpolate', () => {
  it('false with 0 connections', () => {
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    expect(state.canInterpolate).toBe(false);
  });

  it('false with 1 connection', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);
    expect(state.canInterpolate).toBe(false);
  });

  it('true with 2+ connections', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 's3' });
    state.placePointer({ subplot: 1, x: 100, snapped: false, shapeId: 's4' });
    state.createConnection(assignIds);

    expect(state.canInterpolate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coordinate sorting consistency (property-based)
// ---------------------------------------------------------------------------

describe('sorting consistency after random operations', () => {
  it('x1Coords and x2Coords are always sorted and consistent', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    // Pseudo-random but deterministic sequence
    const rng = seedRng(42);

    for (let op = 0; op < 50; op++) {
      const action = rng() % 3;

      if (action === 0 && state.connections.length < 20) {
        // Try to add a connection
        const x1 = rng() % 1000;
        const x2 = rng() % 1000;
        state.placePointer({ subplot: 0, x: x1, snapped: false, shapeId: `r${op}` });
        state.placePointer({ subplot: 1, x: x2, snapped: false, shapeId: `d${op}` });
        state.createConnection(assignIds); // may fail, that's fine
      } else if (action === 1 && state.connections.length > 0) {
        // Remove a random connection
        const idx = rng() % state.connections.length;
        state.removeConnection(state.connections[idx].id);
      } else {
        // Toggle undo
        state.toggleLastConnection();
      }

      // Invariant checks
      const { x1Coords, x2Coords, connections } = state;

      // Same length
      expect(x1Coords.length).toBe(x2Coords.length);
      expect(x1Coords.length).toBe(connections.length);

      // x1Coords sorted
      for (let i = 1; i < x1Coords.length; i++) {
        expect(x1Coords[i]).toBeGreaterThan(x1Coords[i - 1]);
      }

      // No crossing: for every pair, if x1[i] < x1[j] then x2[i] < x2[j]
      for (let i = 0; i < connections.length; i++) {
        for (let j = i + 1; j < connections.length; j++) {
          if (connections[i].x1 < connections[j].x1) {
            expect(connections[i].x2).toBeLessThan(connections[j].x2);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// loadConnections
// ---------------------------------------------------------------------------

describe('loadConnections', () => {
  it('loads existing tie-point coordinates', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.loadConnections([100, 200, 300], [50, 100, 150], assignIds);

    expect(state.connections).toHaveLength(3);
    expect(state.x1Coords).toEqual([100, 200, 300]);
    expect(state.x2Coords).toEqual([50, 100, 150]);
    expect(state.canInterpolate).toBe(true);
  });

  it('sets lastConnection to the last loaded connection', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    state.loadConnections([100, 200], [50, 100], assignIds);

    expect(state.lastConnection).not.toBeNull();
    expect(state.lastConnection!.x1).toBe(200);
    expect(state.lastConnectionRemoved).toBe(false);
  });

  it('replaces existing connections', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    // Create one connection first
    state.placePointer({ subplot: 0, x: 500, snapped: false, shapeId: 's1' });
    state.placePointer({ subplot: 1, x: 250, snapped: false, shapeId: 's2' });
    state.createConnection(assignIds);

    // Load replaces
    state.loadConnections([100, 200], [50, 100], assignIds);

    expect(state.connections).toHaveLength(2);
    expect(state.x1Coords).toEqual([100, 200]);
  });
});

// ---------------------------------------------------------------------------
// Undo edge case: toggle after removeConnection deletes the tracked connection
// ---------------------------------------------------------------------------

describe('undo after removeConnection of tracked connection', () => {
  it('first toggle is a visual no-op, second toggle restores', () => {
    resetShapeCounter();
    const state = new InterpolationState(makeSeries('a'), makeSeries('b'));

    // Create A
    state.placePointer({ subplot: 0, x: 100, snapped: false, shapeId: 'r1' });
    state.placePointer({ subplot: 1, x: 50, snapped: false, shapeId: 'd1' });
    state.createConnection(assignIds);

    // Create B (becomes lastConnection)
    state.placePointer({ subplot: 0, x: 200, snapped: false, shapeId: 'r2' });
    state.placePointer({ subplot: 1, x: 100, snapped: false, shapeId: 'd2' });
    state.createConnection(assignIds);

    expect(state.connections).toHaveLength(2);
    const connB = state.connections.find(c => c.x1 === 200)!;

    // Remove B via removeConnection (as x+click disconnect would)
    state.removeConnection(connB.id);
    expect(state.connections).toHaveLength(1);

    // lastConnection still tracks B, lastConnectionRemoved is still false
    expect(state.lastConnection!.id).toBe(connB.id);
    expect(state.lastConnectionRemoved).toBe(false);

    // First toggle: tries to remove B from connections array, but it's already gone
    // The splice with idx < 0 is guarded, so connections stay unchanged
    const result1 = state.toggleLastConnection();
    expect(result1.kind).toBe('connection-removed');
    expect(state.connections).toHaveLength(1); // only A remains, B was already gone
    expect(state.lastConnectionRemoved).toBe(true);

    // Second toggle: restores B
    const result2 = state.toggleLastConnection();
    expect(result2.kind).toBe('connection-restored');
    expect(state.connections).toHaveLength(2);
    expect(state.lastConnectionRemoved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Simple seeded RNG for deterministic tests
// ---------------------------------------------------------------------------

function seedRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
}
