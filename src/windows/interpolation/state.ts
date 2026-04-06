/**
 * InterpolationState — single source of truth for all mutable state in the
 * interpolation window.
 *
 * Every user action (place pointer, connect, delete, undo, switch mode) flows
 * through a method here. Methods validate, mutate, and return a description of
 * what changed so the rendering layer can make minimal updates.
 */

import type { SeriesItem } from '../../types.js';
import type {
  PendingPointer,
  TiePointConnection,
  InterpolationMode,
} from './types.js';

// ---------------------------------------------------------------------------
// Action results — returned to callers so they know what to redraw
// ---------------------------------------------------------------------------

export type StateAction =
  | { kind: 'pointer-placed'; subplot: 0 | 1; replaced: PendingPointer | null }
  | { kind: 'connection-created'; connection: TiePointConnection }
  | { kind: 'connection-failed'; reason: string }
  | { kind: 'connection-removed'; connection: TiePointConnection }
  | { kind: 'connection-restored'; connection: TiePointConnection }
  | { kind: 'all-cleared' }
  | { kind: 'mode-changed'; mode: InterpolationMode }
  | { kind: 'series-switched' }
  | { kind: 'no-op'; reason: string };

// ---------------------------------------------------------------------------
// InterpolationState
// ---------------------------------------------------------------------------

export class InterpolationState {
  // Series
  refItem: SeriesItem;
  distItem: SeriesItem;

  // Pending pointers (at most one per subplot)
  pendingRef: PendingPointer | null = null;
  pendingDist: PendingPointer | null = null;

  // Committed connections — always sorted by x1 (reference coordinate)
  connections: TiePointConnection[] = [];

  // Undo buffer (single level)
  lastConnection: TiePointConnection | null = null;
  lastConnectionRemoved = false;

  // Settings
  interpolationMode: InterpolationMode = 'Linear';
  showInterpolated = true;

  // Next connection ID counter
  private nextConnId = 0;

  constructor(refItem: SeriesItem, distItem: SeriesItem) {
    this.refItem = refItem;
    this.distItem = distItem;
  }

  // --- Derived accessors ---------------------------------------------------

  /** Sorted reference X coordinates from all connections. */
  get x1Coords(): number[] {
    return this.connections.map(c => c.x1);
  }

  /** Sorted distorted X coordinates from all connections. */
  get x2Coords(): number[] {
    return this.connections.map(c => c.x2);
  }

  /** Whether enough connections exist for interpolation (≥2). */
  get canInterpolate(): boolean {
    return this.connections.length >= 2;
  }

  // --- Pointer placement ---------------------------------------------------

  /**
   * Place or move a pending pointer on a subplot.
   * Returns the previous pointer (if any) so the caller can remove its shape.
   */
  placePointer(pointer: PendingPointer): StateAction {
    const replaced =
      pointer.subplot === 0 ? this.pendingRef : this.pendingDist;

    if (pointer.subplot === 0) {
      this.pendingRef = pointer;
    } else {
      this.pendingDist = pointer;
    }

    return { kind: 'pointer-placed', subplot: pointer.subplot, replaced };
  }

  // --- Connection creation -------------------------------------------------

  /**
   * Validate and create a connection from the two pending pointers.
   *
   * The crossing check uses the same logic as the Python reference:
   * `np.searchsorted(X1Coords_cur, X1Coord) != np.searchsorted(X2Coords_cur, X2Coord)`
   *
   * Both pending pointers are consumed (set to null) on success.
   */
  createConnection(
    assignIds: (conn: {
      x1: number;
      x2: number;
    }) => { vlineRef: string; vlineDist: string; overlayLineId: string },
  ): StateAction {
    if (!this.pendingRef || !this.pendingDist) {
      return {
        kind: 'connection-failed',
        reason: 'Both reference and distorted pointers must be placed first.',
      };
    }

    const x1 = this.pendingRef.x;
    const x2 = this.pendingDist.x;

    // Check for duplicate X coordinates
    if (this.connections.some(c => c.x1 === x1)) {
      return {
        kind: 'connection-failed',
        reason: 'A connection already exists at that reference position.',
      };
    }
    if (this.connections.some(c => c.x2 === x2)) {
      return {
        kind: 'connection-failed',
        reason: 'A connection already exists at that distorted position.',
      };
    }

    // Crossing check: insert position must be the same in both sorted arrays
    if (!validateNoCrossing(this.x1Coords, this.x2Coords, x1, x2)) {
      return {
        kind: 'connection-failed',
        reason:
          'Connection not possible because it would cross existing connections.',
      };
    }

    // Create the connection
    const ids = assignIds({ x1, x2 });
    const conn: TiePointConnection = {
      id: `tie-${this.nextConnId++}`,
      x1,
      x2,
      vlineRef: ids.vlineRef,
      vlineDist: ids.vlineDist,
      overlayLineId: ids.overlayLineId,
    };

    // Insert in sorted order by x1
    const insertIdx = sortedInsertIndex(this.connections, x1);
    this.connections.splice(insertIdx, 0, conn);

    // Update undo buffer
    this.lastConnection = conn;
    this.lastConnectionRemoved = false;

    // Consume pending pointers
    this.pendingRef = null;
    this.pendingDist = null;

    return { kind: 'connection-created', connection: conn };
  }

  // --- Connection removal --------------------------------------------------

  /** Remove a specific connection by ID. */
  removeConnection(connectionId: string): StateAction {
    const idx = this.connections.findIndex(c => c.id === connectionId);
    if (idx < 0) return { kind: 'no-op', reason: 'Connection not found.' };

    const conn = this.connections[idx];
    this.connections.splice(idx, 1);

    return { kind: 'connection-removed', connection: conn };
  }

  /** Remove all connections and pointers. Resets undo buffer. */
  clearAll(): StateAction {
    this.connections = [];
    this.pendingRef = null;
    this.pendingDist = null;
    this.lastConnection = null;
    this.lastConnectionRemoved = false;
    return { kind: 'all-cleared' };
  }

  // --- Undo (single level toggle) -----------------------------------------

  /**
   * Toggle the last connection: remove it if present, restore it if absent.
   * Returns the action taken, or no-op if nothing to undo.
   */
  toggleLastConnection(): StateAction {
    if (!this.lastConnection) {
      return { kind: 'no-op', reason: 'No connection to undo.' };
    }

    if (!this.lastConnectionRemoved) {
      // Remove the last connection
      const idx = this.connections.findIndex(
        c => c.id === this.lastConnection!.id,
      );
      if (idx >= 0) {
        this.connections.splice(idx, 1);
      }
      this.lastConnectionRemoved = true;
      return { kind: 'connection-removed', connection: this.lastConnection };
    } else {
      // Restore the last connection
      const conn = this.lastConnection;
      const insertIdx = sortedInsertIndex(this.connections, conn.x1);
      this.connections.splice(insertIdx, 0, conn);
      this.lastConnectionRemoved = false;
      return { kind: 'connection-restored', connection: conn };
    }
  }

  // --- Mode changes --------------------------------------------------------

  setInterpolationMode(mode: InterpolationMode): StateAction {
    if (this.interpolationMode === mode) {
      return { kind: 'no-op', reason: 'Mode unchanged.' };
    }
    this.interpolationMode = mode;
    return { kind: 'mode-changed', mode };
  }

  // --- Series switching ----------------------------------------------------

  switchSeries(refItem: SeriesItem, distItem: SeriesItem): StateAction {
    this.refItem = refItem;
    this.distItem = distItem;
    this.connections = [];
    this.pendingRef = null;
    this.pendingDist = null;
    this.lastConnection = null;
    this.lastConnectionRemoved = false;
    this.nextConnId = 0;
    return { kind: 'series-switched' };
  }

  // --- Load existing interpolation -----------------------------------------

  /**
   * Load tie-point coordinates from an existing InterpolationItem.
   * The caller must create the visual elements and call assignIds for each.
   */
  loadConnections(
    x1Coords: number[],
    x2Coords: number[],
    assignIds: (conn: {
      x1: number;
      x2: number;
    }) => { vlineRef: string; vlineDist: string; overlayLineId: string },
  ): void {
    this.connections = [];
    for (let i = 0; i < x1Coords.length; i++) {
      const ids = assignIds({ x1: x1Coords[i], x2: x2Coords[i] });
      this.connections.push({
        id: `tie-${this.nextConnId++}`,
        x1: x1Coords[i],
        x2: x2Coords[i],
        vlineRef: ids.vlineRef,
        vlineDist: ids.vlineDist,
        overlayLineId: ids.overlayLineId,
      });
    }
    if (this.connections.length > 0) {
      this.lastConnection = this.connections[this.connections.length - 1];
      this.lastConnectionRemoved = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Find the sorted insert index for a new x1 value in the connections array.
 */
export function sortedInsertIndex(
  connections: TiePointConnection[],
  x1: number,
): number {
  let lo = 0;
  let hi = connections.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (connections[mid].x1 < x1) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Binary search for the insert position of `val` in a sorted number array.
 * Equivalent to `np.searchsorted(arr, val)`.
 */
export function searchSorted(arr: number[], val: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Validate that a new connection (x1, x2) would not cross any existing
 * connections. Uses the same algorithm as the Python reference:
 * `np.searchsorted(X1Coords, x1) == np.searchsorted(X2Coords, x2)`
 *
 * Also rejects duplicate coordinates.
 */
export function validateNoCrossing(
  x1Coords: number[],
  x2Coords: number[],
  newX1: number,
  newX2: number,
): boolean {
  if (x1Coords.length === 0) return true;

  const pos1 = searchSorted(x1Coords, newX1);
  const pos2 = searchSorted(x2Coords, newX2);
  return pos1 === pos2;
}
