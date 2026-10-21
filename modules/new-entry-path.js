// Parses command-palette input such as "new-file", "a/b/new-file" or "a/b/".
// Returns { folders: string[], file: string | null } or { error: string }.

const ILLEGAL_SEGMENT = /[<>:"|?*\\\u0000-\u001f]/;
const MAX_SEGMENT_LENGTH = 255;

export function parseNewEntryPath(input) {
    const raw = String(input ?? '').trim();
    if (!raw) return { error: 'empty' };

    const folderOnly = raw.endsWith('/');
    const segments = raw.split('/').map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) return { error: 'empty' };

    for (const segment of segments) {
        if (segment === '.' || segment === '..') return { error: 'relative-segment' };
        if (ILLEGAL_SEGMENT.test(segment)) return { error: 'illegal-character' };
        if (segment.length > MAX_SEGMENT_LENGTH) return { error: 'too-long' };
    }

    if (folderOnly) return { folders: segments, file: null };
    return { folders: segments.slice(0, -1), file: segments[segments.length - 1] };
}

export function describeNewEntryError(code) {
    switch (code) {
        case 'relative-segment': return '"." 와 ".." 는 사용할 수 없습니다.';
        case 'illegal-character': return '이름에 사용할 수 없는 문자가 있습니다. (\\ : * ? " < > |)';
        case 'too-long': return '이름이 너무 깁니다.';
        default: return '';
    }
}
