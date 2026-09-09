import {
    createEmptyNoteEntry,
    getChecklistNotes,
    hasLegacyChecklistNoteShape,
    normalizeNoteEntry,
    serializeNotes
} from '../modules/ui-renderer.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

/**
 * Models the commit/refresh contract of the notes panel.
 *
 * Two regressions are guarded here:
 *   1. The panel keeps a focus check so a redraw never discards text being
 *      typed. Add/remove/move run while the clicked button owns focus inside
 *      the panel, so they must bypass that check.
 *   2. Every field saves on input, so closing the panel (including with
 *      Escape) cannot lose pending edits.
 */
function createPanelHarness(initialStep) {
    const state = {
        step: { ...initialStep },
        renderCount: 0,
        focusInsidePanel: false,
        renderedNotes: null
    };

    const renderStepDetailContents = () => {
        state.renderCount += 1;
        state.renderedNotes = getChecklistNotes(state.step);
    };

    const refreshStepDetailPanel = () => {
        if (state.focusInsidePanel) return;
        renderStepDetailContents();
    };

    const commitStepDetailNotes = (notes, options = {}) => {
        const { refreshPanel = false, keepEmpty = false } = options;
        const normalized = [];
        notes.forEach((note) => {
            const entry = normalizeNoteEntry(note);
            if (entry) normalized.push(entry);
            else if (keepEmpty) normalized.push(createEmptyNoteEntry());
        });

        if (hasLegacyChecklistNoteShape(state.step)) {
            delete state.step.ref;
            delete state.step.note;
        }
        if (normalized.length === 0) delete state.step.notes;
        else state.step.notes = serializeNotes(normalized);

        refreshStepDetailPanel();
        if (refreshPanel) renderStepDetailContents();
    };

    renderStepDetailContents();
    state.focusInsidePanel = true;
    state.renderCount = 0;

    return { state, commitStepDetailNotes };
}

test('adding a note repaints while the add button holds focus', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'AC-01', blocks: [] }]
    });
    const notes = getChecklistNotes(state.step);
    notes.push(createEmptyNoteEntry());

    commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });

    assertEqual(state.renderCount, 1);
    assertEqual(state.renderedNotes.length, 2);
});

test('deleting a note repaints and keeps the others', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [
            { label: 'AC-01', blocks: [] },
            { label: 'rationale', blocks: [{ type: 'text', value: 'why' }] }
        ]
    });
    const notes = getChecklistNotes(state.step);

    commitStepDetailNotes(notes.filter((_, i) => i !== 0), { refreshPanel: true });

    assertEqual(state.renderCount, 1);
    assertEqual(state.renderedNotes.length, 1);
    assertEqual(state.renderedNotes[0].label, 'rationale');
});

test('moving a note repaints and keeps the new order', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [
            { label: 'first', blocks: [] },
            { label: 'second', blocks: [] }
        ]
    });
    const notes = getChecklistNotes(state.step);
    const next = notes.map(item => ({ ...item }));
    const [moved] = next.splice(1, 1);
    next.splice(0, 0, moved);

    commitStepDetailNotes(next, { refreshPanel: true });

    assertEqual(state.renderCount, 1);
    assertDeepEqual(state.renderedNotes.map(n => n.label), ['second', 'first']);
});

test('deleting the last note repaints and drops the notes key', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'AC-01', blocks: [] }]
    });

    commitStepDetailNotes([], { refreshPanel: true });

    assertEqual(state.renderCount, 1);
    assertEqual(state.renderedNotes.length, 0);
    assertEqual('notes' in state.step, false);
});

test('label edits persist without repainting the panel', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'AC-01', blocks: [] }]
    });
    const notes = getChecklistNotes(state.step);

    commitStepDetailNotes(notes.map(n => ({ ...n, label: 'AC-02' })), { keepEmpty: true });

    assertEqual(state.renderCount, 0);
    assertEqual(state.step.notes[0].label, 'AC-02');
});

test('a partially typed code block is stored on every input', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'sample', blocks: [{ type: 'code', value: 'con', lang: 'javascript' }] }]
    });
    const notes = getChecklistNotes(state.step);

    // Simulates typing one more character; no blur happens.
    const next = notes.map(note => ({
        ...note,
        blocks: note.blocks.map(block => ({ ...block, value: 'const' }))
    }));
    commitStepDetailNotes(next, { keepEmpty: true });

    assertEqual(state.step.notes[0].blocks[0].value, 'const');
    assertEqual(state.renderCount, 0);
});

test('an empty new note survives a commit so its card stays visible', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'AC-01', blocks: [] }]
    });
    const notes = getChecklistNotes(state.step);
    notes.push(createEmptyNoteEntry());

    commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });

    assertEqual(state.step.notes.length, 2);
    assertDeepEqual(state.step.notes[1], { label: '', blocks: [] });
});

test('the first write folds legacy ref and note into notes', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        ref: [{ slug: 'AC-01', link: 'https://a.com' }],
        note: 'why it was converted'
    });
    const notes = getChecklistNotes(state.step);
    assertEqual(notes.length, 2);

    commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });

    assertEqual('ref' in state.step, false);
    assertEqual('note' in state.step, false);
    assertEqual(state.step.notes.length, 2);
    assertEqual(state.step.notes[0].label, 'AC-01');
});

test('panel repaints on commit when focus sits outside the panel', () => {
    const { state, commitStepDetailNotes } = createPanelHarness({
        notes: [{ label: 'AC-01', blocks: [] }]
    });
    state.focusInsidePanel = false;

    commitStepDetailNotes([
        { label: 'AC-01', blocks: [] },
        { label: 'AC-02', blocks: [] }
    ]);

    assertEqual(state.renderCount, 1);
    assertEqual(state.renderedNotes.length, 2);
});

/** Mirrors pruneEmptyStepDetailEntries, which runs when the panel closes. */
function pruneEmptyEntries(step) {
    if (!Array.isArray(step.notes)) return;
    const pruned = [];
    step.notes.forEach((note) => {
        const entry = normalizeNoteEntry(note);
        if (entry) pruned.push(entry);
    });
    if (pruned.length === 0) delete step.notes;
    else step.notes = serializeNotes(pruned);
}

test('closing the panel drops blocks left empty', () => {
    const step = {
        notes: [{
            label: 'AC-01',
            blocks: [
                { type: 'text', value: 'kept' },
                { type: 'text', value: '' }
            ]
        }]
    };

    pruneEmptyEntries(step);

    assertEqual(step.notes[0].blocks.length, 1);
    assertEqual(step.notes[0].blocks[0].value, 'kept');
});

test('closing the panel drops a note left completely empty', () => {
    const step = {
        notes: [
            { label: 'AC-01', blocks: [] },
            { label: '', blocks: [{ type: 'text', value: '' }] }
        ]
    };

    pruneEmptyEntries(step);

    assertEqual(step.notes.length, 1);
    assertEqual(step.notes[0].label, 'AC-01');
});

test('closing the panel removes the notes key when nothing is left', () => {
    const step = { notes: [{ label: '', blocks: [{ type: 'code', value: '' }] }] };

    pruneEmptyEntries(step);

    assertEqual('notes' in step, false);
});

test('closing the panel keeps a label-only note', () => {
    const step = { notes: [{ label: 'AC-01', blocks: [] }] };

    pruneEmptyEntries(step);

    assertDeepEqual(step.notes, [{ label: 'AC-01', blocks: [] }]);
});
