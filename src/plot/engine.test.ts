/**
 * Unit tests for engine.ts — PlotEngine class.
 *
 * Plotly.js requires a real browser canvas, so the module is mocked.
 * Tests verify trace management, axis configuration, shape management,
 * batch rendering, WebGL threshold, and the public API contract.
 */

import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';

// Mock Plotly before importing engine.
// newPlot must attach an .on() method to the div, because PlotEngine's
// constructor calls plotDiv.on('plotly_relayout', ...) right after newPlot.
vi.mock('plotly.js-dist-min', () => ({
  newPlot: (div: HTMLDivElement) => {
    if (!(div as unknown as Record<string, unknown>).on) {
      const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
      (div as unknown as Record<string, unknown>).on = (
        event: string,
        fn: (...args: unknown[]) => void,
      ) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(fn);
      };
      (div as unknown as Record<string, unknown>).removeListener = (
        event: string,
        fn: (...args: unknown[]) => void,
      ) => {
        const fns = listeners.get(event);
        if (fns) {
          const idx = fns.indexOf(fn);
          if (idx >= 0) fns.splice(idx, 1);
        }
      };
    }
    return Promise.resolve();
  },
  react: () => Promise.resolve(),
  relayout: () => Promise.resolve(),
  purge: () => {},
  toImage: () => Promise.resolve(''),
}));

// jsdom may not have ResizeObserver
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  }
});

import { PlotEngine, WEBGL_THRESHOLD, subplotToLayoutKey } from './engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEngine(rows = 1): { engine: PlotEngine; container: HTMLElement } {
  const container = document.createElement('div');
  const engine = new PlotEngine(container, rows > 1 ? { rows } : undefined);
  return { engine, container };
}

// ===========================================================================
// WEBGL_THRESHOLD
// ===========================================================================

describe('WEBGL_THRESHOLD', () => {
  test('threshold is 5000', () => {
    expect(WEBGL_THRESHOLD).toBe(5000);
  });
});

// ===========================================================================
// Re-exports
// ===========================================================================

describe('re-exports from axes.ts', () => {
  test('subplotToLayoutKey is re-exported', () => {
    expect(typeof subplotToLayoutKey).toBe('function');
    expect(subplotToLayoutKey(0, 'x')).toBe('xaxis');
  });
});

// ===========================================================================
// PlotEngine constructor
// ===========================================================================

describe('PlotEngine constructor', () => {
  test('creates a div inside the container', () => {
    const { engine, container } = createEngine();
    expect(container.contains(engine.plotDiv)).toBe(true);
    expect(engine.plotDiv.style.width).toBe('100%');
    expect(engine.plotDiv.style.height).toBe('100%');
    engine.destroy();
  });

  test('plotDiv is a div element', () => {
    const { engine } = createEngine();
    expect(engine.plotDiv.tagName).toBe('DIV');
    engine.destroy();
  });
});

// ===========================================================================
// Trace management
// ===========================================================================

describe('Trace management', () => {
  test('addTrace returns incrementing IDs', () => {
    const { engine } = createEngine();
    const id1 = engine.addTrace({ x: [1, 2], y: [3, 4] });
    const id2 = engine.addTrace({ x: [5, 6], y: [7, 8] });
    expect(id2).toBe(id1 + 1);
    engine.destroy();
  });

  test('updateTrace does not throw for valid ID', () => {
    const { engine } = createEngine();
    const id = engine.addTrace({ x: [1], y: [2] });
    expect(() => engine.updateTrace(id, { y: [10] })).not.toThrow();
    engine.destroy();
  });

  test('updateTrace is no-op for invalid ID', () => {
    const { engine } = createEngine();
    expect(() => engine.updateTrace(999, { y: [10] })).not.toThrow();
    engine.destroy();
  });

  test('removeTrace does not throw', () => {
    const { engine } = createEngine();
    const id = engine.addTrace({ x: [1], y: [2] });
    expect(() => engine.removeTrace(id)).not.toThrow();
    engine.destroy();
  });

  test('clear resets everything', () => {
    const { engine } = createEngine();
    engine.addTrace({ x: [1], y: [2] });
    engine.addVerticalLines([5], 0);
    expect(() => engine.clear()).not.toThrow();
    engine.destroy();
  });
});

// ===========================================================================
// Batch updates
// ===========================================================================

describe('Batch updates', () => {
  let reactSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const Plotly = await import('plotly.js-dist-min');
    reactSpy = vi.fn(() => Promise.resolve());
    (Plotly as Record<string, unknown>).react = reactSpy;
  });

  test('beginUpdate/endUpdate defers rendering', () => {
    const { engine } = createEngine();
    const callsBefore = reactSpy.mock.calls.length;
    engine.beginUpdate();
    engine.addTrace({ x: [1], y: [2] });
    engine.addTrace({ x: [3], y: [4] });
    // No render during batch
    expect(reactSpy.mock.calls.length).toBe(callsBefore);
    engine.endUpdate();
    // One render after batch
    expect(reactSpy.mock.calls.length).toBe(callsBefore + 1);
    engine.destroy();
  });

  test('nested batches only render on outermost endUpdate', () => {
    const { engine } = createEngine();
    const callsBefore = reactSpy.mock.calls.length;
    engine.beginUpdate();
    engine.beginUpdate();
    engine.addTrace({ x: [1], y: [2] });
    engine.endUpdate(); // inner — no render
    expect(reactSpy.mock.calls.length).toBe(callsBefore);
    engine.endUpdate(); // outer — render
    expect(reactSpy.mock.calls.length).toBe(callsBefore + 1);
    engine.destroy();
  });
});

// ===========================================================================
// Axis configuration
// ===========================================================================

describe('Axis configuration', () => {
  test('configureAxis does not throw', () => {
    const { engine } = createEngine();
    expect(() => engine.configureAxis('x', 0, { title: 'Time' })).not.toThrow();
    expect(() => engine.configureAxis('y', 0, { title: 'Value' })).not.toThrow();
    engine.destroy();
  });

  test('configureAxis on invalid subplot is no-op', () => {
    const { engine } = createEngine();
    expect(() => engine.configureAxis('x', 99, { title: 'Nope' })).not.toThrow();
    engine.destroy();
  });

  test('addTwinY returns axis index >= 1', () => {
    const { engine } = createEngine();
    const idx = engine.addTwinY(0, { title: 'Twin' });
    expect(idx).toBeGreaterThanOrEqual(1);
    engine.destroy();
  });

  test('addTwinX returns axis index >= 1', () => {
    const { engine } = createEngine();
    const idx = engine.addTwinX(0, { title: 'Twin X' });
    expect(idx).toBeGreaterThanOrEqual(1);
    engine.destroy();
  });

  test('addTwinY on invalid subplot returns 0', () => {
    const { engine } = createEngine();
    const idx = engine.addTwinY(99, { title: 'Nope' });
    expect(idx).toBe(0);
    engine.destroy();
  });

  test('addSecondaryXAxis does not throw', () => {
    const { engine } = createEngine();
    expect(() => engine.addSecondaryXAxis(0, (x) => x * 2, 'Depth')).not.toThrow();
    engine.destroy();
  });
});

// ===========================================================================
// Shape management
// ===========================================================================

describe('Shape management', () => {
  test('addVerticalLines returns shape IDs', () => {
    const { engine } = createEngine();
    const ids = engine.addVerticalLines([10, 20, 30], 0);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id).toMatch(/^shape-/);
    }
    engine.destroy();
  });

  test('removeShapes does not throw', () => {
    const { engine } = createEngine();
    const ids = engine.addVerticalLines([10], 0);
    expect(() => engine.removeShapes(ids)).not.toThrow();
    engine.destroy();
  });

  test('addVerticalLines on invalid subplot returns empty', () => {
    const { engine } = createEngine();
    const ids = engine.addVerticalLines([10], 99);
    expect(ids).toHaveLength(0);
    engine.destroy();
  });
});

// ===========================================================================
// Coordinate queries (delegate to coords module)
// ===========================================================================

describe('Coordinate queries', () => {
  test('getAxisRange returns [0, 1] before data is loaded', () => {
    const { engine } = createEngine();
    // With mocked Plotly, no _fullLayout is created
    const range = engine.getAxisRange('x', 0);
    expect(range).toEqual([0, 1]);
    engine.destroy();
  });

  test('dataToPixel returns {0, 0} with mocked Plotly', () => {
    const { engine } = createEngine();
    const pt = engine.dataToPixel(0, 10, 20);
    expect(pt).toEqual({ px: 0, py: 0 });
    engine.destroy();
  });

  test('pixelToData returns {0, 0} with mocked Plotly', () => {
    const { engine } = createEngine();
    const pt = engine.pixelToData(0, 100, 200);
    expect(pt).toEqual({ x: 0, y: 0 });
    engine.destroy();
  });

  test('getSubplotBounds returns zeros with mocked Plotly', () => {
    const { engine } = createEngine();
    const bounds = engine.getSubplotBounds(0);
    expect(bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    engine.destroy();
  });
});

// ===========================================================================
// Events and relayout
// ===========================================================================

describe('Events and relayout', () => {
  test('on does not throw', () => {
    const { engine } = createEngine();
    expect(() => engine.on('plotly_click', () => {})).not.toThrow();
    engine.destroy();
  });

  test('relayout returns a promise', async () => {
    const { engine } = createEngine();
    const result = engine.relayout({ 'xaxis.range[0]': 0 });
    expect(result).toBeInstanceOf(Promise);
    await result;
    engine.destroy();
  });

  test('relayout after destroy resolves immediately', async () => {
    const { engine } = createEngine();
    engine.destroy();
    await engine.relayout({ 'xaxis.range[0]': 0 });
  });
});

// ===========================================================================
// Lifecycle
// ===========================================================================

describe('Lifecycle', () => {
  test('destroy removes plotDiv from container', () => {
    const { engine, container } = createEngine();
    expect(container.contains(engine.plotDiv)).toBe(true);
    engine.destroy();
    expect(container.contains(engine.plotDiv)).toBe(false);
  });

  test('double destroy is safe', () => {
    const { engine } = createEngine();
    engine.destroy();
    expect(() => engine.destroy()).not.toThrow();
  });

  test('operations after destroy are no-ops', () => {
    const { engine } = createEngine();
    engine.destroy();
    expect(() => engine.addTrace({ x: [1], y: [2] })).not.toThrow();
    expect(() => engine.updateTrace(0, { y: [3] })).not.toThrow();
    expect(() => engine.removeTrace(0)).not.toThrow();
    expect(() => engine.clear()).not.toThrow();
  });

  test('refresh does not throw', () => {
    const { engine } = createEngine();
    expect(() => engine.refresh()).not.toThrow();
    engine.destroy();
  });
});

// ===========================================================================
// Multi-subplot
// ===========================================================================

describe('Multi-subplot', () => {
  test('constructor with multiple rows', () => {
    const { engine } = createEngine(3);
    expect(engine.plotDiv).toBeTruthy();
    engine.destroy();
  });

  test('addTrace to different subplots', () => {
    const { engine } = createEngine(3);
    const id0 = engine.addTrace({ x: [1], y: [2], subplot: 0 });
    const id1 = engine.addTrace({ x: [3], y: [4], subplot: 1 });
    const id2 = engine.addTrace({ x: [5], y: [6], subplot: 2 });
    expect(id0).not.toBe(id1);
    expect(id1).not.toBe(id2);
    engine.destroy();
  });

  test('configureAxis on different subplots', () => {
    const { engine } = createEngine(3);
    expect(() => {
      engine.configureAxis('x', 0, { title: 'X0' });
      engine.configureAxis('x', 1, { title: 'X1' });
      engine.configureAxis('x', 2, { title: 'X2' });
    }).not.toThrow();
    engine.destroy();
  });
});

// ===========================================================================
// WebGL auto-detection (via buildData internals)
// ===========================================================================

describe('WebGL auto-detection', () => {
  test('small dataset uses scatter, large uses scattergl', async () => {
    // Access buildData indirectly by inspecting what react() receives
    const Plotly = await import('plotly.js-dist-min');
    const calls: unknown[][] = [];
    (Plotly as Record<string, unknown>).react = (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve();
    };

    const { engine } = createEngine();

    // Small dataset
    engine.addTrace({ x: new Array(100).fill(0), y: new Array(100).fill(0) });
    const smallData = calls[calls.length - 1][1] as Record<string, unknown>[];
    expect(smallData[0].type).toBe('scatter');

    // Large dataset
    engine.addTrace({ x: new Array(6000).fill(0), y: new Array(6000).fill(0) });
    const largeData = calls[calls.length - 1][1] as Record<string, unknown>[];
    // Last trace (index 1) should be scattergl
    expect(largeData[1].type).toBe('scattergl');

    // Explicit webgl=false override
    engine.addTrace({ x: new Array(6000).fill(0), y: new Array(6000).fill(0), webgl: false });
    const overrideData = calls[calls.length - 1][1] as Record<string, unknown>[];
    expect(overrideData[2].type).toBe('scatter');

    engine.destroy();
  });
});

// ===========================================================================
// Clear and mode switching
// ===========================================================================

describe('Clear and mode switching', () => {
  test('clear then add traces works without stale state', () => {
    const { engine } = createEngine();
    engine.addTrace({ x: [1], y: [2] });
    engine.addTwinY(0, { title: 'Twin' });
    engine.addVerticalLines([5], 0);

    engine.clear();

    // After clear, should be able to set up fresh
    const id = engine.addTrace({ x: [10], y: [20] });
    expect(id).toBeGreaterThanOrEqual(0);
    engine.configureAxis('x', 0, { title: 'Fresh X' });
    engine.destroy();
  });

  test('multiple clear/rebuild cycles', () => {
    const { engine } = createEngine();
    for (let cycle = 0; cycle < 3; cycle++) {
      engine.clear();
      engine.beginUpdate();
      engine.addTrace({ x: [cycle], y: [cycle * 10] });
      engine.configureAxis('x', 0, { title: `Cycle ${cycle}` });
      engine.endUpdate();
    }
    engine.destroy();
  });
});

// ===========================================================================
// Custom scroll zoom
// ===========================================================================

describe('Custom scroll zoom', () => {
  test('wheel listener is attached to plotDiv', () => {
    const { engine } = createEngine();
    // Dispatching a wheel event should not throw (handler is attached)
    expect(() => {
      engine.plotDiv.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    }).not.toThrow();
    engine.destroy();
  });

  test('wheel listener is removed on destroy', () => {
    const { engine } = createEngine();
    const spy = vi.spyOn(engine.plotDiv, 'removeEventListener');
    engine.destroy();
    expect(spy).toHaveBeenCalledWith('wheel', expect.any(Function));
  });

  test('Plotly config has scrollZoom disabled', async () => {
    // Verify the config passed to newPlot has scrollZoom: false
    const Plotly = await import('plotly.js-dist-min');
    let capturedConfig: Record<string, unknown> | undefined;
    const origNewPlot = Plotly.newPlot as unknown as (...args: unknown[]) => Promise<void>;
    (Plotly as Record<string, unknown>).newPlot = (
      div: HTMLDivElement,
      _data: unknown,
      _layout: unknown,
      config: Record<string, unknown>,
    ) => {
      capturedConfig = config;
      // Attach .on() so constructor doesn't fail
      if (!(div as unknown as Record<string, unknown>).on) {
        (div as unknown as Record<string, unknown>).on = () => {};
        (div as unknown as Record<string, unknown>).removeListener = () => {};
      }
      return Promise.resolve();
    };
    const { engine } = createEngine();
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig!.scrollZoom).toBe(false);
    engine.destroy();
    // Restore
    (Plotly as Record<string, unknown>).newPlot = origNewPlot;
  });
});
