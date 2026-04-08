import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { TreeWidget } from './tree';
import {
  mockWorksheet,
  mockSeriesItem,
  mockFilterItem,
  mockSampleItem,
  resetFixtureIds,
} from '../fixtures';

describe('TreeWidget', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    resetFixtureIds();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    // Clean up context menu and tooltip appended to body
    document.querySelectorAll('.as-context-menu, .as-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('input[type="color"]').forEach((el) => el.remove());
  });

  function makeTree() {
    return new TreeWidget(container);
  }

  function wsWithItems() {
    const s1 = mockSeriesItem({ name: 'Series A' });
    const f1 = mockFilterItem({ name: 'Filter 1' });
    const s2 = mockSampleItem({ name: 'Sample X' });
    const ws = mockWorksheet({ name: 'TestWs', items: [s1, f1, s2] });
    return { ws, s1, f1, s2 };
  }

  it('creates div.as-tree in the container', () => {
    makeTree();
    expect(container.querySelector('.as-tree')).toBeTruthy();
  });

  it('addWorksheet renders a worksheet div with header', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const wsEl = container.querySelector('.as-tree-ws')!;
    expect(wsEl).toBeTruthy();
    expect(wsEl.querySelector('.as-tree-ws-header')).toBeTruthy();
  });

  it('header shows worksheet name', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const nameEl = container.querySelector('.as-tree-ws-name')!;
    expect(nameEl.textContent).toBe('TestWs');
  });

  it('header has expand/collapse chevron', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const toggle = container.querySelector('.as-tree-ws-toggle')!;
    expect(toggle).toBeTruthy();
    expect(toggle.innerHTML).toContain('svg');
  });

  it('renders items with icons', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const items = container.querySelectorAll('.as-tree-item');
    expect(items.length).toBe(3);
    // Each item should have an icon
    for (const item of items) {
      expect(item.querySelector('.as-tree-item-icon')).toBeTruthy();
    }
  });

  it('series items show name, xLabel, yLabel columns', () => {
    const tree = makeTree();
    const s = mockSeriesItem({ name: 'My Series', xLabel: 'Depth', yLabel: 'δ18O' });
    const ws = mockWorksheet({ items: [s] });
    tree.addWorksheet(ws);
    const item = container.querySelector('.as-tree-item')!;
    expect(item.textContent).toContain('My Series');
    expect(item.textContent).toContain('Depth');
    expect(item.textContent).toContain('δ18O');
  });

  it('items have draggable attribute', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const items = container.querySelectorAll('.as-tree-item');
    for (const item of items) {
      expect((item as HTMLElement).draggable).toBe(true);
    }
  });

  it('click header toggles expand/collapse', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const header = container.querySelector('.as-tree-ws-header') as HTMLElement;
    const itemsDiv = container.querySelector('.as-tree-ws-items') as HTMLElement;

    // Initially expanded
    expect(itemsDiv.style.display).not.toBe('none');

    header.click();
    expect(itemsDiv.style.display).toBe('none');

    header.click();
    expect(itemsDiv.style.display).not.toBe('none');
  });

  it('markModified appends asterisk to name', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    tree.markModified(ws.id);
    const nameEl = container.querySelector('.as-tree-ws-name')!;
    expect(nameEl.textContent).toContain('*');
  });

  it('click item adds selection class', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const itemEl = container.querySelector('.as-tree-item') as HTMLElement;
    itemEl.click();
    expect(itemEl.classList.contains('as-tree-item-selected')).toBe(true);
  });

  it('getSelectedItems returns selected item IDs', () => {
    const tree = makeTree();
    const { ws, s1 } = wsWithItems();
    tree.addWorksheet(ws);
    const itemEl = container.querySelector('.as-tree-item') as HTMLElement;
    itemEl.click();
    const selected = tree.getSelectedItems();
    expect(selected.length).toBe(1);
    expect(selected[0].item.id).toBe(s1.id);
  });

  it('snapshot of worksheet with mixed items', () => {
    const tree = makeTree();
    const { ws } = wsWithItems();
    tree.addWorksheet(ws);
    const wsEl = container.querySelector('.as-tree-ws')!;
    expect(wsEl.innerHTML).toMatchSnapshot();
  });
});
