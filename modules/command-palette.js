import { formatBinding, getDisplayBindings } from './shortcut-registry.js';
import { SHORTCUTS } from '../configs/shortcuts.js';

/**
 * Command palette: a filterable catalog of commands.
 * Choosing a command either runs it or calls api.prompt() to ask for input in the same box.
 *
 * command: { id, label, shortcutId?, run(api) }
 * api.prompt({ placeholder, getPreview(value) -> { text, error }, onSubmit(value) })
 */
export function createCommandPalette({ root, backdrop, input, list, preview, commands }) {
    let mode = 'commands'; // 'commands' | 'prompt'
    let filtered = [];
    let activeIndex = 0;
    let promptConfig = null;

    const isOpen = () => Boolean(root) && !root.classList.contains('is-hidden');

    function matchCommands(query) {
        const q = query.trim().toLowerCase();
        return commands.filter((command) => !q || command.label.toLowerCase().includes(q));
    }

    function renderShortcutHint(command) {
        const entry = SHORTCUTS.find((item) => item.id === command.shortcutId);
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
        if (!filtered.length) {
            const empty = document.createElement('li');
            empty.className = 'command-palette-empty';
            empty.textContent = '일치하는 명령이 없습니다.';
            list.append(empty);
            return;
        }
        filtered.forEach((command, index) => {
            const item = document.createElement('li');
            item.className = 'command-palette-item' + (index === activeIndex ? ' is-active' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(index === activeIndex));
            const label = document.createElement('span');
            label.textContent = command.label;
            item.append(label);
            const hint = renderShortcutHint(command);
            if (hint) item.append(hint);
            item.addEventListener('mousemove', () => {
                if (activeIndex === index) return;
                activeIndex = index;
                renderList();
            });
            item.addEventListener('mousedown', (event) => event.preventDefault());
            item.addEventListener('click', () => runCommand(command));
            list.append(item);
        });
        list.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
    }

    function renderPreview() {
        const result = promptConfig.getPreview?.(input.value) || { text: '', error: false };
        preview.textContent = result.text || '';
        preview.classList.toggle('is-error', Boolean(result.error));
    }

    function startPrompt(config) {
        mode = 'prompt';
        promptConfig = config;
        input.value = '';
        input.placeholder = config.placeholder || '';
        list.classList.add('is-hidden');
        preview.classList.remove('is-hidden');
        renderPreview();
        input.focus();
    }

    function showCommands() {
        mode = 'commands';
        promptConfig = null;
        input.value = '';
        input.placeholder = '명령 검색...';
        filtered = matchCommands('');
        activeIndex = 0;
        renderList();
        input.focus();
    }

    function runCommand(command) {
        command.run({ prompt: startPrompt });
        // A command that did not ask for input is done: close the palette.
        if (mode === 'commands') close();
    }

    function open({ commandId } = {}) {
        if (!root) return;
        root.classList.remove('is-hidden');
        backdrop?.classList.remove('is-hidden');
        showCommands();
        const direct = commandId && commands.find((command) => command.id === commandId);
        if (direct) runCommand(direct);
    }

    function close() {
        if (!isOpen()) return;
        root.classList.add('is-hidden');
        backdrop?.classList.add('is-hidden');
        mode = 'commands';
        promptConfig = null;
    }

    async function submitPrompt() {
        const result = promptConfig.getPreview?.(input.value);
        if (!input.value.trim() || result?.error) return;
        const { onSubmit } = promptConfig;
        const value = input.value;
        close();
        await onSubmit(value);
    }

    function handleKeydown(event) {
        if (event.isComposing) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (mode === 'prompt') {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitPrompt();
            }
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!filtered.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            activeIndex = (activeIndex + step + filtered.length) % filtered.length;
            renderList();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const command = filtered[activeIndex];
            if (command) runCommand(command);
        }
    }

    function setup() {
        input.addEventListener('input', () => {
            if (mode === 'prompt') {
                renderPreview();
                return;
            }
            filtered = matchCommands(input.value);
            activeIndex = 0;
            renderList();
        });
        input.addEventListener('keydown', handleKeydown);
        backdrop?.addEventListener('click', close);
    }

    return { setup, open, close, isOpen };
}
