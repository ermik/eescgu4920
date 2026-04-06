/**
 * Plot module barrel — re-exports the public API.
 */

// Core engine
export { PlotEngine, WEBGL_THRESHOLD } from './engine.js';

// Pure functions (used by displayStacked for shared-axis sync)
export { subplotToLayoutKey, layoutKeyToAnchor } from './axes.js';

// Connection overlay
export { ConnectionOverlay } from './connectionOverlay.js';

// Types
export type {
  TraceOptions,
  SubplotConfig,
  AxisConfig,
  TwinYConfig,
  TwinXConfig,
  VerticalLineStyle,
  Connection,
  PixelPoint,
  DataPoint,
  SubplotBounds,
} from './types.js';
