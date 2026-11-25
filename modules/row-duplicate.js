/**
 * Duplicating rows: copies of the selected rows go right below the last of
 * them, in order. Every row, a divider too, stands for itself only.
 *
 * A copy is a new row: it drops the id (two rows with one id would make a
 * row reference ambiguous), its verdict (a copy has not been checked) and
 * its pin (the pinned strip would show the same row twice).
 */

const DROPPED_KEYS = ['id', 'pass', 'pinned'];

export function duplicateStep(step) {
    const copy = structuredClone(step);
    if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
        DROPPED_KEYS.forEach((key) => { delete copy[key]; });
    }
    return copy;
}

/**
 * Inserts copies of the rows at `indexes` into `steps`, in place, and
 * returns the indexes of the copies. Unknown indexes are ignored.
 */
export function duplicateRows(steps, indexes) {
    const picked = [...new Set(indexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < steps.length)
        .sort((a, b) => a - b);
    if (picked.length === 0) return [];
    const at = picked[picked.length - 1] + 1;
    steps.splice(at, 0, ...picked.map(index => duplicateStep(steps[index])));
    return picked.map((_, offset) => at + offset);
}
