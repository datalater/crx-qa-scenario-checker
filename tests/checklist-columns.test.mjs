import {
    CHECKLIST_COLUMNS,
    describeVisibleColumns,
    normalizeHiddenColumns,
    readHiddenColumns,
    toggleHiddenColumn
} from '../modules/checklist-columns.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('every column is shown by default', () => {
    assertDeepEqual(CHECKLIST_COLUMNS.map(column => column.id), ['given', 'when', 'then', 'pass', 'note']);
    assertDeepEqual(readHiddenColumns(null), []);
    assertEqual(describeVisibleColumns([]), 'All columns');
});

test('toggling hides a column and shows it again, kept in column order', () => {
    let hidden = toggleHiddenColumn([], 'note');
    assertDeepEqual(hidden, ['note']);
    hidden = toggleHiddenColumn(hidden, 'given');
    assertDeepEqual(hidden, ['given', 'note']);
    assertEqual(describeVisibleColumns(hidden), 'Columns 3/5');
    assertDeepEqual(toggleHiddenColumn(hidden, 'note'), ['given']);
});

test('the last visible column cannot be hidden', () => {
    const hidden = ['given', 'when', 'then', 'pass'];
    assertDeepEqual(toggleHiddenColumn(hidden, 'note'), hidden);
    assertDeepEqual(toggleHiddenColumn(hidden, 'pass'), ['given', 'when', 'then']);
});

test('a stored list is cleaned of unknown names, repeats and nonsense', () => {
    assertDeepEqual(normalizeHiddenColumns(['note', 'nope', 'note', 'given']), ['given', 'note']);
    assertDeepEqual(normalizeHiddenColumns(['given', 'when', 'then', 'pass', 'note']), []);
    assertDeepEqual(normalizeHiddenColumns('note'), []);
    assertDeepEqual(readHiddenColumns('["pass"]'), ['pass']);
    assertDeepEqual(readHiddenColumns('{broken'), []);
    assertDeepEqual(toggleHiddenColumn([], 'nope'), []);
});

test('the old note toggle is honoured until the picker has been used', () => {
    assertDeepEqual(readHiddenColumns(null, 'check'), ['note']);
    assertDeepEqual(readHiddenColumns(null, 'trace'), []);
    assertDeepEqual(readHiddenColumns('[]', 'check'), [], 'a saved choice wins');
});
