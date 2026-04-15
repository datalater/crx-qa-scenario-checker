export function resolveParseErrorPosition(msg, text, getPositionFromLineColumn, findTrailingCommaPosition) {
    const byPosition = getPositionFromMessage(msg);
    if (byPosition !== null) return byPosition;

    const byLineColumn = getLineColumnFromMessage(msg);
    if (byLineColumn) return getPositionFromLineColumn(text, byLineColumn);

    if (isUnexpectedEndError(msg)) return text.length - 1;

    const trailingComma = findTrailingCommaPosition(text);
    if (trailingComma >= 0) return trailingComma;

    return null;
}

export function formatParseErrorMessage(error) {
    return `JSON parse error: ${getSafeErrorMessage(error)}`;
}

export function formatRuntimeErrorMessage(error) {
    const name = error && error.name ? error.name : 'Error';
    return `Render error (${name}): ${getSafeErrorMessage(error)}`;
}

export function getSafeErrorMessage(error) {
    if (error && typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }
    return String(error || 'Unknown error').trim();
}

function getPositionFromMessage(msg) {
    const match = msg.match(/at position (\d+)/i);
    return match ? parseInt(match[1], 10) : null;
}

function getLineColumnFromMessage(msg) {
    const match = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (!match) return null;
    return { line: parseInt(match[1], 10), column: parseInt(match[2], 10) };
}

function isUnexpectedEndError(msg) {
    return msg.includes('Unexpected end of JSON input');
}
