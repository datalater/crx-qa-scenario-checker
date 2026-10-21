/**
 * Generic floating context menu built from an item list.
 * item: { label, onSelect, disabled?, danger? } or { separator: true }
 * Reuses the tree context menu styles.
 */
export function createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'tree-context-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.append(menu);

    function close() {
        menu.hidden = true;
        menu.replaceChildren();
    }

    function open(items, x, y) {
        menu.replaceChildren();
        items.forEach((item) => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'tree-context-separator';
                separator.setAttribute('role', 'separator');
                menu.append(separator);
                return;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tree-context-menu-item' + (item.danger ? ' danger' : '');
            button.setAttribute('role', 'menuitem');
            button.textContent = item.label;
            button.disabled = Boolean(item.disabled);
            button.addEventListener('click', () => {
                close();
                item.onSelect?.();
            });
            menu.append(button);
        });
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.hidden = false;
        const { offsetWidth, offsetHeight } = menu;
        menu.style.left = `${Math.min(Math.max(8, x), Math.max(8, window.innerWidth - offsetWidth - 8))}px`;
        menu.style.top = `${Math.min(Math.max(8, y), Math.max(8, window.innerHeight - offsetHeight - 8))}px`;
    }

    document.addEventListener('pointerdown', (event) => {
        if (!menu.hidden && !menu.contains(event.target)) close();
    }, true);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) close();
    });
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);

    return { open, close, isOpen: () => !menu.hidden };
}
