export function getLineColumn(text, position) {
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

export function getPositionFromLineColumn(text, location) {
    if (!location || location.line < 1 || location.column < 1) return -1;
    let line = 1;
    let index = 0;

    while (index < text.length && line < location.line) {
        if (text[index] === '\n') line += 1;
        index += 1;
    }

    const position = index + location.column - 1;
    return normalizeErrorPosition(text, position);
}

export function findTrailingCommaPosition(text) {
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length - 1; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString || char !== ',') continue;
        const next = findNextNonWhitespace(text, i + 1);
        if (next !== -1 && (text[next] === ']' || text[next] === '}')) return i;
    }

    return -1;
}

export function normalizeErrorPosition(text, position) {
    if (!Number.isFinite(position) || text.length === 0) return -1;
    return Math.min(Math.max(position, 0), text.length - 1);
}

function findNextNonWhitespace(text, start) {
    for (let i = start; i < text.length; i++) {
        if (!/\s/.test(text[i])) return i;
    }
    return -1;
}
