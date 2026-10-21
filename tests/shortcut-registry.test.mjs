import { SHORTCUTS } from '../configs/shortcuts.js';
import { formatBinding, getDisplayBindings } from '../modules/shortcut-registry.js';
import { assertEqual, test } from './lib/test-runner.mjs';

test('shortcut registry: ids are unique and every entry is displayable', () => {
    const ids = SHORTCUTS.map((entry) => entry.id);
    assertEqual(new Set(ids).size, ids.length);
    SHORTCUTS.forEach((entry) => {
        assertEqual(Boolean(entry.label), true);
        assertEqual(entry.bindings.length > 0, true);
        assertEqual(getDisplayBindings(entry, true).length + getDisplayBindings(entry, false).length > 0, true);
    });
});

test('formatBinding renders mac and non-mac key caps', () => {
    const redo = SHORTCUTS.find((entry) => entry.id === 'redo').bindings[0];
    assertEqual(formatBinding(redo, true).join(' '), '⌘ ⇧ Z');
    assertEqual(formatBinding(redo, false).join(' '), 'Ctrl Shift Z');
    const tabPrev = SHORTCUTS.find((entry) => entry.id === 'tabPrevious').bindings;
    assertEqual(formatBinding(tabPrev[0], true).join(' '), '⌘ ⇧ [');
    assertEqual(formatBinding(tabPrev[1], true).join(' '), '⌘ ⌥ ←');
});

test('platform filtering hides the other platform bindings', () => {
    const replace = SHORTCUTS.find((entry) => entry.id === 'replaceOpen');
    assertEqual(formatBinding(getDisplayBindings(replace, true)[0], true).join(' '), '⌘ ⌥ F');
    assertEqual(formatBinding(getDisplayBindings(replace, false)[0], false).join(' '), 'Ctrl H');
    const tabNext = SHORTCUTS.find((entry) => entry.id === 'tabNext');
    assertEqual(getDisplayBindings(tabNext, false).length, 0);
});
