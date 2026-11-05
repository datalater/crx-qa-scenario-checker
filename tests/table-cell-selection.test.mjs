import { selectedCellRows, setupTableCellSelection, tableSelectionClipboard } from '../src/table-cell-selection.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const cell = (r, c, text, hidden = false) => ({ dataset: { r: String(r), c: String(c) }, _text: text, parentElement: { hidden } });

test('rectangular drag copies visible cells in row and column order in either direction', () => {
    const cells = [cell(-1, 0, 'Head'), cell(-1, 1, 'Hidden', true), cell(-1, 2, 'Name'),
        cell(0, 0, 'A'), cell(0, 1, 'secret', true), cell(0, 2, 'B')];
    const rows = selectedCellRows(cells, { r: 0, c: 2 }, { r: -1, c: 0 });
    assertDeepEqual(rows, [['Head', 'Name'], ['A', 'B']]);
    assertEqual(tableSelectionClipboard(rows).text, 'Head\tName\nA\tB');
});

test('multi-cell copy survives the modifier key and is handled before surrounding listeners', () => {
    const events = {};
    const selected = new Set();
    const cells = [];
    const tableEvents = {};
    const doc = {
        activeElement: null,
        addEventListener(type, fn, capture) { events[type] = { fn, capture }; },
        removeEventListener() {}, elementFromPoint() { return cells[1].parentElement; },
        getSelection() { return { removeAllRanges() {} }; },
    };
    const table = {
        ownerDocument: doc, classList: { add() {}, remove() {} },
        contains(node) { return cells.includes(node) || cells.some(c => c.parentElement === node); },
        querySelectorAll(selector) { return selector === '.cm-lt-cell' ? cells : selector === 'td, th' ? cells.map(c => c.parentElement) : []; },
        addEventListener(type, fn) { tableEvents[type] = fn; }, removeEventListener() {},
    };
    for (let i = 0; i < 2; i++) {
        const td = { dataset: { r: '0', c: String(i) }, hidden: false,
            closest() { return this; }, querySelector() { return cells[i]; },
            classList: { toggle(_name, yes) { if (yes) selected.add(i); else selected.delete(i); }, remove() {} } };
        cells.push({ dataset: td.dataset, parentElement: td, _text: i ? 'two' : 'one', isConnected: true });
    }
    doc.activeElement = cells[0];
    const selection = setupTableCellSelection(table);
    assertEqual(events.mousedown.capture, true);
    events.mousedown.fn({ button: 0, target: cells[0].parentElement });
    events.mousemove.fn({ clientX: 1, clientY: 1 });
    events.mouseup.fn();
    tableEvents.keydown({ key: 'Meta' });
    tableEvents.keydown({ key: 'c', metaKey: true });
    const copied = {};
    const event = { clipboardData: { setData(type, value) { copied[type] = value; } },
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    events.copy.fn(event);
    assertEqual(events.copy.capture, true);
    assertEqual(event.prevented, true);
    assertEqual(event.stopped, true);
    assertEqual(copied['text/plain'], 'one\ttwo');
    selection.destroy();
});

test('copied cell text is quoted for spreadsheets and escaped in HTML', () => {
    const { text, html } = tableSelectionClipboard([['a\tb', 'one\ntwo', '<tag> & "x"']]);
    assertEqual(text, '"a\tb"\t"one\ntwo"\t"<tag> & ""x"""');
    assertEqual(html, '<table><tr><td>a\tb</td><td>one<br>two</td><td>&lt;tag&gt; &amp; "x"</td></tr></table>');
});
