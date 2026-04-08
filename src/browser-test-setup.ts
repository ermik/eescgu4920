/**
 * Browser test setup — runs before each browser test file.
 * Provides ResizeObserver polyfill needed by PlotEngine.
 */

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
}
