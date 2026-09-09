import {
    NOTE_BLOCK_TYPES,
    NOTE_TONES,
    computeChecklistProgress,
    createEmptyNoteEntry,
    getChecklistNoteChips,
    getChecklistNotes,
    hasLegacyChecklistNoteShape,
    isSafeChecklistRefLink,
    normalizeNoteBlock,
    normalizeNoteEntry,
    normalizeNoteTone,
    serializeNotes
} from '../modules/ui-renderer.js';
import { buildRequiredScenarioWithDefaults } from '../modules/export-data-manager.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('block types are link, text, code (label is a note property)', () => {
    assertDeepEqual(NOTE_BLOCK_TYPES, ['link', 'text', 'code']);
    assertEqual(normalizeNoteBlock({ type: 'label', value: 'x' }), null);
});

test('a bare string block normalizes to text', () => {
    assertDeepEqual(normalizeNoteBlock('  hi  '), { type: 'text', value: 'hi' });
    assertEqual(normalizeNoteBlock('   '), null);
});

test('blocks with empty values are rejected', () => {
    assertEqual(normalizeNoteBlock({ type: 'text', value: '' }), null);
    assertEqual(normalizeNoteBlock({ type: 'code', value: '\n\n' }), null);
    assertEqual(normalizeNoteBlock({ type: 'nope', value: 'x' }), null);
});

test('code keeps indentation and lowercases lang', () => {
    const block = normalizeNoteBlock({ type: 'code', value: '  run();\n\n  ', lang: ' JS ' });
    assertEqual(block.value, '  run();');
    assertEqual(block.lang, 'js');
});

test('link label is optional', () => {
    assertDeepEqual(
        normalizeNoteBlock({ type: 'link', value: 'https://a.com', label: ' PRD ' }),
        { type: 'link', value: 'https://a.com', label: 'PRD' }
    );
});

test('a note keeps its label and blocks', () => {
    assertDeepEqual(
        normalizeNoteEntry({ label: '  AC-01  ', blocks: [{ type: 'text', value: 'memo' }] }),
        { label: 'AC-01', blocks: [{ type: 'text', value: 'memo' }] }
    );
});

test('a note with a label but no blocks is kept', () => {
    assertDeepEqual(normalizeNoteEntry({ label: 'AC-01', blocks: [] }), { label: 'AC-01', blocks: [] });
});

test('a note with neither label nor blocks is dropped', () => {
    assertEqual(normalizeNoteEntry({ label: '   ', blocks: [] }), null);
    assertEqual(normalizeNoteEntry({}), null);
    assertEqual(normalizeNoteEntry(null), null);
});

test('a bare string note becomes one unlabeled text note', () => {
    assertDeepEqual(
        normalizeNoteEntry('quick memo'),
        { label: '', blocks: [{ type: 'text', value: 'quick memo' }] }
    );
});

test('several notes per step are preserved in order', () => {
    const notes = getChecklistNotes({
        notes: [
            { label: 'origin', blocks: [{ type: 'link', value: 'https://a.com' }] },
            { label: 'rationale', blocks: [{ type: 'text', value: 'why' }] },
            { label: 'sample', blocks: [{ type: 'code', value: 'run()', lang: 'javascript' }] }
        ]
    });
    assertEqual(notes.length, 3);
    assertDeepEqual(notes.map(n => n.label), ['origin', 'rationale', 'sample']);
});

test('legacy string note is read as one note', () => {
    assertDeepEqual(
        getChecklistNotes({ note: 'plain memo' }),
        [{ label: '', blocks: [{ type: 'text', value: 'plain memo' }] }]
    );
});

test('legacy flat block list promotes its label block to the note label', () => {
    assertDeepEqual(
        getChecklistNotes({
            note: [
                { type: 'label', value: 'AC-02' },
                { type: 'text', value: 'memo' }
            ]
        }),
        [{ label: 'AC-02', blocks: [{ type: 'text', value: 'memo' }] }]
    );
});

test('legacy ref becomes one note per entry', () => {
    assertDeepEqual(
        getChecklistNotes({
            ref: [
                { slug: 'AC-01', link: 'https://a.com', text: 'original' },
                { slug: 'AC-02' }
            ]
        }),
        [
            {
                label: 'AC-01',
                blocks: [
                    { type: 'link', value: 'https://a.com' },
                    { type: 'text', value: 'original' }
                ]
            },
            { label: 'AC-02', blocks: [] }
        ]
    );
});

test('legacy shapes are detected for migration', () => {
    assertEqual(hasLegacyChecklistNoteShape({ ref: ['AC-01'] }), true);
    assertEqual(hasLegacyChecklistNoteShape({ note: 'x' }), true);
    assertEqual(hasLegacyChecklistNoteShape({ note: [{ type: 'text', value: 'x' }] }), true);
    assertEqual(hasLegacyChecklistNoteShape({ notes: [] }), false);
    assertEqual(hasLegacyChecklistNoteShape({}), false);
});

test('an empty note entry can be created for a new card', () => {
    assertDeepEqual(createEmptyNoteEntry(), { label: '', blocks: [] });
});

test('one chip per note, using its label', () => {
    const chips = getChecklistNoteChips({
        notes: [
            { label: 'origin', blocks: [{ type: 'link', value: 'https://a.com' }] },
            { label: 'rationale', blocks: [{ type: 'text', value: 'why' }] }
        ]
    });
    assertEqual(chips.length, 2);
    assertEqual(chips[0].label, 'origin');
    assertEqual(chips[0].hasLink, true);
    assertEqual(chips[0].noteIndex, 0);
    assertEqual(chips[1].label, 'rationale');
    assertEqual(chips[1].hasLink, false);
});

test('an unlabeled note falls back to link label, host, then index', () => {
    const withLinkLabel = getChecklistNoteChips({
        notes: [{ label: '', blocks: [{ type: 'link', value: 'https://a.com', label: 'PRD' }] }]
    });
    assertEqual(withLinkLabel[0].label, 'PRD');

    const withHost = getChecklistNoteChips({
        notes: [{ label: '', blocks: [{ type: 'link', value: 'https://www.example.com/x' }] }]
    });
    assertEqual(withHost[0].label, 'example.com');

    const withIndex = getChecklistNoteChips({
        notes: [{ label: '', blocks: [{ type: 'text', value: 'memo' }] }]
    });
    assertEqual(withIndex[0].label, 'Note 1');
});

test('unsafe link schemes are not marked as links', () => {
    const chips = getChecklistNoteChips({
        notes: [{ label: 'x', blocks: [{ type: 'link', value: 'javascript:alert(1)' }] }]
    });
    assertEqual(chips[0].hasLink, false);
    assertEqual(isSafeChecklistRefLink('javascript:alert(1)'), false);
    assertEqual(isSafeChecklistRefLink('https://example.com'), true);
});

test('a step without notes has no chips', () => {
    assertEqual(getChecklistNoteChips({}).length, 0);
    assertEqual(getChecklistNoteChips({ notes: [] }).length, 0);
});

test('serialize always writes label and blocks', () => {
    assertDeepEqual(
        serializeNotes([{ label: 'AC-01', blocks: [] }]),
        [{ label: 'AC-01', blocks: [] }]
    );
    const src = [{ blocks: [{ type: 'text', value: 'x' }] }];
    assertDeepEqual(serializeNotes(src), [{ label: '', blocks: [{ type: 'text', value: 'x' }] }]);
});

test('progress counts pass over total and excludes dividers', () => {
    const progress = computeChecklistProgress({
        steps: [{ divider: 'g' }, { pass: true }, { pass: false }, { pass: true }]
    });
    assertEqual(progress.total, 3);
    assertEqual(progress.passed, 2);
    assertEqual(progress.allPassed, false);
});

test('progress reports allPassed only when every step passes', () => {
    const all = computeChecklistProgress({ steps: [{ pass: true }, { divider: true }, { pass: true }] });
    assertEqual(all.allPassed, true);
    assertEqual(all.total, 2);
});

test('progress handles empty and invalid scenarios', () => {
    assertEqual(computeChecklistProgress({ steps: [] }).hasSteps, false);
    assertEqual(computeChecklistProgress(null).total, 0);
});

test('export normalization preserves notes', () => {
    const normalized = buildRequiredScenarioWithDefaults({
        scenario: 'demo',
        steps: [{
            given: ['a'], when: ['b'], then: ['c'], pass: false,
            notes: [{ label: 'AC-02', blocks: [{ type: 'code', value: 'run()', lang: 'javascript' }] }]
        }]
    });
    assertDeepEqual(normalized.steps[0].notes, [
        { label: 'AC-02', blocks: [{ type: 'code', value: 'run()', lang: 'javascript' }] }
    ]);
});

test('a newly added empty block survives while editing', () => {
    // Regression: +Text and +Code seeded an empty value, which the normalizer
    // dropped, so the new block never appeared in the panel.
    assertDeepEqual(
        normalizeNoteBlock({ type: 'text', value: '' }, { keepEmpty: true }),
        { type: 'text', value: '' }
    );
    assertDeepEqual(
        normalizeNoteBlock({ type: 'code', value: '', lang: 'javascript' }, { keepEmpty: true }),
        { type: 'code', value: '', lang: 'javascript' }
    );
    assertDeepEqual(
        normalizeNoteBlock({ type: 'link', value: '' }, { keepEmpty: true }),
        { type: 'link', value: '' }
    );
});

test('keepEmpty reaches the blocks of a note', () => {
    assertDeepEqual(
        normalizeNoteEntry(
            { label: 'AC-01', blocks: [{ type: 'text', value: '' }] },
            { keepEmpty: true }
        ),
        { label: 'AC-01', blocks: [{ type: 'text', value: '' }] }
    );
});

test('empty blocks stored under notes are read back for editing', () => {
    const notes = getChecklistNotes({
        notes: [{ label: 'AC-01', blocks: [{ type: 'text', value: '' }] }]
    });
    assertEqual(notes[0].blocks.length, 1);
    assertEqual(notes[0].blocks[0].value, '');
});

test('without keepEmpty an empty block is still dropped', () => {
    assertEqual(normalizeNoteBlock({ type: 'text', value: '' }), null);
    assertDeepEqual(
        normalizeNoteEntry({ label: 'AC-01', blocks: [{ type: 'text', value: '' }] }),
        { label: 'AC-01', blocks: [] }
    );
});

test('legacy shapes do not keep empty blocks', () => {
    assertDeepEqual(getChecklistNotes({ note: [{ type: 'text', value: '' }] }), []);
    assertDeepEqual(getChecklistNotes({ ref: [{ slug: 'AC-01', link: '', text: '' }] }), [
        { label: 'AC-01', blocks: [] }
    ]);
});

test('a chip exposes its link so the icon can navigate', () => {
    const chips = getChecklistNoteChips({
        notes: [{
            label: 'AC-02',
            blocks: [
                { type: 'text', value: 'memo' },
                { type: 'link', value: 'https://example.com/prd' }
            ]
        }]
    });
    assertEqual(chips[0].link, 'https://example.com/prd');
    assertEqual(chips[0].hasLink, true);
});

test('a chip without a link exposes an empty link', () => {
    const chips = getChecklistNoteChips({
        notes: [{ label: 'rationale', blocks: [{ type: 'text', value: 'why' }] }]
    });
    assertEqual(chips[0].link, '');
    assertEqual(chips[0].hasLink, false);
});

test('an unsafe scheme is never exposed as a navigable link', () => {
    ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox(1)', 'not a url']
        .forEach((value) => {
            const chips = getChecklistNoteChips({
                notes: [{ label: 'x', blocks: [{ type: 'link', value }] }]
            });
            assertEqual(chips[0].link, '');
            assertEqual(chips[0].hasLink, false);
        });
});

test('the first link block wins when a note has several', () => {
    const chips = getChecklistNoteChips({
        notes: [{
            label: 'x',
            blocks: [
                { type: 'link', value: 'https://first.com' },
                { type: 'link', value: 'https://second.com' }
            ]
        }]
    });
    assertEqual(chips[0].link, 'https://first.com');
});

test('tones are the five GFM alert kinds', () => {
    assertDeepEqual(NOTE_TONES, ['note', 'tip', 'important', 'warning', 'caution']);
});

test('a tone is normalized and validated against that set', () => {
    assertEqual(normalizeNoteTone('warning'), 'warning');
    assertEqual(normalizeNoteTone('  WARNING  '), 'warning');
    assertEqual(normalizeNoteTone('rust'), '');
    assertEqual(normalizeNoteTone(''), '');
    assertEqual(normalizeNoteTone(null), '');
    assertEqual(normalizeNoteTone(42), '');
});

test('a valid tone is kept on the note', () => {
    assertDeepEqual(
        normalizeNoteEntry({ label: 'x', tone: 'caution', blocks: [] }),
        { label: 'x', blocks: [], tone: 'caution' }
    );
});

test('an empty or unknown tone leaves no key behind', () => {
    assertDeepEqual(normalizeNoteEntry({ label: 'x', tone: '', blocks: [] }), { label: 'x', blocks: [] });
    assertDeepEqual(normalizeNoteEntry({ label: 'x', tone: 'rust', blocks: [] }), { label: 'x', blocks: [] });
    assertEqual('tone' in normalizeNoteEntry({ label: 'x', blocks: [] }), false);
});

test('serialize keeps a tone and omits it otherwise', () => {
    assertDeepEqual(
        serializeNotes([{ label: 'a', tone: 'tip', blocks: [] }, { label: 'b', blocks: [] }]),
        [{ label: 'a', tone: 'tip', blocks: [] }, { label: 'b', blocks: [] }]
    );
});

test('a chip reports its tone so the table can colour it', () => {
    const chips = getChecklistNoteChips({
        notes: [
            { label: 'plain', blocks: [] },
            { label: 'careful', tone: 'warning', blocks: [] }
        ]
    });
    assertEqual(chips[0].tone, '');
    assertEqual(chips[1].tone, 'warning');
});

test('a legacy note carries no tone', () => {
    assertEqual(getChecklistNoteChips({ note: 'plain memo' })[0].tone, '');
    assertEqual(getChecklistNoteChips({ ref: [{ slug: 'AC-01' }] })[0].tone, '');
});
