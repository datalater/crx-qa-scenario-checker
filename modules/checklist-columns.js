/**
 * Which columns of the Table Editor are shown. Every column is shown by
 * default; the `#` column always is, since it is what a row is clicked by.
 */

export const CHECKLIST_COLUMNS = Object.freeze([
    Object.freeze({ id: 'given', label: 'Given' }),
    Object.freeze({ id: 'when', label: 'When' }),
    Object.freeze({ id: 'then', label: 'Then' }),
    Object.freeze({ id: 'pass', label: 'Pass' }),
    Object.freeze({ id: 'note', label: 'Note' })
]);

const COLUMN_IDS = CHECKLIST_COLUMNS.map(column => column.id);

/**
 * The hidden columns as a clean list, in column order: unknown names and
 * repeats are dropped, and a list that would hide everything hides nothing.
 */
export function normalizeHiddenColumns(value) {
    const wanted = new Set(Array.isArray(value) ? value : []);
    const hidden = COLUMN_IDS.filter(id => wanted.has(id));
    return hidden.length === COLUMN_IDS.length ? [] : hidden;
}

/** Shows or hides one column. The last visible column cannot be hidden. */
export function toggleHiddenColumn(hidden, id) {
    if (!COLUMN_IDS.includes(id)) return normalizeHiddenColumns(hidden);
    const next = new Set(normalizeHiddenColumns(hidden));
    if (next.has(id)) next.delete(id);
    else if (next.size < COLUMN_IDS.length - 1) next.add(id);
    return COLUMN_IDS.filter(column => next.has(column));
}

/** What the column picker's button says: the default, or how many are shown. */
export function describeVisibleColumns(hidden) {
    const count = normalizeHiddenColumns(hidden).length;
    return count === 0 ? 'All columns' : `Columns ${COLUMN_IDS.length - count}/${COLUMN_IDS.length}`;
}

/**
 * The stored choice. Before there was a column picker the note column had a
 * toggle of its own, saved as `check` when it was turned off; that choice is
 * honoured until the picker is used.
 */
export function readHiddenColumns(stored, legacyDensity = null) {
    if (typeof stored === 'string') {
        try {
            return normalizeHiddenColumns(JSON.parse(stored));
        } catch (_) {
            return [];
        }
    }
    return legacyDensity === 'check' ? ['note'] : [];
}
