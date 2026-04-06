/**
 * ConnectionOverlay — SVG lines connecting x-positions between two subplots.
 *
 * Used by the interpolation window to visualise tie-point connections.
 * An absolutely-positioned SVG sits on top of the PlotEngine's div.
 * Individual <line> elements have pointer-events: stroke so hover and
 * click work while the rest of the overlay passes events through to Plotly.
 */

import type { PlotEngine } from './engine.js';
import type { Connection } from './types.js';

export type { Connection } from './types.js';

// ---------------------------------------------------------------------------
// ConnectionOverlay
// ---------------------------------------------------------------------------

export class ConnectionOverlay {
  private plotEngine: PlotEngine;
  private refSubplot: number;
  private distSubplot: number;
  private svg: SVGSVGElement;
  private connections = new Map<string, Connection>();
  private nextId = 0;
  private hoverCallback: ((connectionId: string | null) => void) | null = null;
  private clickCallback: ((connectionId: string) => void) | null = null;
  private resizeObserver: ResizeObserver;
  private rafId: number | null = null;
  private destroyed = false;

  // Bound listener references for cleanup
  private relayoutListener: () => void;
  private afterplotListener: () => void;

  /**
   * @param plotEngine  The PlotEngine instance to overlay on.
   * @param refSubplot  Index of the reference subplot (top, typically 0).
   * @param distSubplot Index of the distorted subplot (bottom, typically 1).
   */
  constructor(
    plotEngine: PlotEngine,
    refSubplot: number,
    distSubplot: number,
  ) {
    this.plotEngine = plotEngine;
    this.refSubplot = refSubplot;
    this.distSubplot = distSubplot;

    // Ensure the parent is a positioned container
    const wrapper = this.plotEngine.plotDiv.parentElement!;
    wrapper.style.position = 'relative';

    // Create SVG overlay
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.position = 'absolute';
    this.svg.style.top = '0';
    this.svg.style.left = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.svg.style.zIndex = '10';
    this.svg.style.overflow = 'visible';
    wrapper.appendChild(this.svg);

    // Sync with Plotly — store bound references for cleanup
    this.relayoutListener = () => this.scheduleRedraw();
    this.afterplotListener = () => this.scheduleRedraw();
    this.plotEngine.on('plotly_relayout', this.relayoutListener);
    this.plotEngine.on('plotly_afterplot', this.afterplotListener);

    this.resizeObserver = new ResizeObserver(() => this.scheduleRedraw());
    this.resizeObserver.observe(this.plotEngine.plotDiv);
  }

  /** Add a connection line between two subplots. */
  addConnection(x1: number, x2: number): Connection {
    const id = `conn-${this.nextId++}`;
    const conn: Connection = { id, x1, x2 };
    this.connections.set(id, conn);

    const line = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'line',
    );
    line.setAttribute('data-id', id);
    line.setAttribute('stroke', '#3366cc');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('opacity', '0.5');
    line.style.pointerEvents = 'stroke';
    line.style.cursor = 'pointer';

    line.addEventListener('mouseenter', () => {
      this.hoverCallback?.(id);
    });
    line.addEventListener('mouseleave', () => {
      this.hoverCallback?.(null);
    });
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clickCallback?.(id);
    });

    this.svg.appendChild(line);
    this.redraw();
    return conn;
  }

  /** Remove a connection by ID. */
  removeConnection(id: string): void {
    this.connections.delete(id);
    const line = this.svg.querySelector(`[data-id="${id}"]`);
    line?.remove();
  }

  /** Remove all connections. */
  clear(): void {
    this.connections.clear();
    while (this.svg.firstChild) {
      this.svg.removeChild(this.svg.firstChild);
    }
  }

  /** Get all current connections. */
  getConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Redraw all connection lines based on current axis positions.
   * Must be called after zoom/pan/resize.
   */
  redraw(): void {
    const refBounds = this.plotEngine.getSubplotBounds(this.refSubplot);
    const distBounds = this.plotEngine.getSubplotBounds(this.distSubplot);

    for (const conn of this.connections.values()) {
      const line = this.svg.querySelector(
        `[data-id="${conn.id}"]`,
      ) as SVGLineElement | null;
      if (!line) continue;

      if (refBounds.width === 0 || distBounds.width === 0) continue;

      // x pixel positions from dataToPixel (y value doesn't matter, we
      // compute y from subplot bounds)
      const topPt = this.plotEngine.dataToPixel(this.refSubplot, conn.x1, 0);
      const bottomPt = this.plotEngine.dataToPixel(
        this.distSubplot,
        conn.x2,
        0,
      );

      // y positions: bottom edge of ref subplot -> top edge of dist subplot
      const y1 = refBounds.top + refBounds.height;
      const y2 = distBounds.top;

      line.setAttribute('x1', String(topPt.px));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(bottomPt.px));
      line.setAttribute('y2', String(y2));
    }
  }

  /**
   * Set hover callback — called with connection ID when mouse enters a line,
   * null when mouse leaves.
   */
  onHover(callback: (connectionId: string | null) => void): void {
    this.hoverCallback = callback;
  }

  /** Set click callback — called with connection ID on click. */
  onClick(callback: (connectionId: string) => void): void {
    this.clickCallback = callback;
  }

  /** Highlight a specific connection (e.g., red on hover, blue default). */
  setHighlight(connectionId: string, highlighted: boolean): void {
    const line = this.svg.querySelector(
      `[data-id="${connectionId}"]`,
    ) as SVGLineElement | null;
    if (!line) return;
    if (highlighted) {
      line.setAttribute('stroke', 'red');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('opacity', '0.8');
    } else {
      line.setAttribute('stroke', '#3366cc');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', '0.5');
    }
  }

  /** Clean up: remove SVG element, event listeners, and ResizeObserver. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.resizeObserver.disconnect();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    // Remove Plotly event listeners
    const plotlyDiv = this.plotEngine.plotDiv as unknown as {
      removeListener?: (event: string, fn: () => void) => void;
    };
    plotlyDiv.removeListener?.('plotly_relayout', this.relayoutListener);
    plotlyDiv.removeListener?.('plotly_afterplot', this.afterplotListener);

    this.svg.remove();
    this.connections.clear();
  }

  // ----- Private ---------------------------------------------------------

  private scheduleRedraw(): void {
    if (this.destroyed || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.destroyed) {
        this.redraw();
      }
    });
  }
}
