import fs from 'node:fs';
import vm from 'node:vm';
import * as UI from '../modules/ui-renderer.js';
import { buildExportPayload } from '../modules/export-data-manager.js';
import { test, assertEqual, assertDeepEqual } from './lib/test-runner.mjs';

const fixture = () => ({ sharedNotes: { id: { label: 'ID field', tone: 'tip', blocks: [{ type: 'code', lang: 'typescript', value: 'initial' }] } }, steps: [{ notes: [{ ref: 'id' }] }, { notes: [{ ref: 'id' }] }] });

test('shared notes resolve through the scenario and serialize as references only', () => {
    const data = fixture();
    const notes = UI.getChecklistNotes(data.steps[0], data);
    assertEqual(notes[0].label, 'ID field');
    assertDeepEqual(UI.serializeNotes(notes), [{ ref: 'id' }]);
    assertEqual(UI.getChecklistNoteChips(data.steps[0], data)[0].label, '🔗 ID field');
});

test('missing references remain visible and survive serialization', () => {
    const notes = UI.getChecklistNotes({ notes: [{ ref: 'missing' }] }, {});
    assertEqual(notes[0].missing, true);
    assertEqual(notes[0].tone, 'caution');
    assertDeepEqual(UI.serializeNotes(notes), [{ ref: 'missing' }]);
});

test('shared note tone and identity filters resolve definitions and retain headings', () => {
    const data = fixture();
    data.steps.unshift({ divider: 'Fields' });
    data.steps.push({ notes: [{ label: 'Unrelated', blocks: [] }] });
    assertDeepEqual(UI.buildChecklistVisibility(data.steps, 'shared:id', data), [true, true, true, false]);
    assertDeepEqual(UI.buildChecklistVisibility(data.steps, 'tip', data), [true, true, true, false]);
    assertEqual(UI.normalizeChecklistFilter('shared:CaseSensitive'), 'shared:CaseSensitive');
});

test('selected-field export carries the definitions needed by exported references', () => {
    const data = fixture();
    const payload = buildExportPayload({
        workspace: { folders: [], files: [{ name: 'fake.json', content: JSON.stringify(data) }] },
        preferences: { mode: 'custom', customFields: [] },
        exportFormat: 'test', workspaceVersion: 1,
        requiredExportFields: ['steps.notes'], exportModeCustom: 'custom',
        nowIso: () => 'test', parseJson: JSON.parse, canonicalizeFieldPath: path => path
    });
    assertDeepEqual(payload.files[0].data.sharedNotes, data.sharedNotes);
    assertDeepEqual(payload.files[0].data.steps[0].notes, [{ ref: 'id' }]);
});

test('merge appends blocks, preserves shared metadata and replaces local with a ref', () => {
    const data = fixture();
    data.steps[0].notes = [{ label: 'Local', tone: 'warning', blocks: [{ type: 'text', value: 'Additional knowledge' }] }];
    assertEqual(UI.mergeLocalNoteIntoShared(data.steps[0], data, 0, 'id'), true);
    assertEqual(data.sharedNotes.id.label, 'ID field');
    assertEqual(data.sharedNotes.id.tone, 'tip');
    assertDeepEqual(data.sharedNotes.id.blocks.map(block => block.value), ['initial', 'Additional knowledge']);
    assertDeepEqual(data.steps[0].notes, [{ ref: 'id' }]);
    assertEqual(UI.getChecklistNotes(data.steps[1], data)[0].blocks.length, 2);
});

test('merge avoids duplicate links and rejects a missing target without modifying data', () => {
    const data = fixture();
    data.steps[0].notes.push({ label: 'Local', blocks: [{ type: 'text', value: 'More' }] });
    const before = JSON.stringify(data);
    assertEqual(UI.mergeLocalNoteIntoShared(data.steps[0], data, 1, 'missing'), false);
    assertEqual(JSON.stringify(data), before);
    assertEqual(UI.mergeLocalNoteIntoShared(data.steps[0], data, 1, 'id'), true);
    assertDeepEqual(data.steps[0].notes, [{ ref: 'id' }]);
    assertEqual(data.sharedNotes.id.blocks.length, 2);
});

test('shared merge appends blocks and redirects every source link without duplicates', () => {
    const local = { label: 'Local', blocks: [] };
    const data = { sharedNotes: {
        a: { label: 'Source', tone: 'warning', blocks: [{ type: 'text', value: 'A' }] },
        b: { label: 'Target', tone: 'tip', blocks: [{ type: 'code', value: 'B' }] }
    }, steps: [
        { notes: [{ ref: 'a' }, local, { ref: 'b' }] },
        { notes: [{ ref: 'a' }] },
        { notes: [{ ref: 'b' }] }
    ] };
    assertEqual(UI.mergeSharedNotes(data, 'a', 'b'), true);
    assertEqual(data.sharedNotes.a, undefined);
    assertEqual(data.sharedNotes.b.label, 'Target');
    assertEqual(data.sharedNotes.b.tone, 'tip');
    assertDeepEqual(data.sharedNotes.b.blocks.map(block => block.value), ['B', 'A']);
    assertDeepEqual(data.steps.map(step => step.notes), [[{ ref: 'b' }, local], [{ ref: 'b' }], [{ ref: 'b' }]]);
});

test('shared merge supports unused sources and refuses self or missing targets', () => {
    const data = fixture();
    const before = JSON.stringify(data);
    assertEqual(UI.mergeSharedNotes(data, 'id', 'id'), false);
    assertEqual(UI.mergeSharedNotes(data, 'id', 'missing'), false);
    assertEqual(JSON.stringify(data), before);
    data.sharedNotes.unused = { label: 'Unused', blocks: [{ type: 'text', value: 'Design' }] };
    assertEqual(UI.mergeSharedNotes(data, 'unused', 'id'), true);
    assertEqual(data.sharedNotes.unused, undefined);
    assertEqual(data.sharedNotes.id.blocks.length, 2);
});

// Execute the real production persistence handler, rather than duplicating it.
const source = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const commitSource = source.slice(source.indexOf('function commitStepDetailNotes('), source.indexOf('function renderStepDetailContents('));
test('active note moves between cards and table chips without repainting editors', () => {
    const makeNode = () => ({ active: false, classList: { toggle(_name, value) { this.owner.active = value; } } });
    const cards = [makeNode(), makeNode()];
    const chips = [makeNode(), makeNode()];
    [...cards, ...chips].forEach(node => { node.classList.owner = node; });
    const ctx = vm.createContext({
        EL: { stepDetailNotes: { querySelectorAll: () => cards }, checklistBody: { querySelectorAll: () => chips } },
        stepDetailActiveNote: null
    });
    vm.runInContext(source.slice(source.indexOf('function setActiveStepDetailNote('), source.indexOf('function buildNoteCard(')), ctx);
    ctx.setActiveStepDetailNote(0);
    assertDeepEqual(cards.map(node => node.active), [true, false]);
    ctx.setActiveStepDetailNote(1);
    assertDeepEqual(cards.map(node => node.active), [false, true]);
    assertDeepEqual(chips.map(node => node.active), [false, true]);
    assertEqual(ctx.stepDetailActiveNote, 1);
});

function harness(data) {
    const context = vm.createContext({ UI, currentData: data, getStepDetailTarget: () => data.steps[0], syncToEditor() {}, renderChecklist() {}, renderStepDetailContents() {} });
    vm.runInContext(commitSource, context);
    return context;
}

test('production commit updates the singleton while all rows keep their refs', () => {
    const data = fixture();
    const ctx = harness(data);
    const notes = UI.getChecklistNotes(data.steps[0], data);
    notes[0].label = 'IdField';
    notes[0].blocks[0].value = 'updated pseudo code';
    ctx.commitStepDetailNotes(notes, { keepEmpty: true });
    assertDeepEqual(data.steps.map(step => step.notes), [[{ ref: 'id' }], [{ ref: 'id' }]]);
    assertEqual(UI.getChecklistNotes(data.steps[1], data)[0].blocks[0].value, 'updated pseudo code');
    assertEqual(data.sharedNotes.id.label, 'IdField');
});

test('unlink and detach leave shared definitions and sibling rows intact', () => {
    const data = fixture();
    const ctx = harness(data);
    const { ref, missing, ...local } = UI.getChecklistNotes(data.steps[0], data)[0];
    ctx.commitStepDetailNotes([local], { keepEmpty: true });
    assertEqual(data.steps[0].notes[0].ref, undefined);
    assertEqual(data.steps[1].notes[0].ref, 'id');
    ctx.commitStepDetailNotes([]);
    assertEqual(data.steps[0].notes, undefined);
    assertEqual(data.sharedNotes.id.label, 'ID field');
});

test('production commit preserves broken links without creating fake definitions', () => {
    const data = { steps: [{ notes: [{ ref: 'missing' }] }] };
    harness(data).commitStepDetailNotes(UI.getChecklistNotes(data.steps[0], data));
    assertDeepEqual(data.steps[0].notes, [{ ref: 'missing' }]);
    assertEqual(data.sharedNotes, undefined);
});
