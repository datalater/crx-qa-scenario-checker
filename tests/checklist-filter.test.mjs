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
    { given: [], when: [], then: [], pass: false, notes: [{ label: 'q', tone: 'caution', blocks: [] }] },
    { given: [], when: [], then: [], pass: false, notes: [{ label: 'c', tone: 'tip', blocks: [] }] },
    { divider: 'B' },
    { given: [], when: [], then: [], pass: false, notes: [{ label: 'plain', blocks: [] }] },
    { divider: 'C' },
    { given: [], when: [], then: [], pass: false, notes: [{ label: 'q2', tone: 'caution', blocks: [] }] }
];

test('filters are all, outline, and the five tones', () => {
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

test('a tone filter keeps the steps carrying that tone', () => {
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

test('a step matches a tone only through its notes', () => {
    const step = { notes: [{ label: 'x', tone: 'warning', blocks: [] }] };
    assertEqual(stepMatchesChecklistFilter(step, 'warning'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'caution'), false);
    assertEqual(stepMatchesChecklistFilter(step, 'all'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'outline'), false);
});

test('a step with no note matches only all', () => {
    const step = { given: [], when: [], then: [], pass: false };
    assertEqual(stepMatchesChecklistFilter(step, 'all'), true);
    assertEqual(stepMatchesChecklistFilter(step, 'tip'), false);
});

test('a legacy note carries no tone, so tone filters skip it', () => {
    assertEqual(stepMatchesChecklistFilter({ note: 'memo' }, 'note'), false);
    assertEqual(stepMatchesChecklistFilter({ note: 'memo' }, 'all'), true);
});

test('a filter matching nothing hides every row', () => {
    const plain = [{ divider: 'A' }, { given: [], when: [], then: [], pass: false }];
    assertEqual(buildChecklistVisibility(plain, 'caution').some(Boolean), false);
});

test('visibility handles an empty or invalid step list', () => {
    assertDeepEqual(buildChecklistVisibility([], 'all'), []);
    assertDeepEqual(buildChecklistVisibility(null, 'caution'), []);
});
