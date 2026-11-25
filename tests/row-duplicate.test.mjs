import { duplicateRows, duplicateStep } from '../modules/row-duplicate.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const steps = () => [
    { divider: '#1 a' },
    { id: 'r-1', given: ['g1'], when: ['w'], then: ['t'], pass: true, note: ['n'], pinned: true },
    { given: ['g2'], when: ['w'], then: ['t'], pass: false },
    { divider: { value: '#2 b', color: '#f85149' } },
    { given: ['g3'], when: ['w'], then: ['t'] }
];

test('a copy keeps the content and drops id, verdict and pin', () => {
    assertDeepEqual(duplicateStep(steps()[1]), { given: ['g1'], when: ['w'], then: ['t'], note: ['n'] });
    assertDeepEqual(duplicateStep(steps()[2]), { given: ['g2'], when: ['w'], then: ['t'] });
});

test('a copy shares nothing with its original', () => {
    const list = steps();
    const [at] = duplicateRows(list, [1]);
    list[at].given.push('changed');
    assertDeepEqual(list[1].given, ['g1']);
});

test('one row is copied right below itself', () => {
    const list = steps();
    assertDeepEqual(duplicateRows(list, [2]), [3]);
    assertEqual(list.length, 6);
    assertDeepEqual(list[3], { given: ['g2'], when: ['w'], then: ['t'] });
    assertDeepEqual(list[4], { divider: { value: '#2 b', color: '#f85149' } }, 'the rows below move down');
});

test('a divider is copied alone, not its section', () => {
    const list = steps();
    assertDeepEqual(duplicateRows(list, [3]), [4]);
    assertDeepEqual(list[4], { divider: { value: '#2 b', color: '#f85149' } });
    assertEqual(list.length, 6);
});

test('several rows are copied in order below the last of them', () => {
    const list = steps();
    assertDeepEqual(duplicateRows(list, [4, 1, 1]), [5, 6]);
    assertDeepEqual(list.slice(5).map(step => step.given?.[0] ?? step.divider), ['g1', 'g3']);
});

test('unknown rows are ignored', () => {
    const list = steps();
    assertDeepEqual(duplicateRows(list, [-1, 99, 1.5]), []);
    assertEqual(list.length, 5);
});
