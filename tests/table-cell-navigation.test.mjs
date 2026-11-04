import { focusTableCellFromEmptyArea, setupTableCellNavigation } from '../src/table-cell-navigation.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function fixture() {
    const doc = { activeElement: null };
    let line = 0;
    let lastLine = 0;
    const selection = {
        isCollapsed: true, rangeCount: 1, anchorNode: null,
        getRangeAt() {
            const saved = line;
            return { cloneRange() { return this; }, getBoundingClientRect() { return { top: saved * 20, height: 20 }; }, line: saved };
        },
        modify(_alter, direction) { line = Math.max(0, Math.min(lastLine, line + (direction === 'forward' ? 1 : -1))); },
        removeAllRanges() {}, addRange(range) { line = range.line; },
    };
    doc.getSelection = () => selection;
    doc.setLine = (value, last) => { line = value; lastLine = last; };
    const cells = Array.from({ length: 3 }, (_, index) => {
        const handlers = {};
        return {
            ownerDocument: doc, isConnected: true, text: '', dataset: { r: String(index - 1), c: '0' },
            contains(node) { return node === this; },
            addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
            emit(type, props = {}) {
                const event = { keyCode: 0, preventDefault() { this.defaultPrevented = true; }, ...props };
                for (const fn of handlers[type] || []) fn(event);
                return event;
            },
            focus() { if (doc.activeElement) doc.activeElement.emit('blur'); doc.activeElement = this; selection.anchorNode = this; }
        };
    });
    cells.forEach(cell => setupTableCellNavigation(cell, () => cells));
    cells[1].focus();
    return { cells, doc };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('clicking the empty part of a tall cell focuses it and places the caret at the end', () => {
    const container = {};
    const calls = [];
    const range = { selectNodeContents(node) { calls.push(node); }, collapse(end) { calls.push(end); } };
    const selection = { removeAllRanges() { calls.push('clear'); }, addRange(value) { calls.push(value); } };
    const cell = { focus() { calls.push('focus'); }, ownerDocument: {
        getSelection() { return selection; }, createRange() { return range; }
    } };
    const event = { target: container, button: 0, preventDefault() { calls.push('prevent'); } };
    focusTableCellFromEmptyArea(event, container, cell);
    assertEqual(calls.join(','), ['prevent', 'focus', cell, false, 'clear', range].join(','));
    calls.length = 0;
    focusTableCellFromEmptyArea({ ...event, target: cell }, container, cell);
    focusTableCellFromEmptyArea({ ...event, button: 2 }, container, cell);
    assertEqual(calls.length, 0);
});

test('Tab waits for IME final input before focusing the next cell', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    const event = cells[1].emit('keydown', { key: 'Tab', isComposing: true });
    assertEqual(event.defaultPrevented, true);
    assertEqual(doc.activeElement, cells[1]);
    cells[1].emit('compositionend');
    doc.activeElement.text = '영문명'; // final input can follow compositionend
    await tick();
    assertEqual(doc.activeElement, cells[2]);
    assertEqual(cells[1].text, '영문명');
    assertEqual(cells[2].text, '');
});

test('Shift+Tab waits for composition; ordinary Tab moves immediately', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    cells[1].emit('keydown', { key: 'Tab', shiftKey: true });
    cells[1].emit('compositionend');
    await tick();
    assertEqual(doc.activeElement, cells[0]);
    cells[0].emit('keydown', { key: 'Tab' });
    assertEqual(doc.activeElement, cells[1]);
});

test('up and down move to the same column in the adjacent row', () => {
    const { cells, doc } = fixture();
    const up = cells[1].emit('keydown', { key: 'ArrowUp' });
    assertEqual(up.defaultPrevented, true);
    assertEqual(doc.activeElement, cells[0]);
    cells[0].emit('keydown', { key: 'ArrowDown' });
    assertEqual(doc.activeElement, cells[1]);
    cells[1].emit('keydown', { key: 'ArrowDown' });
    assertEqual(doc.activeElement, cells[2]);
    const edge = cells[2].emit('keydown', { key: 'ArrowDown' });
    assertEqual(edge.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[2]);
});

test('arrows stay in a multiline cell until the first or last visual line', () => {
    const { cells, doc } = fixture();
    doc.setLine(0, 2);
    const down = cells[1].emit('keydown', { key: 'ArrowDown' });
    assertEqual(down.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[1]);
    doc.setLine(1, 2);
    const up = cells[1].emit('keydown', { key: 'ArrowUp' });
    assertEqual(up.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[1]);
    doc.setLine(2, 2);
    cells[1].emit('keydown', { key: 'ArrowDown' });
    assertEqual(doc.activeElement, cells[2]);
});

test('vertical navigation does not jump to a different column', () => {
    const { cells, doc } = fixture();
    cells[0].dataset.c = '1';
    const event = cells[1].emit('keydown', { key: 'ArrowUp' });
    assertEqual(event.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[1]);
});

test('arrows remain native during IME composition or with modifiers', () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    const composing = cells[1].emit('keydown', { key: 'ArrowDown', isComposing: true });
    assertEqual(composing.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[1]);
    cells[1].emit('compositionend');
    const modified = cells[1].emit('keydown', { key: 'ArrowUp', shiftKey: true });
    assertEqual(modified.defaultPrevented, undefined);
    assertEqual(doc.activeElement, cells[1]);
});

test('deferred navigation does not steal focus after blur', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    cells[1].emit('keydown', { key: 'Tab', isComposing: true });
    cells[1].emit('compositionend');
    cells[0].focus();
    await tick();
    assertEqual(doc.activeElement, cells[0]);
});
