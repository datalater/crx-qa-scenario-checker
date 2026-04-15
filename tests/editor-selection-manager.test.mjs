import { createEditorSelectionManager } from '../modules/editor-selection-manager.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createTextareaMock(value, selectionStart, selectionEnd) {
    return {
        value,
        selectionStart,
        selectionEnd,
        setRangeText(replacement, start, end) {
            this.value = this.value.slice(0, start) + replacement + this.value.slice(end);
        }
    };
}

test('Tab indents current line when no selection', () => {
    const text = 'alpha\nbeta\ngamma';
    const cursor = text.indexOf('beta') + 2;
    const editing = createTextareaMock(text, cursor, cursor);
    const manager = createEditorSelectionManager(editing);

    manager.indentSelection();

    assertEqual(editing.value, 'alpha\n  beta\ngamma', 'Current line should be indented');
});

test('Shift+Tab unindents current line when no selection', () => {
    const text = 'alpha\n  beta\ngamma';
    const cursor = text.indexOf('beta') + 1;
    const editing = createTextareaMock(text, cursor, cursor);
    const manager = createEditorSelectionManager(editing);

    manager.unindentSelection();

    assertEqual(editing.value, 'alpha\nbeta\ngamma', 'Current line should be unindented');
});

test('Tab indents multiple selected lines', () => {
    const text = 'root\nitemA\nitemB';
    const start = text.indexOf('itemA');
    const end = text.length;
    const editing = createTextareaMock(text, start, end);
    const manager = createEditorSelectionManager(editing);

    manager.indentSelection();

    assertEqual(editing.value, 'root\n  itemA\n  itemB', 'Selected lines should be indented');
});

test('Shift+Tab removes one or two leading spaces from selected lines', () => {
    const text = '  root\n itemA\nitemB';
    const editing = createTextareaMock(text, 0, text.length);
    const manager = createEditorSelectionManager(editing);

    manager.unindentSelection();

    assertEqual(editing.value, 'root\nitemA\nitemB', 'Selected lines should be normalized by unindent');
});
