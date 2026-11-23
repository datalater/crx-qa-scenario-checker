/**
 * Selecting several rows of the table and copying them as a reference: a JSON
 * snapshot of the rows together with where they live (the scenario file and
 * each row's id). Whoever receives it can read the snapshot right away and,
 * later, look the same rows up in the file to see how they have changed.
 */
import { getDividerTitle, isDivider } from './divider-model.js';

export const ROW_REFERENCE_KIND = 'rows';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 4;

/**
 * The selection after a click on the row `index`.
 *   plain click   that row alone; on the only selected row, nothing selected
 *   toggle        adds or removes that row (Cmd/Ctrl)
 *   range         every row from the anchor to that row, in display order (Shift)
 * `order` lists the visible rows as they are displayed.
 */
export function nextRowSelection(selection, index, { toggle = false, range = false } = {}, order = []) {
    const selected = new Set(selection?.selected || []);
    const anchor = selection?.anchor ?? null;

    if (range && anchor !== null && order.includes(anchor) && order.includes(index)) {
        const from = order.indexOf(anchor);
        const to = order.indexOf(index);
        return { selected: new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1)), anchor };
    }
    if (toggle) {
        if (selected.has(index)) selected.delete(index);
        else selected.add(index);
        return { selected, anchor: index };
    }
    // A second click on the one selected row lets go of it.
    if (selected.size === 1 && selected.has(index)) return { selected: new Set(), anchor: null };
    return { selected: new Set([index]), anchor: index };
}

/**
 * The step rows a selection stands for, in file order. A selected divider
 * stands for its whole section: every step down to the next divider.
 */
export function expandRowSelection(steps, indexes) {
    const list = Array.isArray(steps) ? steps : [];
    const rows = new Set();
    [...indexes].forEach((index) => {
        const step = list[index];
        if (!step) return;
        if (!isDivider(step.divider)) {
            rows.add(index);
            return;
        }
        for (let i = index + 1; i < list.length && !isDivider(list[i]?.divider); i += 1) rows.add(i);
    });
    return [...rows].sort((a, b) => a - b);
}

function createRowId(taken, random) {
    for (;;) {
        let id = 'r-';
        for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
        if (!taken.has(id)) return id;
    }
}

/**
 * Gives an id to each of the rows that has none, in place, and returns
 * whether anything changed. Only referenced rows get one: a position shifts
 * when a row is inserted above, an id does not.
 */
export function ensureRowIds(steps, indexes, random = Math.random) {
    const taken = new Set(steps.map(step => step?.id).filter(id => typeof id === 'string' && id));
    let changed = false;
    indexes.forEach((index) => {
        const step = steps[index];
        if (!step || (typeof step.id === 'string' && step.id)) return;
        step.id = createRowId(taken, random);
        taken.add(step.id);
        changed = true;
    });
    return changed;
}

/** The title of the section each row belongs to, and its number among the steps. */
function describeRows(steps) {
    const described = new Map();
    let section = '';
    let number = 0;
    steps.forEach((step, index) => {
        if (isDivider(step?.divider)) {
            section = getDividerTitle(step.divider);
            return;
        }
        number += 1;
        described.set(index, { section, number });
    });
    return described;
}

/**
 * The reference for the rows at `indexes` (already expanded and given ids).
 * `file` is where the scenario is stored. The row number is for people; the
 * id is what finds the row again.
 */
export function buildRowReference({ data, indexes, file }) {
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const described = describeRows(steps);
    return {
        qsc: ROW_REFERENCE_KIND,
        file: file || '',
        scenario: typeof data?.scenario === 'string' ? data.scenario : '',
        rows: indexes.map((index) => {
            const { id, ...content } = steps[index];
            const { section, number } = described.get(index) || { section: '', number: null };
            return { id, number, section, ...content };
        })
    };
}

/** Where a scenario file is, as far as it is known. */
export function buildReferenceFilePath({ rootPath = '', rootName = '', path = '' }) {
    const base = String(rootPath).trim().replace(/\/+$/, '') || String(rootName).trim();
    return [base, String(path).trim()].filter(Boolean).join('/');
}
