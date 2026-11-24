import { formatBinding, getDisplayBindings } from './shortcut-registry.js';
import { SHORTCUTS } from '../configs/shortcuts.js';

/**
 * Command palette: one input box with two kinds of views.
 *   list   - a filterable list of items (the command catalog, the file picker, ...)
 *   prompt - free text input with a live preview line
 *
 * It opens on quick open: plain text searches `quickOpen` (the files), and
 * text starting with `>` lists the commands instead, as in VS Code.
 *
 * command: { id, label, name, shortcutId?, isAvailable?(), run(api) }
 *     label: what the command is called in the UI; name: its English name.
 *     isAvailable: false hides a command that cannot run right now.
 * api.pick({ placeholder, getItems(query), onSelect(item), emptyText? })
 *     item: { label, description?, badge?, shortcutId?, swatch? }
 *           swatch: a colour for a dot before the label, or 'default'
 *           isCurrent: the list opens with this item highlighted
 * api.prompt({ placeholder, getPreview(value) -> { text, error }, onSubmit(value) })
 * A command that opens neither view is considered done and closes the palette.
 */
export const COMMAND_PREFIX = '>';

/**
 * The commands that can run now and match every word of the query, in
 * catalog order. Either name of a command may be searched.
 */
export function filterCommands(commands, query) {
    const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((command) => {
        if (typeof command.isAvailable === 'function' && !command.isAvailable()) return false;
        const text = `${command.label} ${command.name || ''}`.toLowerCase();
        return tokens.every(token => text.includes(token));
    });
}

export function createCommandPalette({ root, backdrop, input, list, preview, commands, quickOpen = null }) {
    let view = null;
    let items = [];
    let activeIndex = 0;

    const isOpen = () => Boolean(root) && !root.classList.contains('is-hidden');

    const api = {
        pick: (config) => showList(config),
        prompt: (config) => showPrompt(config)
    };

    const isCommandQuery = query => query.trimStart().startsWith(COMMAND_PREFIX);

    /** Quick open: files by default, the commands after a `>`. */
    function commandCatalogView() {
        return {
            type: 'list',
            placeholder: quickOpen
                ? `파일 이름으로 검색 (${COMMAND_PREFIX} 를 입력하면 명령 목록)`
                : '명령 검색...',
            emptyText: query => (!quickOpen || isCommandQuery(query)
                ? '일치하는 명령이 없습니다.'
                : quickOpen.emptyText || '결과가 없습니다.'),
            getItems: (query) => {
                if (quickOpen && !isCommandQuery(query)) return quickOpen.getItems(query);
                const text = quickOpen ? query.trimStart().slice(COMMAND_PREFIX.length) : query;
                return filterCommands(commands, text).map(command => ({
                    label: command.label,
                    // Both names show, so a command is found under either.
                    description: command.name || '',
                    shortcutId: command.shortcutId,
                    command
                }));
            },
            onSelect: item => (item.command ? item.command.run(api) : quickOpen.onSelect(item))
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
            const emptyText = typeof view.emptyText === 'function' ? view.emptyText(input.value) : view.emptyText;
            empty.textContent = emptyText || '결과가 없습니다.';
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
            if (item.swatch) {
                const swatch = document.createElement('span');
                swatch.className = 'command-palette-swatch';
                if (item.swatch !== 'default') swatch.style.backgroundColor = item.swatch;
                main.append(swatch);
            }
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

    function showList(config, query = '') {
        view = { type: 'list', ...config };
        input.value = query;
        input.placeholder = view.placeholder || '';
        refreshItems();
        // A list may open on one of its items (the current section, ...);
        // typing a query starts from the top again.
        const start = items.findIndex(item => item.isCurrent === true);
        if (start > 0) {
            activeIndex = start;
            renderList();
        }
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

    /**
     * `commandId` runs one command right away; `commands: true` opens on the
     * command list (quick open with the `>` already typed).
     */
    function open({ commandId, commands: listCommands = false } = {}) {
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
            showList(commandCatalogView(), listCommands && quickOpen ? COMMAND_PREFIX : '');
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
