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
    parseTsv,
    serializeTable,
    splitTableRow,
    tableSourceFromHtml,
    tableSourceFromText
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

const NOTION_TEXT = [
    '단계\t구분\t수정 가능여부\t삭제 가능여부\t예외 ',
    '초안\t최초 문항 생성 시 \t수정 가능 \t삭제 가능\t통계 발생 시, 수정/삭제불가',
    '-일부 수정 가능',
    '검토\t출제자가 검토 단계로 상태 변경 시\t수정 불가\t삭제 불가\t',
    '승인\t문항 관리자가 문항을 승인하였을 경우\t일부 수정 가능\t삭제 불가\t'
].join('\n');

test('Notion text: a line without tabs continues the previous last cell', () => {
    const rows = parseTsv(NOTION_TEXT);
    assertEqual(rows.length, 4);
    assertDeepEqual(rows[0], ['단계', '구분', '수정 가능여부', '삭제 가능여부', '예외']);
    assertDeepEqual(rows[1], ['초안', '최초 문항 생성 시', '수정 가능', '삭제 가능', '통계 발생 시, 수정/삭제불가\n-일부 수정 가능']);
    assertDeepEqual(rows[2], ['검토', '출제자가 검토 단계로 상태 변경 시', '수정 불가', '삭제 불가', '']);
});

test('pasted text becomes a markdown table', () => {
    const source = tableSourceFromText(NOTION_TEXT);
    const model = parseTable(source);
    assertEqual(model.header.length, 5);
    assertEqual(model.rows.length, 3);
    assertEqual(model.rows[0][4], '통계 발생 시, 수정/삭제불가\n-일부 수정 가능');
    assertEqual(source.split('\n').length, 5);
});

test('a short row continues in the next line, quoted cells keep tabs and breaks', () => {
    assertDeepEqual(parseTsv('a\tb\tc\nx\ty\nz\tw'), [['a', 'b', 'c'], ['x', 'y\nz', 'w']]);
    assertDeepEqual(parseTsv('a\tb\n"1\n2"\t"x\ty ""q"""'), [['a', 'b'], ['1\n2', 'x\ty "q"']]);
});

test('text that is not a table stays plain', () => {
    assertEqual(tableSourceFromText('just a sentence'), null);
    assertEqual(tableSourceFromText('one\ttwo'), null);
    assertEqual(tableSourceFromText('\tindented\n\tcode'), null);
    assertEqual(tableSourceFromText('a\tb\nc'), null);
});

test('cells with pipes are escaped when pasted', () => {
    assertEqual(tableSourceFromText('a\tb\n1|2\t3'), '| a | b |\n| -- | -- |\n| 1\\|2 | 3 |');
});

test('HTML tables convert only when they are the whole clipboard', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1<br>2</td><td><p>x</p><p>y</p></td></tr></table>';
    assertEqual(tableSourceFromHtml(html), '| A | B |\n| -- | -- |\n| 1<br>2 | x<br>y |');
    assertEqual(tableSourceFromHtml('<p>intro</p>' + html), null);
});
