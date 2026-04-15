export function captureEditorSelectionSnapshot(editing) {
    const text = editing.value;
    return {
        start: captureCaretAnchor(text, editing.selectionStart),
        end: captureCaretAnchor(text, editing.selectionEnd),
        direction: editing.selectionDirection || 'none',
        scrollTop: editing.scrollTop,
        scrollLeft: editing.scrollLeft
    };
}

export function restoreEditorSelectionSnapshot(editing, snapshot) {
    if (!snapshot) return;
    const text = editing.value;
    const nextStart = resolveCaretFromAnchor(text, snapshot.start);
    const nextEnd = resolveCaretFromAnchor(text, snapshot.end);
    editing.setSelectionRange(nextStart, nextEnd, snapshot.direction);
    editing.scrollTop = snapshot.scrollTop;
    editing.scrollLeft = snapshot.scrollLeft;
}

function captureCaretAnchor(text, offset) {
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    return {
        semanticIndex: getSemanticIndexBeforeOffset(text, clampedOffset),
        lineColumn: getLineColumn(text, clampedOffset),
        absoluteOffset: clampedOffset
    };
}

function resolveCaretFromAnchor(text, anchor) {
    const bySemantic = getOffsetFromSemanticIndex(text, anchor?.semanticIndex);
    if (Number.isFinite(bySemantic)) return bySemantic;
    const byLineColumn = getCaretPositionFromLineColumn(text, anchor?.lineColumn);
    if (Number.isFinite(byLineColumn)) return byLineColumn;
    return Math.max(0, Math.min(anchor?.absoluteOffset || 0, text.length));
}

function getSemanticIndexBeforeOffset(text, offset) {
    const limit = Math.max(0, Math.min(offset, text.length));
    let semanticIndex = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < limit; i++) {
        const char = text[i];
        const significant = isSemanticCharacter(char, inString);
        if (significant) semanticIndex += 1;

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        }
    }

    return semanticIndex;
}

function getOffsetFromSemanticIndex(text, semanticIndex) {
    if (!Number.isFinite(semanticIndex)) return NaN;
    if (semanticIndex <= 0) return 0;

    let seen = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const significant = isSemanticCharacter(char, inString);

        if (significant) {
            if (seen === semanticIndex) return i;
            seen += 1;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        }
    }

    return text.length;
}

function isSemanticCharacter(char, inString) {
    if (inString) return true;
    return !/\s/.test(char);
}

function getCaretPositionFromLineColumn(text, location) {
    if (!location || location.line < 1 || location.column < 1) return NaN;
    let line = 1;
    let index = 0;

    while (index < text.length && line < location.line) {
        if (text[index] === '\n') line += 1;
        index += 1;
    }

    const lineEnd = text.indexOf('\n', index);
    const maxIndexOnLine = lineEnd === -1 ? text.length : lineEnd;
    const desiredIndex = index + location.column - 1;
    return Math.max(0, Math.min(desiredIndex, maxIndexOnLine));
}

function getLineColumn(text, position) {
    const clamped = Math.max(0, Math.min(position, text.length));
    let line = 1;
    let column = 1;

    for (let i = 0; i < clamped; i++) {
        if (text[i] === '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }

    return { line, column };
}
