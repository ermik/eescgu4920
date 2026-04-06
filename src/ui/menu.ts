/**
 * Horizontal menu bar with dropdown panels and global keyboard shortcuts.
 *
 * Batch F changes:
 * - Fixed single-key shortcuts (Q) to fire when no input is focused
 * - Ctrl+C/V/X deferred to browser when editing text or text is selected
 * - Ctrl+key shortcuts (Ctrl+S, Ctrl+N) fire even when editing (except C/V/X)
 * - Modal guard blocks all shortcuts when .as-modal-backdrop is present
 */

export interface MenuAction {
  label: string;
  shortcut?: string;
  action: () => void;
  enabled?: () => boolean;
  separator?: boolean;
}

export class MenuBar {
  private container: HTMLElement;
  private menus: { trigger: HTMLElement; dropdown: HTMLElement; items: MenuAction[] }[] = [];
  private activeMenuIdx: number | null = null;
  private shortcuts = new Map<string, MenuAction>();
  private boundOnKeydown: (e: KeyboardEvent) => void;
  private boundOnClickOutside: (e: MouseEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.classList.add('as-menubar');

    this.boundOnKeydown = (e) => this.handleKeydown(e);
    this.boundOnClickOutside = (e) => this.handleClickOutside(e);

    window.addEventListener('keydown', this.boundOnKeydown);
    document.addEventListener('click', this.boundOnClickOutside);
  }

  addMenu(label: string, items: MenuAction[]): void {
    const menuDiv = document.createElement('div');
    menuDiv.className = 'as-menu';

    const trigger = document.createElement('button');
    trigger.className = 'as-menu-trigger';
    trigger.textContent = label;
    menuDiv.appendChild(trigger);

    const dropdown = document.createElement('ul');
    dropdown.className = 'as-menu-dropdown';
    dropdown.style.display = 'none';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('li');
        sep.className = 'as-menu-separator';
        dropdown.appendChild(sep);
        continue;
      }

      const li = document.createElement('li');
      li.className = 'as-menu-item';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'as-menu-label';
      labelSpan.textContent = item.label;
      li.appendChild(labelSpan);

      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'as-menu-shortcut';
        shortcutSpan.textContent = item.shortcut;
        li.appendChild(shortcutSpan);
      }

      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (li.classList.contains('as-menu-item-disabled')) return;
        this.closeAll();
        item.action();
      });

      dropdown.appendChild(li);

      // Register shortcut
      if (item.shortcut) {
        this.shortcuts.set(this.normalizeShortcut(item.shortcut), item);
      }
    }

    menuDiv.appendChild(dropdown);
    this.container.appendChild(menuDiv);

    const menuIdx = this.menus.length;
    this.menus.push({ trigger, dropdown, items });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.activeMenuIdx === menuIdx) {
        this.closeAll();
      } else {
        this.openMenu(menuIdx);
      }
    });

    trigger.addEventListener('mouseenter', () => {
      if (this.activeMenuIdx !== null && this.activeMenuIdx !== menuIdx) {
        this.openMenu(menuIdx);
      }
    });
  }

  private openMenu(idx: number): void {
    this.closeAll();
    const menu = this.menus[idx];
    menu.dropdown.style.display = '';
    menu.trigger.classList.add('as-menu-trigger-active');
    this.activeMenuIdx = idx;

    // Update enabled/disabled state
    const lis = menu.dropdown.querySelectorAll('.as-menu-item');
    let liIdx = 0;
    for (const item of menu.items) {
      if (item.separator) continue;
      const li = lis[liIdx++];
      if (!li) continue;
      if (item.enabled) {
        li.classList.toggle('as-menu-item-disabled', !item.enabled());
      } else {
        li.classList.remove('as-menu-item-disabled');
      }
    }
  }

  private closeAll(): void {
    for (const menu of this.menus) {
      menu.dropdown.style.display = 'none';
      menu.trigger.classList.remove('as-menu-trigger-active');
    }
    this.activeMenuIdx = null;
  }

  private handleClickOutside(_e: MouseEvent): void {
    if (this.activeMenuIdx !== null) {
      this.closeAll();
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Close menu on Escape
    if (e.key === 'Escape' && this.activeMenuIdx !== null) {
      this.closeAll();
      return;
    }

    // Block all shortcuts when a modal is open
    if (document.querySelector('.as-modal-backdrop')) {
      return;
    }

    // Determine if active element is an editable text field
    const active = document.activeElement;
    const isEditable = !!(active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      (active as HTMLElement).isContentEditable
    ));

    const key = this.keyEventToString(e);
    if (!key) return;

    const match = this.shortcuts.get(key);
    if (!match) return;

    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

    if (isEditable) {
      // In editable fields: single-key shortcuts (Q) never fire
      if (!hasModifier) return;
      // Ctrl+C/V/X deferred to text editing in editable fields
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) return;
      // Other Ctrl+key shortcuts (Ctrl+S, Ctrl+N, etc.) still fire
    }

    // When NOT editing: Ctrl+C should defer to browser copy if text is selected
    if (!isEditable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const sel = document.getSelection();
      if (sel && sel.toString().length > 0) return;
    }

    e.preventDefault();
    if (match.enabled && !match.enabled()) return;
    match.action();
  }

  private normalizeShortcut(shortcut: string): string {
    // Normalise "Ctrl+Shift+S" -> "ctrl+shift+s"
    return shortcut.toLowerCase().replace(/\s/g, '');
  }

  private keyEventToString(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');

    let key = e.key.toLowerCase();
    // Normalise special keys
    if (key === ' ') key = 'space';

    // Don't include modifier keys as the main key
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';

    parts.push(key);
    return parts.join('+');
  }
}
