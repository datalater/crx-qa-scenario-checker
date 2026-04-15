/**
 * Syntax highlighting for JSON with optional error marking.
 */
export function syntaxHighlight(json, errorPos = -1, searchQuery = '') {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }

    const ERROR_START_TOKEN = '@@__JSON_ERROR_START__@@';
    const ERROR_END_TOKEN = '@@__JSON_ERROR_END__@@';
    const SEARCH_START_TOKEN = '@@__JSON_SEARCH_START__@@';
    const SEARCH_END_TOKEN = '@@__JSON_SEARCH_END__@@';
    let source = json;

    if (errorPos >= 0 && errorPos < source.length) {
        const before = source.substring(0, errorPos);
        const char = source.substring(errorPos, errorPos + 1);
        const after = source.substring(errorPos + 1);
        source = before + ERROR_START_TOKEN + (char || ' ') + ERROR_END_TOKEN + after;
    }

    const normalizedSearchQuery = String(searchQuery || '').trim();
    if (normalizedSearchQuery) {
        const queryLower = normalizedSearchQuery.toLowerCase();
        const sourceLower = source.toLowerCase();
        let cursor = 0;
        let next = '';

        while (cursor < source.length) {
            const matchIndex = sourceLower.indexOf(queryLower, cursor);
            if (matchIndex < 0) {
                next += source.slice(cursor);
                break;
            }

            next += source.slice(cursor, matchIndex);
            next += SEARCH_START_TOKEN;
            next += source.slice(matchIndex, matchIndex + queryLower.length);
            next += SEARCH_END_TOKEN;
            cursor = matchIndex + queryLower.length;
        }

        source = next;
    }

    source = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const highlighted = source.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });

    return highlighted
        .split(ERROR_START_TOKEN).join('<mark class="json-error">')
        .split(ERROR_END_TOKEN).join('</mark>')
        .split(SEARCH_START_TOKEN).join('<mark class="json-search-hit">')
        .split(SEARCH_END_TOKEN).join('</mark>');
}

/**
 * Finds the line range ([startLine, endLine]) for the Nth step in the "steps" array.
 */
export function findStepBounds(json, targetIndex) {
    let stepsArrayStartIdx = json.indexOf('"steps":');
    if (stepsArrayStartIdx !== -1) {
        stepsArrayStartIdx = json.indexOf('[', stepsArrayStartIdx);
    }
    
    if (stepsArrayStartIdx === -1) return null;

    let currentStepIdx = -1;
    let braceDepth = 0;
    let stepStartIndex = -1;
    let inString = false;
    for (let i = stepsArrayStartIdx + 1; i < json.length; i++) {
        const char = json[i];
        if (char === '"' && json[i-1] !== '\\') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{') {
            if (braceDepth === 0) {
                currentStepIdx++;
                if (currentStepIdx === targetIndex) {
                    stepStartIndex = i;
                }
            }
            braceDepth++;
        } else if (char === '}') {
            braceDepth--;
            if (braceDepth === 0 && currentStepIdx === targetIndex) {
                return { start: stepStartIndex, end: i + 1 };
            }
        } else if (char === ']' && braceDepth === 0) {
            break;
        }
    }
    return null;
}
