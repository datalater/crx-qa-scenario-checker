import { SHORTCUTS } from '../configs/shortcuts.js';

export function isMacPlatform(nav = globalThis.navigator) {
    return /Mac|iPhone|iPad/i.test(String(nav?.platform || nav?.userAgent || ''));
}

function matchesBinding(event, binding) {
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;
    if (typeof binding.primary === 'boolean' && hasPrimaryModifier !== binding.primary) return false;
    if (typeof binding.ctrl === 'boolean' && event.ctrlKey !== binding.ctrl) return false;
    if (typeof binding.meta === 'boolean' && event.metaKey !== binding.meta) return false;
    if (typeof binding.shift === 'boolean' && event.shiftKey !== binding.shift) return false;
    if (typeof binding.alt === 'boolean' && event.altKey !== binding.alt) return false;

    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const codeMatch = Array.isArray(binding.codes) && binding.codes.includes(event.code);
    const keyMatch = Array.isArray(binding.keys) && binding.keys.some((k) => k.toLowerCase() === key);
    return codeMatch || keyMatch;
}

/** True when the keydown event triggers any binding of the shortcut `id`. */
export function matchShortcut(event, id, registry = SHORTCUTS) {
    if (!event || event.isComposing) return false;
    const entry = registry.find((item) => item.id === id);
    if (!entry) return false;
    return entry.bindings.some((binding) => matchesBinding(event, binding));
}

const CODE_LABELS = {
    Minus: '-', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Tab: 'Tab',
    BracketLeft: '[', BracketRight: ']',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓'
};

function keyLabel(binding) {
    if (binding.display) return binding.display;
    const code = binding.codes?.[0] || '';
    if (CODE_LABELS[code]) return CODE_LABELS[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return String(binding.keys?.[0] || code).toUpperCase();
}

/** Key caps for one binding, e.g. ['⌘', '⇧', 'Z'] (Ctrl instead of ⌘ off-mac). */
export function formatBinding(binding, mac = isMacPlatform()) {
    const caps = [];
    if (binding.primary === true) caps.push(mac ? '⌘' : 'Ctrl');
    if (binding.meta === true) caps.push('⌘');
    if (binding.ctrl === true) caps.push(mac ? '⌃' : 'Ctrl');
    if (binding.alt === true) caps.push(mac ? '⌥' : 'Alt');
    if (binding.shift === true) caps.push(mac ? '⇧' : 'Shift');
    caps.push(keyLabel(binding));
    return caps;
}

/** Bindings listed for the given platform (bindings without `platform` apply to both). */
export function getDisplayBindings(entry, mac = isMacPlatform()) {
    const want = mac ? 'mac' : 'other';
    return entry.bindings.filter((binding) => !binding.platform || binding.platform === want);
}

/** Fill a <tbody> with one row per shortcut, built from the registry. */
export function renderShortcutRows(tbody, registry = SHORTCUTS, mac = isMacPlatform(), doc = document) {
    tbody.replaceChildren();
    registry.forEach((entry) => {
        const bindings = getDisplayBindings(entry, mac);
        if (!bindings.length) return;
        const row = doc.createElement('tr');
        const label = doc.createElement('td');
        label.textContent = entry.label;
        const keys = doc.createElement('td');
        bindings.forEach((binding, index) => {
            if (index > 0) keys.append(' or ');
            formatBinding(binding, mac).forEach((cap, capIndex) => {
                if (capIndex > 0) keys.append(' ');
                const kbd = doc.createElement('kbd');
                kbd.textContent = cap;
                keys.append(kbd);
            });
        });
        row.append(label, keys);
        tbody.append(row);
    });
}
