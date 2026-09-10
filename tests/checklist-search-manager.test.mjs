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

test('table search finds visible fields and hidden note contents', () => {
    const data = {
        steps: [
            { divider: 'Authentication' },
            {
                given: ['An initial password was issued'],
                when: ['The user signs in'],
                then: ['Show the reset page'],
                notes: [{
                    label: 'Original specification',
                    blocks: [{ type: 'text', value: 'The original sentence must remain unchanged.' }]
                }]
            }
        ]
    };
    const visible = searchChecklist(data, 'initial password');
    const hidden = searchChecklist(data, 'sentence unchanged');
    assertEqual(visible.length, 1);
    assertEqual(visible[0].field, 'given');
    assertEqual(hidden.length, 1);
    assertEqual(hidden[0].field, 'note');
    assertEqual(hidden[0].noteIndex, 0);
    assertEqual(hidden[0].blockIndex, 0);
});

test('table search resolves shared notes and preserves their row destination', () => {
    const data = {
        sharedNotes: {
            policy: { label: 'Policy', blocks: [{ type: 'code', value: 'forcePasswordReset();' }] }
        },
        steps: [
            { given: [], when: [], then: [], notes: [{ ref: 'policy' }] },
            { given: [], when: [], then: [], notes: [{ ref: 'policy' }] }
        ]
    };
    const results = searchChecklist(data, 'forcePasswordReset');
    assertEqual(results.length, 2);
    assertEqual(results[0].isShared, true);
    assertEqual(results[0].stepIndex, 0);
    assertEqual(results[1].stepIndex, 1);
});

test('table search can match keywords spread across one note', () => {
    const data = { steps: [{
        given: [], when: [], then: [],
        notes: [{ label: 'Password policy', blocks: [{ type: 'text', value: 'Reset is mandatory.' }] }]
    }] };
    const results = searchChecklist(data, 'password mandatory');
    assertEqual(results.length, 1);
    assertEqual(results[0].field, 'note');
});

test('table search snippet keeps the match and marks clipped edges', () => {
    const snippet = createChecklistSearchSnippet(`${'a'.repeat(100)} keyword ${'b'.repeat(100)}`, ['keyword'], 40);
    assert(snippet.includes('keyword'));
    assert(snippet.startsWith('…'));
    assert(snippet.endsWith('…'));
});
