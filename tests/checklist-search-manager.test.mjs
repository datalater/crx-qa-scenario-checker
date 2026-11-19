import {
    checklistSearchTextMatches,
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
