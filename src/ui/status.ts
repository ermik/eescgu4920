/**
 * Status bar — displays transient messages at the bottom of the application.
 */

export function createStatusBar(container: HTMLElement): {
  el: HTMLElement;
  showMessage: (text: string, durationMs?: number) => void;
} {
  const el = document.createElement('div');
  el.className = 'as-statusbar';
  container.appendChild(el);

  let timerId: ReturnType<typeof setTimeout> | null = null;

  function showMessage(text: string, durationMs = 5000): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    el.textContent = text;
    if (durationMs > 0) {
      timerId = setTimeout(() => {
        el.textContent = '';
        timerId = null;
      }, durationMs);
    }
  }

  return { el, showMessage };
}
