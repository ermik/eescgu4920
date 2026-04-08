import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStatusBar } from './status';

describe('createStatusBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  it('renders a div.as-statusbar into the container', () => {
    const { el } = createStatusBar(container);
    expect(el.className).toBe('as-statusbar');
    expect(container.contains(el)).toBe(true);
  });

  it('showMessage sets text content', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('hello');
    expect(el.textContent).toBe('hello');
  });

  it('clears message after default timeout', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('hello');
    expect(el.textContent).toBe('hello');
    vi.advanceTimersByTime(5000);
    expect(el.textContent).toBe('');
  });

  it('replaces previous message', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('a');
    showMessage('b');
    expect(el.textContent).toBe('b');
  });

  it('clears only the latest timeout', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('a', 1000);
    showMessage('b', 3000);
    vi.advanceTimersByTime(1500);
    // 'a' timeout would have fired but was cleared; 'b' still showing
    expect(el.textContent).toBe('b');
    vi.advanceTimersByTime(2000);
    expect(el.textContent).toBe('');
  });

  it('persistent message when duration <= 0', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('sticky', 0);
    vi.advanceTimersByTime(60000);
    expect(el.textContent).toBe('sticky');
  });

  it('snapshot after showMessage', () => {
    const { el, showMessage } = createStatusBar(container);
    showMessage('Test message');
    expect(el.outerHTML).toMatchSnapshot();
  });
});
