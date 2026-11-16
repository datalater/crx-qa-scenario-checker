import {
    CHECKLIST_FILTERS,
    buildChecklistVisibility,
    isChecklistDividerStep,
    normalizeChecklistFilter,
    stepMatchesChecklistFilter
} from '../modules/ui-renderer.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const scenario = [
    { divider: 'A' },
    { given: [], when: [], then: [], pass: false, note: ['`[!caution]` q'] },
    { given: [], when: [], then: ['`[!tip]` c'], pass: false },
    { divider: 'B' },
    { given: [], when: [], then: [], pass: false, note: ['plain'] },
    { divider: 'C' },
    { given: ['`[!CAUTION]` q2'], when: [], then: [], pass: false }
];

test('filters are all, outline, and the five alerts', () => {
    assertDeepEqual(CHECKLIST_FILTERS, ['all', 'outline', 'note', 'tip', 'important', 'warning', 'caution']);
});

test('an unknown filter falls back to all', () => {
    assertEqual(normalizeChecklistFilter('nope'), 'all');
    assertEqual(normalizeChecklistFilter(''), 'all');
    assertEqual(normalizeChecklistFilter(null), 'all');
    assertEqual(normalizeChecklistFilter('  CAUTION  '), 'caution');
});

test('all keeps every row', () => {
    assertEqual(buildChecklistVisibility(scenario, 'all').filter(Boolean).length, scenario.length);
});

test('outline keeps only the dividers, as a table of contents', () => {
    const visible = buildChecklistVisibility(scenario, 'outline');
    assertEqual(visible.filter(Boolean).length, 3);
    scenario.forEach((step, i) => {
        assertEqual(visible[i], isChecklistDividerStep(step));
    });
});

test('an alert filter keeps the steps carrying that alert token', () => {
    const visible = buildChecklistVisibility(scenario, 'caution');
    assertEqual(visible[1], true);
    assertEqual(visible[2], false);
    assertEqual(visible[4], false);
    assertEqual(visible[6], true);
});

test('a divider survives only when its section still has a row', () => {
    const visible = buildChecklistVisibility(scenario, 'caution');
    assertEqual(visible[0], true, 'A has a caution step');
    assertEqual(visible[3], false, 'B has none, so its heading is dropped');
    assertEqual(visible[5], true, 'C has one');
});

test('a step matches an alert through a token in any of its cells', () => {
    const step = { given: [], when: [], then: [], note: ['see `[!warning]` below'] };
    assertEqual(stepMatchesChecklistFilter(step, 'warning'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'caution'), false);
    assertEqual(stepMatchesChecklistFilter(step, 'all'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'outline'), false);
    assertEqual(stepMatchesChecklistFilter({ when: ['`[!tip]`'] }, 'tip'), true);
});

test('a step with no alert token matches only all', () => {
    const step = { given: [], when: [], then: [], pass: false, note: ['warning: memo'] };
    assertEqual(stepMatchesChecklistFilter(step, 'all'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'warning'), false);
});

test('the note panel data of older files is not read', () => {
    const step = { notes: [{ label: 'x', tone: 'warning', blocks: [] }] };
    assertEqual(stepMatchesChecklistFilter(step, 'warning'), false);
});

test('a filter matching nothing hides every row', () => {
    const plain = [{ divider: 'A' }, { given: [], when: [], then: [], pass: false }];
    assertEqual(buildChecklistVisibility(plain, 'caution').some(Boolean), false);
});

test('visibility handles an empty or invalid step list', () => {
    assertDeepEqual(buildChecklistVisibility([], 'all'), []);
    assertDeepEqual(buildChecklistVisibility(null, 'caution'), []);
});
