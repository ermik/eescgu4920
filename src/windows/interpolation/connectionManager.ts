/**
 * Connection management — creating, validating, removing, and undoing
 * tie-point connections between the reference and distorted subplots.
 *
 * This module orchestrates the visual side of connection operations
 * (shapes, overlay lines) while delegating state mutations to
 * InterpolationState.
 */

import type { PlotEngine } from '../../plot/engine.js';
import type { ConnectionOverlay } from '../../plot/connectionOverlay.js';
import type { InterpolationState } from './state.js';

// ---------------------------------------------------------------------------
// Pointer style constants
// ---------------------------------------------------------------------------

const POINTER_STYLE = {
  color: 'blue',
  dash: 'dash' as const,
  width: 1,
  opacity: 0.5,
};

const CONNECTED_STYLE = {
  color: 'blue',
  dash: 'dash' as const,
  width: 1,
  opacity: 0.5,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to create a connection from the current pending pointers.
 * Validates crossing, creates overlay line, and updates state.
 *
 * Returns a status message string (empty on success).
 */
export function createConnection(
  state: InterpolationState,
  engine: PlotEngine,
  overlay: ConnectionOverlay,
): string {
  // Capture pending shape IDs BEFORE state.createConnection() clears them
  const pendingRefShapeId = state.pendingRef?.shapeId;
  const pendingDistShapeId = state.pendingDist?.shapeId;

  const result = state.createConnection(({ x1, x2 }) => {
    // Create committed vertical lines (the pending shapes become committed)
    const [vlineRef] = engine.addVerticalLines([x1], 0, CONNECTED_STYLE);
    const [vlineDist] = engine.addVerticalLines([x2], 1, CONNECTED_STYLE);

    // Create the SVG overlay line
    const conn = overlay.addConnection(x1, x2);

    return {
      vlineRef,
      vlineDist,
      overlayLineId: conn.id,
    };
  });

  if (result.kind === 'connection-created') {
    // Remove the old pending pointer shapes using captured IDs
    const toRemove: string[] = [];
    if (pendingRefShapeId) toRemove.push(pendingRefShapeId);
    if (pendingDistShapeId) toRemove.push(pendingDistShapeId);
    if (toRemove.length > 0) engine.removeShapes(toRemove);
    return '';
  }

  if (result.kind === 'connection-failed') {
    return result.reason;
  }

  return '';
}

/**
 * Remove a specific connection by its overlay line ID.
 * Restores the two endpoints as pending pointers for repositioning.
 */
export function disconnectByOverlayId(
  state: InterpolationState,
  engine: PlotEngine,
  overlay: ConnectionOverlay,
  overlayLineId: string,
): void {
  const conn = state.connections.find(c => c.overlayLineId === overlayLineId);
  if (!conn) return;

  // Remove visuals
  engine.removeShapes([conn.vlineRef, conn.vlineDist]);
  overlay.removeConnection(conn.overlayLineId);

  // Remove any existing pending pointers
  removePendingShapes(state, engine);

  // Remove from state
  state.removeConnection(conn.id);

  // Set the endpoints as pending pointers for repositioning
  const [newRefShape] = engine.addVerticalLines([conn.x1], 0, POINTER_STYLE);
  const [newDistShape] = engine.addVerticalLines([conn.x2], 1, POINTER_STYLE);

  state.pendingRef = {
    subplot: 0,
    x: conn.x1,
    snapped: false,
    shapeId: newRefShape,
  };
  state.pendingDist = {
    subplot: 1,
    x: conn.x2,
    snapped: false,
    shapeId: newDistShape,
  };
}

/**
 * Remove all connections after user confirmation.
 */
export function clearAllConnections(
  state: InterpolationState,
  engine: PlotEngine,
  overlay: ConnectionOverlay,
): void {
  // Batch shape removals to avoid multiple Plotly.react() calls
  engine.beginUpdate();

  // Remove all committed connection visuals
  for (const conn of state.connections) {
    engine.removeShapes([conn.vlineRef, conn.vlineDist]);
    overlay.removeConnection(conn.overlayLineId);
  }

  // Remove pending pointer shapes
  removePendingShapes(state, engine);

  engine.endUpdate();

  state.clearAll();
}

/**
 * Toggle the last connection (undo/redo single level).
 */
export function toggleLastConnection(
  state: InterpolationState,
  engine: PlotEngine,
  overlay: ConnectionOverlay,
): void {
  const result = state.toggleLastConnection();

  if (result.kind === 'connection-removed') {
    const conn = result.connection;
    engine.removeShapes([conn.vlineRef, conn.vlineDist]);
    overlay.removeConnection(conn.overlayLineId);
  } else if (result.kind === 'connection-restored') {
    const conn = result.connection;
    // Recreate visuals
    const [newVlineRef] = engine.addVerticalLines([conn.x1], 0, CONNECTED_STYLE);
    const [newVlineDist] = engine.addVerticalLines([conn.x2], 1, CONNECTED_STYLE);
    const newOverlay = overlay.addConnection(conn.x1, conn.x2);

    // Update the connection's visual IDs
    conn.vlineRef = newVlineRef;
    conn.vlineDist = newVlineDist;
    conn.overlayLineId = newOverlay.id;
  }
}

/**
 * Load connections from an existing InterpolationItem into state and visuals.
 */
export function loadExistingConnections(
  state: InterpolationState,
  engine: PlotEngine,
  overlay: ConnectionOverlay,
  x1Coords: number[],
  x2Coords: number[],
): void {
  state.loadConnections(x1Coords, x2Coords, ({ x1, x2 }) => {
    const [vlineRef] = engine.addVerticalLines([x1], 0, CONNECTED_STYLE);
    const [vlineDist] = engine.addVerticalLines([x2], 1, CONNECTED_STYLE);
    const conn = overlay.addConnection(x1, x2);
    return { vlineRef, vlineDist, overlayLineId: conn.id };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Remove the current pending pointer shapes from the plot. */
function removePendingShapes(
  state: InterpolationState,
  engine: PlotEngine,
): void {
  if (state.pendingRef) {
    engine.removeShapes([state.pendingRef.shapeId]);
  }
  if (state.pendingDist) {
    engine.removeShapes([state.pendingDist.shapeId]);
  }
}
