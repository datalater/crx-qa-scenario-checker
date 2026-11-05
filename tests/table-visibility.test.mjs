import { shiftHiddenColumns } from '../src/table-visibility.js';
import { assertDeepEqual, test } from './lib/test-runner.mjs';

test('insert and delete preserve hidden columns by position', () => {
    assertDeepEqual(shiftHiddenColumns([0, 2], 1, 'insert'), [0, 3]);
    assertDeepEqual(shiftHiddenColumns([0, 2], 0, 'delete'), [1]);
    assertDeepEqual(shiftHiddenColumns([0, 2], 1, 'delete'), [0, 1]);
});
