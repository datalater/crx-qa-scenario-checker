import { getChecklistDividerTitle, isChecklistDividerStep } from './ui-renderer.js';

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
            // A text divider carries a note about its section.
            const note = normalizeStepField(step?.note);
            if (checklistSearchTextMatches(note, tokens)) {
                results.push({
                    stepIndex,
                    visibleStepNumber: null,
                    field: 'note',
                    fieldLabel: 'Note',
                    value: note,
                    snippet: createChecklistSearchSnippet(note, tokens)
                });
            }
            return;
        }

        visibleStepNumber += 1;
        ['given', 'when', 'then', 'note'].forEach((field) => {
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
    });

    return results;
}
