/**
 * Simple Function (arithmetic operations) window.
 * Spec: PDF §11.1 (v2.0.8).
 */

import { html, render } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import type { ManagedWindow } from '../ui/windowManager';
import type { SeriesItem } from '../types';
import { generateId, generateColor, appendHistory } from '../utils';
import { applyArith, type ArithOp } from '../math/simpleFunction';

function formatDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Created ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function numOrDefault(raw: string, fb: number): number { const v = parseFloat(raw); return Number.isFinite(v) ? v : fb; }

const UNARY_OPS: { value: ArithOp; label: string }[] = [
  { value: 'negate', label: 'Negate (-y)' },
  { value: 'abs', label: 'Absolute value |y|' },
  { value: 'log', label: 'Natural log ln(y)' },
  { value: 'exp', label: 'Exponential e^y' },
  { value: 'sqrt', label: 'Square root √y' },
  { value: 'scale', label: 'Scale (y × k)' },
  { value: 'offset', label: 'Offset (y + k)' },
];

const BINARY_OPS: { value: ArithOp; label: string }[] = [
  { value: 'add', label: 'Add (y₁ + y₂)' },
  { value: 'subtract', label: 'Subtract (y₁ − y₂)' },
  { value: 'multiply', label: 'Multiply (y₁ × y₂)' },
  { value: 'divide', label: 'Divide (y₁ / y₂)' },
];

export function createDefineSimpleFunctionWindow(
  items: SeriesItem[],
  callbacks: { onImport: (item: SeriesItem) => void },
): ManagedWindow {
  const el = document.createElement('div');
  el.className = 'as-window as-define-simple-function-window';
  const isBinary = items.length >= 2;
  const ops = isBinary ? [...BINARY_OPS, ...UNARY_OPS] : UNARY_OPS;
  const opRef = createRef<HTMLSelectElement>();
  const paramRef = createRef<HTMLInputElement>();
  let closeCallback: (() => void) | null = null;

  const template = html`
    <div style="padding:12px">
      <div style="font-size:12px;margin-bottom:8px">
        Series: ${items.map(i => i.name).join(', ')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:80px">Operation:</label>
        <select style="font-size:12px" ${ref(opRef)} @change=${updateParamVisibility}>
          ${ops.map(o => html`<option value=${o.value}>${o.label}</option>`)}
        </select>
      </div>
      <div class="param-row" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <label style="font-size:12px;min-width:80px">Parameter k:</label>
        <input type="number" .value=${'1'} step="any"
          style="width:80px;font-size:12px" ${ref(paramRef)}>
      </div>
    </div>
    <div class="as-button-bar">
      <button class="as-btn" @click=${doApply}>Apply</button>
      <button class="as-btn" @click=${() => closeCallback?.()}>Close</button>
    </div>`;
  render(template, el);

  function updateParamVisibility() {
    const row = el.querySelector('.param-row') as HTMLElement | null;
    const op = opRef.value?.value ?? '';
    if (row) row.style.display = (op === 'scale' || op === 'offset') ? '' : 'none';
  }
  updateParamVisibility();

  function doApply() {
    const op = (opRef.value?.value ?? 'negate') as ArithOp;
    const param = numOrDefault(paramRef.value?.value ?? '', 1);
    const item = items[0];
    const values2 = items.length >= 2 ? items[1].values : undefined;

    try {
      const r = applyArith(item.index, item.values, op, param, values2);
      const id = generateId();
      callbacks.onImport({
        id, type: 'Series',
        name: `${op}(${items.map(i => i.name).join(', ')})`,
        date: formatDate(), comment: '',
        history: appendHistory(item.history,
          `${op} applied to <i><b>${items.map(i => i.id).join(', ')}</b></i><BR>---> series <i><b>${id}</b></i>`),
        xLabel: item.xLabel, yLabel: item.yLabel,
        color: generateColor(),
        index: new Float64Array(r.index),
        values: new Float64Array(r.values),
      });
    } catch (err) {
      console.error('Simple function error:', err);
    }
  }

  return {
    id: 'simplefn-' + items.map(i => i.id).join('-'),
    title: `Simple Function`,
    element: el,
    onClose: () => {},
    get _closeCallback() { return closeCallback; },
    set _closeCallback(fn: (() => void) | null) { closeCallback = fn; },
  } as ManagedWindow & { _closeCallback: (() => void) | null };
}
