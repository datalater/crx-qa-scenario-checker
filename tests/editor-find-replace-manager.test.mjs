import { createEditorFindReplaceManager } from '../modules/editor-find-replace-manager.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createEditingMock(value) {
    return {
        value,
        selectionStart: 0,
        selectionEnd: 0,
        selectionDirection: 'none',
        focus() {},
        setSelectionRange(start, end, direction = 'none') {
            this.selectionStart = start;
            this.selectionEnd = end;
            this.selectionDirection = direction;
        }
    };
}

test('find manager tracks matches and navigates next/previous', () => {
    const editing = createEditingMock('alpha beta alpha beta');
    const manager = createEditorFindReplaceManager({ editing });

    manager.open({ seedQuery: 'beta' });
    assertEqual(manager.getState().matchCount, 2);

    manager.findNext();
    assertEqual(editing.selectionStart, 6);
    assertEqual(editing.selectionEnd, 10);

    manager.findNext();
    assertEqual(editing.selectionStart, 17);
    assertEqual(editing.selectionEnd, 21);

    manager.findPrevious();
    assertEqual(editing.selectionStart, 6);
    assertEqual(editing.selectionEnd, 10);
});

test('replace current changes one match and updates count', () => {
    const editing = createEditingMock('foo bar foo');
    const manager = createEditorFindReplaceManager({ editing });

    manager.open({ seedQuery: 'foo', showReplace: true });
    manager.setReplaceText('baz');

    const replaced = manager.replaceCurrent();
    assertEqual(replaced, 1);
    assertEqual(editing.value, 'baz bar foo');
    assertEqual(manager.getState().matchCount, 1);
});

test('replace all replaces every plain-text match', () => {
    const editing = createEditingMock('cat dog cat cat');
    const manager = createEditorFindReplaceManager({ editing });

    manager.open({ seedQuery: 'cat', showReplace: true });
    manager.setReplaceText('bird');

    const replaced = manager.replaceAll();
    assertEqual(replaced, 3);
    assertEqual(editing.value, 'bird dog bird bird');
    assertEqual(manager.getState().matchCount, 0);
});

test('query update can reveal active match without forcing focus', () => {
    const editing = createEditingMock('alpha beta gamma beta');
    let focused = false;
    editing.focus = () => { focused = true; };
    editing.setSelectionRange(0, 0, 'none');

    const manager = createEditorFindReplaceManager({ editing });
    manager.open();
    manager.setQuery('beta');

    const revealed = manager.revealActiveMatch({ focusEditor: false });
    assertEqual(revealed, true);
    assertEqual(editing.selectionStart, 6);
    assertEqual(editing.selectionEnd, 10);
    assertEqual(focused, false);
});
