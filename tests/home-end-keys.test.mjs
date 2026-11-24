import { textareaEdgeSelection } from '../modules/home-end-keys.js';
import { assertDeepEqual, test } from './lib/test-runner.mjs';

const at = (start, end = start, direction = 'none') => ({ start, end, direction, length: 20 });

test('Home and End put the caret at the very start and the very end', () => {
    assertDeepEqual(textareaEdgeSelection(at(7), true, false), [0, 0, 'none']);
    assertDeepEqual(textareaEdgeSelection(at(7), false, false), [20, 20, 'none']);
    assertDeepEqual(textareaEdgeSelection(at(3, 9), true, false), [0, 0, 'none'], 'a selection is dropped');
});

test('with Shift the selection reaches the edge from where it was started', () => {
    assertDeepEqual(textareaEdgeSelection(at(7), true, true), [0, 7, 'backward']);
    assertDeepEqual(textareaEdgeSelection(at(7), false, true), [7, 20, 'forward']);
    assertDeepEqual(textareaEdgeSelection(at(3, 9, 'forward'), true, true), [0, 3, 'backward']);
    assertDeepEqual(textareaEdgeSelection(at(3, 9, 'backward'), false, true), [9, 20, 'forward']);
    assertDeepEqual(textareaEdgeSelection(at(3, 9, 'backward'), true, true), [0, 9, 'backward']);
});
