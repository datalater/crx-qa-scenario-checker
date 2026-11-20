import {
    checklistSearchTextMatches,
    countChecklistReplacements,
    countLiteralMatches,
    replaceInChecklist,
    replaceLiteral,
    createChecklistSearchSnippet,
    searchChecklist,
    tokenizeChecklistSearchQuery
} from '../modules/checklist-search-manager.js';
import { assert, assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('table search tokenizes unique case-insensitive keywords', () => {
    assertDeepEqual(tokenizeChecklistSearchQuery('  Password  RESET password '), ['password', 'reset']);
});

test('table search uses AND matching regardless of keyword order', () => {
    assertEqual(checklistSearchTextMatches('Reset the initial password', ['password', 'initial']), true);
    assertEqual(checklistSearchTextMatches('Reset the password', ['password', 'initial']), false);
});

test('table search finds the step cells, the note included', () => {
    const data = {
        steps: [
            { divider: 'Authentication' },
            {
                given: ['An initial password was issued'],
                when: ['The user signs in'],
                then: ['Show the reset page'],
                note: ['[Original specification](https://example.com/prd)', 'The original sentence must remain unchanged.']
            }
        ]
    };
    const given = searchChecklist(data, 'initial password');
    const note = searchChecklist(data, 'sentence unchanged');
    assertEqual(given.length, 1);
    assertEqual(given[0].field, 'given');
    assertEqual(note.length, 1);
    assertEqual(note[0].field, 'note');
    assertEqual(note[0].fieldLabel, 'Note');
    assertEqual(note[0].visibleStepNumber, 1);
});

test('table search can match keywords spread across the lines of one note', () => {
    const data = { steps: [{
        given: [], when: [], then: [],
        note: ['Password policy', 'Reset is mandatory.']
    }] };
    const results = searchChecklist(data, 'password mandatory');
    assertEqual(results.length, 1);
    assertEqual(results[0].field, 'note');
});

test('table search does not read the note panel data of older files', () => {
    const data = { steps: [{
        given: [], when: [], then: [],
        notes: [{ label: 'Password policy', blocks: [{ type: 'text', value: 'Reset is mandatory.' }] }]
    }] };
    assertEqual(searchChecklist(data, 'mandatory').length, 0);
});

test('table search snippet keeps the match and marks clipped edges', () => {
    const snippet = createChecklistSearchSnippet(`${'a'.repeat(100)} keyword ${'b'.repeat(100)}`, ['keyword'], 40);
    assert(snippet.includes('keyword'));
    assert(snippet.startsWith('…'));
    assert(snippet.endsWith('…'));
});

test('table search finds the note of a divider, under its section', () => {
    const data = { steps: [
        { divider: '#1 Login', note: ['[Figma](https://figma.com/a) whole flow'] },
        { given: ['a'], when: [], then: [] }
    ] };
    const results = searchChecklist(data, 'whole flow');
    assertEqual(results.length, 1);
    assertEqual(results[0].field, 'note');
    assertEqual(results[0].stepIndex, 0);
    assertEqual(results[0].visibleStepNumber, null);
});

const replaceData = () => ({ steps: [
    { divider: { value: 'Login cases', color: '#f85149' }, note: ['login overview'] },
    { given: ['Login page is open', '', 'the login form is empty'], when: [], then: ['Show error'], pass: true, note: ['LOGIN spec'] },
    { divider: true },
    { divider: { value: 'const login = 1;', type: 'code' } }
] });

test('replace matches the query as one phrase, whatever the letter case', () => {
    assertEqual(countLiteralMatches('Login, login and LOGIN', 'login'), 3);
    assertEqual(countLiteralMatches('reset the password', 'password reset'), 0);
    assertEqual(countLiteralMatches('a.b axb', 'a.b'), 1);
    assertEqual(countLiteralMatches('abc', '   '), 0);
    assertEqual(replaceLiteral('Login and login', ' login ', 'Sign in'), 'Sign in and Sign in');
});

test('a replacement is plain text, not a pattern', () => {
    assertEqual(replaceLiteral('price', 'price', '$& $1 $$'), '$& $1 $$');
    assertEqual(replaceLiteral('a (b) c', '(b)', '[b]'), 'a [b] c');
});

test('replace all reaches every cell, divider titles and their notes included', () => {
    const data = replaceData();
    assertEqual(countChecklistReplacements(data, 'login'), 6);
    assertEqual(replaceInChecklist(data, 'login', 'sign-in'), 6);
    assertEqual(data.steps[0].divider.value, 'sign-in cases');
    assertEqual(data.steps[0].divider.color, '#f85149', 'other divider attributes stay');
    assertDeepEqual(data.steps[0].note, ['sign-in overview']);
    assertDeepEqual(data.steps[1].given, ['sign-in page is open', '', 'the sign-in form is empty']);
    assertDeepEqual(data.steps[1].note, ['sign-in spec']);
    assertEqual(data.steps[1].pass, true);
    assertEqual(data.steps[2].divider, true, 'an empty divider has no text to replace');
    assertDeepEqual(data.steps[3].divider, { value: 'const sign-in = 1;', type: 'code' });
    assertEqual(countChecklistReplacements(data, 'login'), 0);
});

test('replace in one cell leaves the other cells alone', () => {
    const data = replaceData();
    const target = { stepIndex: 1, field: 'given' };
    assertEqual(countChecklistReplacements(data, 'login', target), 2);
    assertEqual(replaceInChecklist(data, 'login', 'x', target), 2);
    assertDeepEqual(data.steps[1].given, ['x page is open', '', 'the x form is empty']);
    assertDeepEqual(data.steps[1].note, ['LOGIN spec']);
    assertEqual(data.steps[0].divider.value, 'Login cases');
    assertEqual(replaceInChecklist(data, 'login', 'x', { stepIndex: 0, field: 'divider' }), 1);
    assertDeepEqual(data.steps[0].note, ['login overview']);
});

test('replacing with nothing removes the text, and an emptied note its key', () => {
    const data = { steps: [{ given: ['only this'], when: [], then: [], note: ['only this'] }] };
    assertEqual(replaceInChecklist(data, 'only this', ''), 2);
    assertDeepEqual(data.steps[0].given, []);
    assertEqual(Object.hasOwn(data.steps[0], 'note'), false);
});

test('data that is not text is never rewritten', () => {
    const data = { steps: [{ given: ['a'], when: [], then: [], notes: [{ label: 'a' }], note: [{ type: 'text', value: 'a' }] }] };
    assertEqual(replaceInChecklist(data, 'a', 'b'), 1);
    assertDeepEqual(data.steps[0].notes, [{ label: 'a' }]);
    assertDeepEqual(data.steps[0].note, [{ type: 'text', value: 'a' }]);
});
