import { getChecklistDividerTitle, getChecklistNotes, isChecklistDividerStep } from './ui-renderer.js';

export function tokenizeChecklistSearchQuery(query) {
    if (typeof query !== 'string') return [];
    return [...new Set(query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean))];
}

export function checklistSearchTextMatches(value, tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) return false;
    const text = String(value ?? '').toLocaleLowerCase();
    return tokens.every(token => text.includes(token));
}

export function createChecklistSearchSnippet(value, tokens, maxLength = 120) {
    const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (!text || text.length <= maxLength) return text;
    const lower = text.toLocaleLowerCase();
    const positions = tokens
        .map(token => lower.indexOf(token))
        .filter(position => position >= 0);
    const anchor = positions.length ? Math.min(...positions) : 0;
    const half = Math.floor(maxLength / 2);
    const start = Math.max(0, Math.min(anchor - half, text.length - maxLength));
    const end = Math.min(text.length, start + maxLength);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function normalizeStepField(value) {
    if (Array.isArray(value)) return value.map(item => String(item ?? '')).join('\n');
    return String(value ?? '');
}

function findBestNoteSegment(note, tokens) {
    const segments = [
        { value: note.label || '', blockIndex: null, blockType: 'label' },
        ...(note.blocks || []).flatMap((block, blockIndex) => [
            { value: block.value || '', blockIndex, blockType: block.type || 'text' },
            ...(block.label ? [{ value: block.label, blockIndex, blockType: 'link-label' }] : [])
        ])
    ].filter(segment => segment.value);

    let best = segments[0] || { value: '', blockIndex: null, blockType: 'note' };
    let bestScore = -1;
    segments.forEach((segment) => {
        const lower = segment.value.toLocaleLowerCase();
        const score = tokens.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
        if (score > bestScore) {
            best = segment;
            bestScore = score;
        }
    });
    return best;
}

export function searchChecklist(data, query) {
    const tokens = tokenizeChecklistSearchQuery(query);
    if (tokens.length === 0 || !Array.isArray(data?.steps)) return [];

    const results = [];
    let visibleStepNumber = 0;
    data.steps.forEach((step, stepIndex) => {
        if (isChecklistDividerStep(step)) {
            const value = getChecklistDividerTitle(step);
            if (checklistSearchTextMatches(value, tokens)) {
                results.push({
                    stepIndex,
                    visibleStepNumber: null,
                    field: 'divider',
                    fieldLabel: 'Divider',
                    value,
                    snippet: createChecklistSearchSnippet(value, tokens)
                });
            }
            return;
        }

        visibleStepNumber += 1;
        ['given', 'when', 'then'].forEach((field) => {
            const value = normalizeStepField(step?.[field]);
            if (!checklistSearchTextMatches(value, tokens)) return;
            results.push({
                stepIndex,
                visibleStepNumber,
                field,
                fieldLabel: field[0].toUpperCase() + field.slice(1),
                value,
                snippet: createChecklistSearchSnippet(value, tokens)
            });
        });

        getChecklistNotes(step, data).forEach((note, noteIndex) => {
            const values = [note.label || ''];
            (note.blocks || []).forEach((block) => {
                values.push(block.value || '');
                if (block.label) values.push(block.label);
            });
            if (!checklistSearchTextMatches(values.join('\n'), tokens)) return;
            const segment = findBestNoteSegment(note, tokens);
            results.push({
                stepIndex,
                visibleStepNumber,
                field: 'note',
                fieldLabel: 'Note',
                noteIndex,
                noteLabel: note.label || `Note ${noteIndex + 1}`,
                blockIndex: segment.blockIndex,
                blockType: segment.blockType,
                isShared: typeof note.ref === 'string',
                value: segment.value,
                snippet: createChecklistSearchSnippet(segment.value, tokens)
            });
        });
    });

    return results;
}
