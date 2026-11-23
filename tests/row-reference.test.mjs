import {
    buildReferenceFilePath,
    buildRowReference,
    ensureRowIds,
    expandRowSelection,
    nextRowSelection
} from '../modules/row-reference.js';
import { assert, assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const steps = () => [
    { divider: '#1 로그인' },
    { given: ['a'], when: [], then: ['1'], pass: false },
    { given: ['b'], when: [], then: ['2'], pass: true, id: 'r-keep' },
    { divider: { value: '#2 가입', color: '#f85149' } },
    { given: ['c'], when: [], then: ['3'], pass: false, note: ['메모'] },
    { divider: true },
    { given: ['d'], when: [], then: ['4'], pass: false }
];

const picked = selection => [...selection.selected].sort((a, b) => a - b);

test('a plain click selects one row, a toggle adds and removes', () => {
    let selection = nextRowSelection(null, 2, {}, [0, 1, 2, 4]);
    assertDeepEqual(picked(selection), [2]);
    selection = nextRowSelection(selection, 4, { toggle: true }, [0, 1, 2, 4]);
    assertDeepEqual(picked(selection), [2, 4]);
    selection = nextRowSelection(selection, 2, { toggle: true }, [0, 1, 2, 4]);
    assertDeepEqual(picked(selection), [4]);
    assertDeepEqual(picked(nextRowSelection(selection, 1, {}, [0, 1, 2, 4])), [1]);
});

test('a range runs from the anchor over the rows as displayed, in either direction', () => {
    const order = [0, 1, 2, 4, 6];
    const from = nextRowSelection(null, 1, {}, order);
    assertDeepEqual(picked(nextRowSelection(from, 6, { range: true }, order)), [1, 2, 4, 6]);
    const back = nextRowSelection(nextRowSelection(null, 4, {}, order), 1, { range: true }, order);
    assertDeepEqual(picked(back), [1, 2, 4]);
    assertEqual(back.anchor, 4, 'the anchor stays, so the range can be adjusted');
    assertDeepEqual(picked(nextRowSelection(back, 6, { range: true }, order)), [4, 6]);
});

test('a range without a usable anchor is a plain click', () => {
    assertDeepEqual(picked(nextRowSelection(null, 2, { range: true }, [1, 2])), [2]);
    assertDeepEqual(picked(nextRowSelection({ selected: new Set([9]), anchor: 9 }, 2, { range: true }, [1, 2])), [2]);
});

test('a selected divider stands for the steps of its section', () => {
    assertDeepEqual(expandRowSelection(steps(), [0]), [1, 2]);
    assertDeepEqual(expandRowSelection(steps(), [3, 1]), [1, 4]);
    assertDeepEqual(expandRowSelection(steps(), [0, 1, 2]), [1, 2]);
    assertDeepEqual(expandRowSelection(steps(), [5, 99]), [6]);
    assertDeepEqual(expandRowSelection(steps(), []), []);
});

test('only rows without an id get one, and ids never repeat in a file', () => {
    const list = steps();
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const changed = ensureRowIds(list, [1, 2, 4], () => values.shift() ?? 0.9);
    assertEqual(changed, true);
    assertEqual(list[1].id, 'r-aaaa');
    assertEqual(list[2].id, 'r-keep');
    assertEqual(list[4].id, 'r-ssss', 'the repeated id was drawn again');
    assertEqual(Object.hasOwn(list[6], 'id'), false, 'rows that are not referenced stay untouched');
    assertEqual(ensureRowIds(list, [1, 2, 4]), false);
});

test('a reference carries the rows, their section and number, and where they live', () => {
    const data = { scenario: '로그인 시나리오', steps: steps() };
    ensureRowIds(data.steps, [2, 4], () => 0);
    const reference = buildRowReference({ data, indexes: [2, 4], file: 'root/login.json' });
    assertDeepEqual(reference, {
        qsc: 'rows',
        file: 'root/login.json',
        scenario: '로그인 시나리오',
        rows: [
            { id: 'r-keep', number: 2, section: '#1 로그인', given: ['b'], when: [], then: ['2'], pass: true },
            { id: 'r-aaaa', number: 3, section: '#2 가입', given: ['c'], when: [], then: ['3'], pass: false, note: ['메모'] }
        ]
    });
    assert(JSON.stringify(reference).length > 0);
});

test('a row before any divider, or after an empty one, has the section it is shown under', () => {
    const data = { steps: [{ given: ['x'], when: [], then: [], id: 'r-1' }, ...steps()] };
    const reference = buildRowReference({ data, indexes: [0, 7], file: '' });
    assertEqual(reference.rows[0].section, '');
    assertEqual(reference.rows[1].section, 'divider');
    assertEqual(reference.scenario, '');
});

test('the file path uses the real root when it is known, else the folder name', () => {
    assertEqual(buildReferenceFilePath({ rootPath: '/Users/me/qa/', rootName: 'qa', path: 'a/b.json' }), '/Users/me/qa/a/b.json');
    assertEqual(buildReferenceFilePath({ rootName: 'qa', path: 'a/b.json' }), 'qa/a/b.json');
    assertEqual(buildReferenceFilePath({ path: 'b.json' }), 'b.json');
});

test('a second plain click on the only selected row clears the selection', () => {
    const once = nextRowSelection(null, 2, {}, [1, 2, 3]);
    const twice = nextRowSelection(once, 2, {}, [1, 2, 3]);
    assertDeepEqual(picked(twice), []);
    assertEqual(twice.anchor, null);
    assertDeepEqual(picked(nextRowSelection(twice, 2, {}, [1, 2, 3])), [2], 'a third click selects it again');
});

test('a plain click on one of several selected rows keeps that row alone', () => {
    const several = nextRowSelection(nextRowSelection(null, 1, {}, [1, 2, 3]), 3, { toggle: true }, [1, 2, 3]);
    assertDeepEqual(picked(nextRowSelection(several, 3, {}, [1, 2, 3])), [3]);
});
