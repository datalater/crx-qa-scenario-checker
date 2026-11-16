/**
 * A step cell (given, when, then, note) is stored as an array of lines.
 * Blank lines between text are kept, as empty strings, because they are how
 * a writer separates one group of lines from the next. Blank lines at either
 * end carry no meaning and are dropped, as is the space around each line.
 */

function trimBlankEnds(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && !lines[start]) start += 1;
    while (end > start && !lines[end - 1]) end -= 1;
    return lines.slice(start, end);
}

/** Cell text, or an already stored array, as the lines to store. */
export function toStepLines(value) {
    if (value == null) return [];
    const items = Array.isArray(value) ? value : String(value).split('\n');
    return trimBlankEnds(items.map(item => (
        // An object here is an older data shape, not text.
        item == null || typeof item === 'object' ? '' : String(item).trim()
    )));
}

/** Stored lines as the text a cell shows and edits. */
export function stepLinesToText(value) {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) return '';
    return toStepLines(value).join('\n');
}
