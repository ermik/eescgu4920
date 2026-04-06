/**
 * Unit tests for connectionOverlay.ts — SVG overlay coordinate logic.
 */

import { describe, test, expect, vi, beforeAll } from 'vitest';

// Mock Plotly before importing engine
vi.mock('plotly.js-dist-min', () => ({
  newPlot: () => Promise.resolve(),
  react: () => Promise.resolve(),
  relayout: () => Promise.resolve(),
  purge: () => {},
  toImage: () => Promise.resolve(''),
}));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  }
});

import { ConnectionOverlay } from './connectionOverlay.js';
import type { PlotEngine } from './engine.js';

// ---------------------------------------------------------------------------
// Mock PlotEngine
// ---------------------------------------------------------------------------

function createMockEngine(): PlotEngine {
  const container = document.createElement('div');
  const plotDiv = document.createElement('div');
  container.appendChild(plotDiv);

  return {
    plotDiv,
    dataToPixel: (_subplot: number, x: number, _y: number) => ({
      px: x * 5,
      py: 100,
    }),
    getSubplotBounds: (subplot: number) => {
      if (subplot === 0) {
        return { left: 50, top: 20, width: 400, height: 150 };
      }
      return { left: 50, top: 200, width: 400, height: 150 };
    },
    getAxisRange: () => [0, 100] as [number, number],
    on: () => {},
  } as unknown as PlotEngine;
}

// ===========================================================================
// SVG creation
// ===========================================================================

describe('SVG element creation', () => {
  test('SVG is created and appended to parent', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const svg = engine.plotDiv.parentElement!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.style.pointerEvents).toBe('none');
    expect(svg!.style.position).toBe('absolute');
    expect(svg!.style.zIndex).toBe('10');
    overlay.destroy();
  });

  test('parent gets position: relative', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    expect(engine.plotDiv.parentElement!.style.position).toBe('relative');
    overlay.destroy();
  });
});

// ===========================================================================
// Connection management
// ===========================================================================

describe('Connection management', () => {
  test('addConnection creates a line element', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);
    expect(conn.id).toMatch(/^conn-/);
    expect(conn.x1).toBe(20);
    expect(conn.x2).toBe(30);

    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(`[data-id="${conn.id}"]`);
    expect(line).not.toBeNull();
    overlay.destroy();
  });

  test('removeConnection removes the line element', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);
    overlay.removeConnection(conn.id);

    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    expect(svg.querySelector(`[data-id="${conn.id}"]`)).toBeNull();
    expect(overlay.getConnections()).toHaveLength(0);
    overlay.destroy();
  });

  test('clear removes all line elements', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    overlay.addConnection(10, 20);
    overlay.addConnection(30, 40);
    overlay.addConnection(50, 60);
    expect(overlay.getConnections()).toHaveLength(3);

    overlay.clear();
    expect(overlay.getConnections()).toHaveLength(0);
    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    expect(svg.childElementCount).toBe(0);
    overlay.destroy();
  });

  test('getConnections returns all connections', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    overlay.addConnection(10, 20);
    overlay.addConnection(30, 40);
    const conns = overlay.getConnections();
    expect(conns).toHaveLength(2);
    expect(conns[0].x1).toBe(10);
    expect(conns[1].x1).toBe(30);
    overlay.destroy();
  });
});

// ===========================================================================
// Redraw coordinates
// ===========================================================================

describe('Redraw coordinates', () => {
  test('redraw sets correct line coordinates from mock dataToPixel', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);

    // After redraw (called by addConnection), line positions should be:
    // x1 = dataToPixel(0, 20, 0).px = 20 * 5 = 100
    // y1 = getSubplotBounds(0).top + .height = 20 + 150 = 170
    // x2 = dataToPixel(1, 30, 0).px = 30 * 5 = 150
    // y2 = getSubplotBounds(1).top = 200
    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(
      `[data-id="${conn.id}"]`,
    ) as SVGLineElement;

    expect(line.getAttribute('x1')).toBe('100');
    expect(line.getAttribute('y1')).toBe('170');
    expect(line.getAttribute('x2')).toBe('150');
    expect(line.getAttribute('y2')).toBe('200');

    overlay.destroy();
  });

  test('redraw skips lines when subplot bounds have zero width', () => {
    const engine = createMockEngine();
    // Override getSubplotBounds to return zero-width
    (engine as unknown as Record<string, unknown>).getSubplotBounds = () => ({
      left: 0, top: 0, width: 0, height: 0,
    });
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);

    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(
      `[data-id="${conn.id}"]`,
    ) as SVGLineElement;

    // Attributes should not be set (remain null/absent)
    expect(line.getAttribute('x1')).toBeNull();
    overlay.destroy();
  });
});

// ===========================================================================
// Highlighting
// ===========================================================================

describe('Highlighting', () => {
  test('setHighlight changes line style', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);
    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(
      `[data-id="${conn.id}"]`,
    ) as SVGLineElement;

    // Default style
    expect(line.getAttribute('stroke')).toBe('#3366cc');

    // Highlight on
    overlay.setHighlight(conn.id, true);
    expect(line.getAttribute('stroke')).toBe('red');
    expect(line.getAttribute('stroke-width')).toBe('1.5');
    expect(line.getAttribute('opacity')).toBe('0.8');

    // Highlight off
    overlay.setHighlight(conn.id, false);
    expect(line.getAttribute('stroke')).toBe('#3366cc');
    expect(line.getAttribute('stroke-width')).toBe('1');
    expect(line.getAttribute('opacity')).toBe('0.5');

    overlay.destroy();
  });

  test('setHighlight on non-existent connection is no-op', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    expect(() => overlay.setHighlight('nonexistent', true)).not.toThrow();
    overlay.destroy();
  });
});

// ===========================================================================
// Event callbacks
// ===========================================================================

describe('Event callbacks', () => {
  test('hover callback fires on mouseenter/mouseleave', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);

    const hoverCalls: (string | null)[] = [];
    overlay.onHover((id) => hoverCalls.push(id));

    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(`[data-id="${conn.id}"]`)!;

    line.dispatchEvent(new MouseEvent('mouseenter'));
    line.dispatchEvent(new MouseEvent('mouseleave'));

    expect(hoverCalls).toEqual([conn.id, null]);
    overlay.destroy();
  });

  test('click callback fires on click', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    const conn = overlay.addConnection(20, 30);

    const clickCalls: string[] = [];
    overlay.onClick((id) => clickCalls.push(id));

    const svg = engine.plotDiv.parentElement!.querySelector('svg')!;
    const line = svg.querySelector(`[data-id="${conn.id}"]`)!;

    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clickCalls).toEqual([conn.id]);
    overlay.destroy();
  });
});

// ===========================================================================
// Destroy
// ===========================================================================

describe('Destroy', () => {
  test('destroy removes SVG from DOM', () => {
    const engine = createMockEngine();
    const wrapper = engine.plotDiv.parentElement!;
    const overlay = new ConnectionOverlay(engine, 0, 1);
    expect(wrapper.querySelector('svg')).not.toBeNull();
    overlay.destroy();
    expect(wrapper.querySelector('svg')).toBeNull();
  });

  test('double destroy is safe', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    overlay.destroy();
    expect(() => overlay.destroy()).not.toThrow();
  });

  test('redraw after destroy does not throw', () => {
    const engine = createMockEngine();
    const overlay = new ConnectionOverlay(engine, 0, 1);
    overlay.addConnection(20, 30);
    overlay.destroy();
    expect(() => overlay.redraw()).not.toThrow();
  });
});
