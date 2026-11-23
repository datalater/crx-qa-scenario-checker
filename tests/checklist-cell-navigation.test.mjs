import { findCellNavigationTarget } from '../modules/ui-renderer.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const STEP = ['given', 'when', 'then', 'note'];
const TEXT_DIVIDER = ['divider', 'note'];
const CODE_DIVIDER = [];
//            0             1     2     3             4     5
const rows = [TEXT_DIVIDER, STEP, STEP, CODE_DIVIDER, STEP, TEXT_DIVIDER];

test('a step cell moves to the same column of the row above or below', () => {
    assertDeepEqual(findCellNavigationTarget(rows, 1, 'when', 1), { row: 2, field: 'when' });
    assertDeepEqual(findCellNavigationTarget(rows, 2, 'then', -1), { row: 1, field: 'then' });
});

test('a row without editable cells is stepped over', () => {
    assertDeepEqual(findCellNavigationTarget(rows, 2, 'given', 1), { row: 4, field: 'given' });
    assertDeepEqual(findCellNavigationTarget(rows, 4, 'note', -1), { row: 2, field: 'note' });
});

test('into a divider row: the note column keeps to notes, the others reach the title', () => {
    assertDeepEqual(findCellNavigationTarget(rows, 1, 'given', -1), { row: 0, field: 'divider' });
    assertDeepEqual(findCellNavigationTarget(rows, 1, 'then', -1), { row: 0, field: 'divider' });
    assertDeepEqual(findCellNavigationTarget(rows, 1, 'note', -1), { row: 0, field: 'note' });
    assertDeepEqual(findCellNavigationTarget(rows, 4, 'note', 1), { row: 5, field: 'note' });
});

test('out of a divider row: the title enters Given, the note stays in notes', () => {
    assertDeepEqual(findCellNavigationTarget(rows, 0, 'divider', 1), { row: 1, field: 'given' });
    assertDeepEqual(findCellNavigationTarget(rows, 0, 'note', 1), { row: 1, field: 'note' });
    assertDeepEqual(findCellNavigationTarget([TEXT_DIVIDER, TEXT_DIVIDER], 0, 'divider', 1), { row: 1, field: 'divider' });
});

test('with the note column hidden, rows simply lack that cell', () => {
    const hidden = [['divider'], ['given', 'when', 'then'], ['given', 'when', 'then']];
    assertDeepEqual(findCellNavigationTarget(hidden, 1, 'then', 1), { row: 2, field: 'then' });
    assertDeepEqual(findCellNavigationTarget(hidden, 1, 'when', -1), { row: 0, field: 'divider' });
});

test('the table edge and an unknown cell give no target', () => {
    assertEqual(findCellNavigationTarget(rows, 0, 'divider', -1), null);
    assertEqual(findCellNavigationTarget(rows, 5, 'note', 1), null);
    assertEqual(findCellNavigationTarget(rows, 1, 'pass', 1), null);
});
