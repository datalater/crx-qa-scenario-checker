import { runNativeEditCommand } from '../modules/editor-shortcut-manager.js';
import { matchShortcut } from '../modules/shortcut-registry.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createEvent(overrides = {}) {
    return {
        key: '',
        code: '',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        ...overrides
    };
}

test('save shortcut detection: cmd/ctrl+s only', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 's', code: 'KeyS' }), 'save'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'S', code: 'KeyS' }), 'save'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: 's', code: 'KeyS' }), 'save'), false);
});

test('undo/redo shortcut detection works for mac and windows patterns', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'z', code: 'KeyZ' }), 'undo'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'Z', code: 'KeyZ' }), 'undo'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: 'z', code: 'KeyZ' }), 'redo'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'y', code: 'KeyY' }), 'redo'), true);
});

test('find/replace shortcut detection works for mac and windows patterns', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'f', code: 'KeyF' }), 'findOpen'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'f', code: 'KeyF' }), 'findOpen'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, altKey: true, key: 'f', code: 'KeyF' }), 'replaceOpen'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'h', code: 'KeyH' }), 'replaceOpen'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'f', code: 'KeyF' }), 'replaceOpen'), false);
});

test('find navigation and close key detection', () => {
    assertEqual(matchShortcut(createEvent({ key: 'Enter', code: 'Enter' }), 'findNext'), true);
    assertEqual(matchShortcut(createEvent({ key: 'Enter', code: 'Enter', shiftKey: true }), 'findPrevious'), true);
    assertEqual(matchShortcut(createEvent({ key: 'Escape', code: 'Escape' }), 'findClose'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'Enter', code: 'Enter' }), 'findNext'), false);
});

test('native edit command wrapper handles missing/throwing execCommand safely', () => {
    assertEqual(runNativeEditCommand(null, 'undo'), false);
    assertEqual(runNativeEditCommand({}, 'undo'), false);
    assertEqual(runNativeEditCommand({ execCommand: () => true }, 'undo'), true);
    assertEqual(runNativeEditCommand({ execCommand: () => false }, 'undo'), false);
    assertEqual(runNativeEditCommand({ execCommand: () => { throw new Error('boom'); } }, 'undo'), false);
});

test('open-file tab shortcuts: cmd+shift+[ ] and cmd+option+arrows, not plain brackets', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: '{', code: 'BracketLeft' }), 'tabPrevious'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: '}', code: 'BracketRight' }), 'tabNext'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, altKey: true, key: 'ArrowLeft', code: 'ArrowLeft' }), 'tabPrevious'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, altKey: true, key: 'ArrowRight', code: 'ArrowRight' }), 'tabNext'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: '[', code: 'BracketLeft' }), 'tabPrevious'), false);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, shiftKey: true, key: '{', code: 'BracketLeft' }), 'tabPrevious'), false);
});

test('indent/outdent shortcuts follow shift state; unknown ids never match', () => {
    assertEqual(matchShortcut(createEvent({ key: 'Tab', code: 'Tab' }), 'indent'), true);
    assertEqual(matchShortcut(createEvent({ key: 'Tab', code: 'Tab', shiftKey: true }), 'indent'), false);
    assertEqual(matchShortcut(createEvent({ key: 'Tab', code: 'Tab', shiftKey: true }), 'outdent'), true);
    assertEqual(matchShortcut(createEvent({ key: 'Tab', code: 'Tab' }), 'nope'), false);
});

test('palette and new-file shortcuts need exact modifiers', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: 'p', code: 'KeyP' }), 'commandPalette'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'p', code: 'KeyP' }), 'commandPalette'), false);
    assertEqual(matchShortcut(createEvent({ metaKey: true, altKey: true, key: 'Dead', code: 'KeyN' }), 'newFile'), true);
    assertEqual(matchShortcut(createEvent({ metaKey: true, altKey: true, key: 'Dead', code: 'KeyE' }), 'newFile'), false);
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'n', code: 'KeyN' }), 'newFile'), false);
});

test('toggle file tree shortcut is cmd+b only (ctrl+b stays a caret move)', () => {
    assertEqual(matchShortcut(createEvent({ metaKey: true, key: 'b', code: 'KeyB' }), 'toggleFileTree'), true);
    assertEqual(matchShortcut(createEvent({ ctrlKey: true, key: 'b', code: 'KeyB' }), 'toggleFileTree'), false);
    assertEqual(matchShortcut(createEvent({ metaKey: true, shiftKey: true, key: 'b', code: 'KeyB' }), 'toggleFileTree'), false);
});
