import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { MenuBar } from './menu';

describe('MenuBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('adds as-menubar class to container', () => {
    new MenuBar(container);
    expect(container.classList.contains('as-menubar')).toBe(true);
  });

  it('addMenu creates trigger button with label', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'New', action: () => {} },
    ]);
    const trigger = container.querySelector('.as-menu-trigger')!;
    expect(trigger.textContent).toBe('File');
  });

  it('dropdown contains menu items with labels', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'New', shortcut: 'Ctrl+N', action: () => {} },
      { label: 'Open', shortcut: 'Ctrl+O', action: () => {} },
    ]);
    const items = container.querySelectorAll('.as-menu-item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.as-menu-label')!.textContent).toBe('New');
    expect(items[0].querySelector('.as-menu-shortcut')!.textContent).toBe('Ctrl+N');
    expect(items[1].querySelector('.as-menu-label')!.textContent).toBe('Open');
  });

  it('separator creates as-menu-separator element', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'New', action: () => {}, separator: false },
      { label: '', action: () => {}, separator: true },
      { label: 'Quit', action: () => {} },
    ]);
    const seps = container.querySelectorAll('.as-menu-separator');
    expect(seps.length).toBe(1);
  });

  it('click trigger opens dropdown', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [{ label: 'New', action: () => {} }]);
    const trigger = container.querySelector('.as-menu-trigger') as HTMLElement;
    const dropdown = container.querySelector('.as-menu-dropdown') as HTMLElement;

    expect(dropdown.style.display).toBe('none');
    trigger.click();
    expect(dropdown.style.display).toBe('');
    expect(trigger.classList.contains('as-menu-trigger-active')).toBe(true);
  });

  it('click menu item fires action and closes', () => {
    const action = vi.fn();
    const bar = new MenuBar(container);
    bar.addMenu('File', [{ label: 'New', action }]);

    const trigger = container.querySelector('.as-menu-trigger') as HTMLElement;
    trigger.click();
    const item = container.querySelector('.as-menu-item') as HTMLElement;
    item.click();

    expect(action).toHaveBeenCalledOnce();
    const dropdown = container.querySelector('.as-menu-dropdown') as HTMLElement;
    expect(dropdown.style.display).toBe('none');
  });

  it('disabled items have as-menu-item-disabled class', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'Save', action: () => {}, enabled: () => false },
    ]);
    const trigger = container.querySelector('.as-menu-trigger') as HTMLElement;
    trigger.click(); // triggers enabled check
    const item = container.querySelector('.as-menu-item')!;
    expect(item.classList.contains('as-menu-item-disabled')).toBe(true);
  });

  it('disabled item click does not fire action', () => {
    const action = vi.fn();
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'Save', action, enabled: () => false },
    ]);
    const trigger = container.querySelector('.as-menu-trigger') as HTMLElement;
    trigger.click();
    const item = container.querySelector('.as-menu-item') as HTMLElement;
    item.click();
    expect(action).not.toHaveBeenCalled();
  });

  it('snapshot of dropdown', () => {
    const bar = new MenuBar(container);
    bar.addMenu('File', [
      { label: 'New Worksheet', shortcut: 'Ctrl+N', action: () => {} },
      { label: 'Open', shortcut: 'Ctrl+O', action: () => {} },
      { label: '', action: () => {}, separator: true },
      { label: 'Exit', shortcut: 'Q', action: () => {} },
    ]);
    const dropdown = container.querySelector('.as-menu-dropdown')!;
    expect(dropdown.innerHTML).toMatchSnapshot();
  });
});
