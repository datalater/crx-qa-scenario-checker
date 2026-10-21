import { formatBinding, getDisplayBindings } from './shortcut-registry.js';
import { SHORTCUTS } from '../configs/shortcuts.js';

/**
 * Command palette: one input box with two kinds of views.
 *   list   - a filterable list of items (the command catalog, the file picker, ...)
 *   prompt - free text input with a live preview line
 *
 * command: { id, label, shortcutId?, run(api) }
 * api.pick({ placeholder, getItems(query), onSelect(item), emptyText? })
 *     item: { label, description?, badge?, shortcutId? }
 * api.prompt({ placeholder, getPreview(value) -> { text, error }, onSubmit(value) })
 * A command that opens neither view is considered done and closes the palette.
 */
export function createCommandPalette({ root, backdrop, input, list, preview, commands }) {
    let view = null;
    let items = [];
    let activeIndex = 0;

    const isOpen = () => Boolean(root) && !root.classList.contains('is-hidden');

    const api = {
        pick: (config) => showList(config),
        prompt: (config) => showPrompt(config)
    };

    function commandCatalogView() {
        return {
            type: 'list',
            placeholder: '명령 검색...',
            emptyText: '일치하는 명령이 없습니다.',
            getItems: (query) => {
                const q = query.trim().toLowerCase();
                return commands.filter((command) => !q || command.label.toLowerCase().includes(q));
            },
            onSelect: (command) => command.run(api)
        };
    }

    function shortcutHint(shortcutId) {
        const entry = SHORTCUTS.find((item) => item.id === shortcutId);
        const binding = entry ? getDisplayBindings(entry)[0] : null;
        if (!binding) return null;
        const hint = document.createElement('span');
        hint.className = 'command-palette-shortcut';
        formatBinding(binding).forEach((cap) => {
            const kbd = document.createElement('kbd');
            kbd.textContent = cap;
            hint.append(kbd);
        });
        return hint;
    }

    function renderList() {
        list.replaceChildren();
        list.classList.remove('is-hidden');
        preview.classList.add('is-hidden');
        if (!items.length) {
            const empty = document.createElement('li');
            empty.className = 'command-palette-empty';
            empty.textContent = view.emptyText || '결과가 없습니다.';
            list.append(empty);
            return;
        }
        items.forEach((item, index) => {
            const row = document.createElement('li');
            row.className = 'command-palette-item' + (index === activeIndex ? ' is-active' : '');
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(index === activeIndex));

            const main = document.createElement('span');
            main.className = 'command-palette-item-main';
            const label = document.createElement('span');
            label.className = 'command-palette-item-label';
            label.textContent = item.label;
            main.append(label);
            if (item.description) {
                const description = document.createElement('span');
                description.className = 'command-palette-item-description';
                description.textContent = item.description;
                main.append(description);
            }
            row.append(main);

            if (item.badge) {
                const badge = document.createElement('span');
                badge.className = 'command-palette-badge';
                badge.textContent = item.badge;
                row.append(badge);
            }
            const hint = shortcutHint(item.shortcutId);
            if (hint) row.append(hint);

            row.addEventListener('mousemove', () => {
                if (activeIndex === index) return;
                activeIndex = index;
                renderList();
            });
            row.addEventListener('mousedown', (event) => event.preventDefault());
            row.addEventListener('click', () => selectItem(item));
            list.append(row);
        });
        list.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
    }

    function refreshItems() {
        items = view.getItems(input.value);
        activeIndex = 0;
        renderList();
    }

    function showList(config) {
        view = { type: 'list', ...config };
        input.value = '';
        input.placeholder = view.placeholder || '';
        refreshItems();
        input.focus();
    }

    function renderPreview() {
        const result = view.getPreview?.(input.value) || { text: '', error: false };
        preview.textContent = result.text || '';
        preview.classList.toggle('is-error', Boolean(result.error));
    }

    function showPrompt(config) {
        view = { type: 'prompt', ...config };
        input.value = '';
        input.placeholder = view.placeholder || '';
        list.classList.add('is-hidden');
        preview.classList.remove('is-hidden');
        renderPreview();
        input.focus();
    }

    function selectItem(item) {
        const current = view;
        current.onSelect(item);
        // Selecting something that did not open another view finishes the interaction.
        if (view === current) close();
    }

    function open({ commandId } = {}) {
        if (!root) return;
        root.classList.remove('is-hidden');
        backdrop?.classList.remove('is-hidden');
        const direct = commandId && commands.find((command) => command.id === commandId);
        if (direct) {
            // Start from the catalog so a command that opens no view still closes cleanly.
            view = commandCatalogView();
            const catalogView = view;
            direct.run(api);
            if (view === catalogView) close();
        } else {
            showList(commandCatalogView());
        }
    }

    function close() {
        if (!isOpen()) return;
        root.classList.add('is-hidden');
        backdrop?.classList.add('is-hidden');
        view = null;
    }

    async function submitPrompt() {
        const result = view.getPreview?.(input.value);
        if (!input.value.trim() || result?.error) return;
        const { onSubmit } = view;
        const value = input.value;
        close();
        await onSubmit(value);
    }

    function handleKeydown(event) {
        if (event.isComposing || !view) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (view.type === 'prompt') {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitPrompt();
            }
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!items.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            activeIndex = (activeIndex + step + items.length) % items.length;
            renderList();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const item = items[activeIndex];
            if (item) selectItem(item);
        }
    }

    function setup() {
        input.addEventListener('input', () => {
            if (!view) return;
            if (view.type === 'prompt') renderPreview();
            else refreshItems();
        });
        input.addEventListener('keydown', handleKeydown);
        backdrop?.addEventListener('click', close);
    }

    return { setup, open, close, isOpen };
}
