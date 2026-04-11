/**
 * F5 — About dialog modal.
 *
 * Batch F changes:
 * - Created About dialog matching the spirit of the original AnalySeries
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';

export function showAboutDialog(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'as-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'as-modal as-about-modal';
  modal.style.maxWidth = '500px';
  modal.style.padding = '24px';
  modal.style.textAlign = 'center';

  const closeBtnRef = createRef<HTMLButtonElement>();

  /* eslint-disable no-irregular-whitespace -- Unicode nbsp in template */
  const template = html`
    <h2 style="margin:0 0 8px 0; font-size:20px;">AnalySeries</h2>
    <p style="margin:0 0 4px 0; font-size:13px; color:#666;">Version 0.1.0</p>
    <p style="margin:12px 0; font-size:14px;">
      A browser-based paleoclimate time-series analysis tool
    </p>
    <p style="margin:12px 0; font-size:13px;">
      Based on <b>AnalySeries</b> by
      D.\u00a0Paillard, L.\u00a0Labeyrie &amp; P.\u00a0Yiou (1996)
    </p>
    <p style="margin:8px 0; font-size:12px; color:#555;">
      Paillard D., Labeyrie L., Yiou P. (1996).
      <i>Macintosh program performs time-series analysis.</i>
      Eos Trans. AGU, 77(39), 379.
    </p>
    <p style="margin:12px 0; font-size:13px;">
      Browser edition based on
      <a href="https://github.com/PaleoClimate/PyAnalySeries"
         target="_blank" rel="noopener"
         style="color:#1f77b4;">PyAnalySeries</a>
      by B.\u00a0Beitler
    </p>
    <hr style="margin:16px 0; border:none; border-top:1px solid #ddd;">
    <p style="margin:8px 0; font-size:12px; color:#888;">
      \u00a9 2024\u20132026. Open-source scientific software.
    </p>
    <button class="as-btn" style="margin-top:12px"
      ${ref(closeBtnRef)}
      @click=${() => backdrop.remove()}>Close</button>
  `;
  /* eslint-enable no-irregular-whitespace */

  render(template, modal);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  closeBtnRef.value?.focus();
}
