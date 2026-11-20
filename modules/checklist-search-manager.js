import { parseDivider, serializeDivider } from './divider-model.js';
import { toStepLines } from './step-lines.js';
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

// ---------- replace ----------

const STEP_FIELDS = ['given', 'when', 'then', 'note'];

/**
 * Replace works on the query as one phrase, letter case aside. Search itself
 * matches keywords in any order, so a cell can be a search result and still
 * hold nothing to replace.
 */
function literalPattern(query) {
    const phrase = typeof query === 'string' ? query.trim() : '';
    if (!phrase) return null;
    return new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
}

export function countLiteralMatches(value, query) {
    const pattern = literalPattern(query);
    return pattern ? [...String(value ?? '').matchAll(pattern)].length : 0;
}

/** The replacement is plain text: `$1` and `$&` mean nothing special. */
export function replaceLiteral(value, query, replacement) {
    const pattern = literalPattern(query);
    const text = String(value ?? '');
    return pattern ? text.replace(pattern, () => String(replacement ?? '')) : text;
}

// A cell holds text as lines; older or hand-written data may hold a string.
function readCellText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.join('\n');
    return null;
}

/** The cells replace can touch, as `{ stepIndex, field, text, write }`. */
function replaceableCells(data) {
    const cells = [];
    (Array.isArray(data?.steps) ? data.steps : []).forEach((step, stepIndex) => {
        const fields = isChecklistDividerStep(step) ? ['note'] : STEP_FIELDS;
        if (isChecklistDividerStep(step)) {
            const divider = parseDivider(step.divider);
            if (divider?.value) {
                cells.push({
                    stepIndex,
                    field: 'divider',
                    text: divider.value,
                    // Colour, type and the other attributes stay as they are.
                    write: (text) => { step.divider = serializeDivider({ ...divider, value: text }); }
                });
            }
        }
        fields.forEach((field) => {
            const text = readCellText(step?.[field]);
            if (text === null) return;
            cells.push({
                stepIndex,
                field,
                text,
                write: (next) => {
                    const lines = toStepLines(next);
                    // As when typing: an emptied note leaves no key behind.
                    if (field === 'note' && lines.length === 0) delete step.note;
                    else step[field] = lines;
                }
            });
        });
    });
    return cells;
}

const isTarget = (cell, target) => !target
    || (cell.stepIndex === target.stepIndex && cell.field === target.field);

/** How many places a replace would change, in one cell (`target`) or all. */
export function countChecklistReplacements(data, query, target = null) {
    return replaceableCells(data)
        .filter(cell => isTarget(cell, target))
        .reduce((total, cell) => total + countLiteralMatches(cell.text, query), 0);
}

/**
 * Replaces the phrase in place, in one cell (`target`) or in every cell, and
 * returns how many places changed.
 */
export function replaceInChecklist(data, query, replacement, target = null) {
    let replaced = 0;
    replaceableCells(data).forEach((cell) => {
        if (!isTarget(cell, target)) return;
        const count = countLiteralMatches(cell.text, query);
        if (count === 0) return;
        cell.write(replaceLiteral(cell.text, query, replacement));
        replaced += count;
    });
    return replaced;
}
