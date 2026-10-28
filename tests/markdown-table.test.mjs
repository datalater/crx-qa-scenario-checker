import {
    cellMarkdownFromText,
    cellTextFromMarkdown,
    deleteColumn,
    deleteRow,
    insertColumn,
    insertRow,
    parseTable,
    planTableDeletion,
    planTableInsertion,
    serializeTable,
    splitTableRow
} from '../src/markdown-table.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('table rows split on unescaped pipes only', () => {
    assertDeepEqual(splitTableRow('| a | b |'), ['a', 'b']);
    assertDeepEqual(splitTableRow('a | b'), ['a', 'b']);
    assertDeepEqual(splitTableRow('| a \\| b | c |'), ['a \\| b', 'c']);
    assertDeepEqual(splitTableRow('|  |  |'), ['', '']);
});

test('cell line breaks are stored as <br>', () => {
    assertEqual(cellTextFromMarkdown('모달<br>- 비노출'), '모달\n- 비노출');
    assertEqual(cellTextFromMarkdown('a<br/>b<BR />c'), 'a\nb\nc');
    assertEqual(cellTextFromMarkdown('a \\| b'), 'a | b');
    assertEqual(cellMarkdownFromText('모달\n- 비노출\n\n'), '모달<br>- 비노출');
    assertEqual(cellMarkdownFromText('a | b'), 'a \\| b');
});

test('table parses into padded rows and keeps alignment cells', () => {
    const model = parseTable('| 구분 | 내용 |\n| :-- | --: |\n| a | 첫 줄<br>둘째 줄 |\n| b |');
    assertDeepEqual(model, {
        header: ['구분', '내용'],
        align: [':--', '--:'],
        rows: [['a', '첫 줄\n둘째 줄'], ['b', '']]
    });
    assertEqual(
        serializeTable(model),
        '| 구분 | 내용 |\n| :-- | --: |\n| a | 첫 줄<br>둘째 줄 |\n| b |  |'
    );
});

test('a table in the canonical shape round-trips unchanged', () => {
    const source = '| a | b |\n| -- | -- |\n| `x` | y<br>z |';
    assertEqual(serializeTable(parseTable(source)), source);
});

test('column and row edits shift cells and keep one column', () => {
    const model = parseTable('| a | b |\n| -- | :-: |\n| 1 | 2 |');
    assertDeepEqual(insertColumn(model, 1), {
        header: ['a', '', 'b'], align: ['--', '--', ':-:'], rows: [['1', '', '2']]
    });
    assertDeepEqual(deleteColumn(model, 0), { header: ['b'], align: [':-:'], rows: [['2']] });
    const single = deleteColumn(model, 0);
    assertEqual(deleteColumn(single, 0), single);
    assertDeepEqual(insertRow(model, 0).rows, [['', ''], ['1', '2']]);
    assertDeepEqual(deleteRow(model, 0).rows, []);
});

const lineInfo = (overrides) => ({
    text: '', from: 0, to: 0, hasPrev: false, prevBlank: false, hasNext: false, nextBlank: false, ...overrides
});

test('/table on its own line replaces the line, spaced from neighbours', () => {
    // "# T\n/table\nnext": the command line sits between two paragraphs.
    const plan = planTableInsertion(
        lineInfo({ text: '/table', from: 4, to: 10, hasPrev: true, hasNext: true }), 4, 10
    );
    assertDeepEqual(plan.changes, [{ from: 4, to: 10, insert: '\n|  |  |\n| -- | -- |\n|  |  |\n' }]);
    assertEqual(plan.tableFrom, 5);

    const alone = planTableInsertion(lineInfo({ text: '/table', to: 6 }), 0, 6);
    assertDeepEqual(alone.changes, [{ from: 0, to: 6, insert: '|  |  |\n| -- | -- |\n|  |  |' }]);
    assertEqual(alone.tableFrom, 0);
});

test('/table after text goes below that line', () => {
    // "intro /table" followed by a blank line.
    const plan = planTableInsertion(
        lineInfo({ text: 'intro /table', to: 12, hasNext: true, nextBlank: true }), 6, 12
    );
    assertDeepEqual(plan.changes, [
        { from: 6, to: 12, insert: '' },
        { from: 12, to: 12, insert: '\n\n|  |  |\n| -- | -- |\n|  |  |' }
    ]);
    assertEqual(plan.tableFrom, 8);
});

test('deleting a table leaves one blank line between its neighbours', () => {
    // "a\n\nT1\nT2\n\nb": table at 3-8.
    const doc = 'a\n\nT1\nT2\n\nb';
    const around = {
        docLength: doc.length,
        prev: { from: 2, to: 2, blank: true },
        next: { from: 9, to: 9, blank: true }
    };
    const range = planTableDeletion(3, 8, around);
    assertEqual(doc.slice(0, range.from) + doc.slice(range.to), 'a\n\nb');

    // Table followed directly by text: only the table lines go.
    const glued = 'T1\nT2\nb';
    const r2 = planTableDeletion(0, 5, { docLength: glued.length, prev: null, next: { from: 6, to: 7, blank: false } });
    assertEqual(glued.slice(0, r2.from) + glued.slice(r2.to), 'b');

    // Table at the end after a blank line.
    const tail = 'a\n\nT1\nT2';
    const r3 = planTableDeletion(3, 8, { docLength: tail.length, prev: { from: 2, to: 2, blank: true }, next: null });
    assertEqual(tail.slice(0, r3.from) + tail.slice(r3.to), 'a');

    // The whole document is the table.
    const only = 'T1\nT2';
    const r4 = planTableDeletion(0, 5, { docLength: only.length, prev: null, next: null });
    assertEqual(only.slice(0, r4.from) + only.slice(r4.to), '');
});
