/**
 * Inline syntax of a note cell. The stored text stays plain markdown, so it
 * reads the same in the JSON editor and in a markdown code divider:
 *
 *   [label](https://...)        link
 *   ![label](assets/name.png)   image saved in the opened folder
 *   https://...                 bare link
 *
 * Nothing here touches the DOM, so the parsing is testable on its own.
 */

/** Folder, relative to the opened root, that holds pasted images. */
export const NOTE_ASSET_DIR = 'assets';

const ASSET_NAME = '[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:png|jpe?g|gif|webp)';
const ASSET_PATH_PATTERN = new RegExp(`^${NOTE_ASSET_DIR}/${ASSET_NAME}$`, 'i');

// A target may hold one level of balanced parentheses, as wiki URLs do.
const TARGET = '[^\\s()]*(?:\\([^\\s()]*\\)[^\\s()]*)*';
const TOKEN_PATTERN = new RegExp(
    '`[^`\\n]+`'
    + `|(!?)\\[([^\\]\\n]*)\\]\\((${TARGET})\\)`
    + '|https?:\\/\\/[^\\s<>`]+',
    'g'
);
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

export function isSafeLinkUrl(value) {
    return /^https?:\/\/[^\s]+$/i.test(String(value || ''));
}

export function isNoteAssetPath(value) {
    return ASSET_PATH_PATTERN.test(String(value || ''));
}

export function noteAssetName(path) {
    return isNoteAssetPath(path) ? String(path).slice(NOTE_ASSET_DIR.length + 1) : '';
}

export function noteAssetPath(name) {
    return `${NOTE_ASSET_DIR}/${name}`;
}

/** An image is shown from the opened folder or straight from the web. */
function isImageTarget(target) {
    return isNoteAssetPath(target) || isSafeLinkUrl(target);
}

function hostLabel(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '') || 'link';
    } catch (_) {
        return 'link';
    }
}

function fileLabel(target) {
    const name = String(target).split(/[?#]/)[0].split('/').filter(Boolean).pop();
    return name || 'image';
}

/**
 * Splits note text into the links and images it holds. Text inside backticks
 * is code and is skipped, as is anything that is not a safe target, so both
 * stay visible as the plain text the user typed.
 *
 * Returns `{ type, from, to, label, target, text }` in source order, where
 * `label` is what the chip shows and `text` is the label as written.
 */
export function findNoteInlineTokens(source) {
    const input = String(source ?? '');
    const tokens = [];
    for (const match of input.matchAll(TOKEN_PATTERN)) {
        const raw = match[0];
        const from = match.index;
        if (raw.startsWith('`')) continue;

        if (match[3] === undefined) {
            const url = raw.replace(TRAILING_PUNCTUATION, '');
            if (!isSafeLinkUrl(url)) continue;
            tokens.push({ type: 'link', from, to: from + url.length, label: hostLabel(url), target: url, text: '' });
            continue;
        }

        const isImage = match[1] === '!';
        const text = match[2].trim();
        const target = match[3];
        if (isImage) {
            if (!isImageTarget(target)) continue;
            tokens.push({ type: 'image', from, to: from + raw.length, label: text || fileLabel(target), target, text });
        } else {
            if (!isSafeLinkUrl(target)) continue;
            tokens.push({ type: 'link', from, to: from + raw.length, label: text || hostLabel(target), target, text });
        }
    }
    return tokens;
}

/** The link or image token the range `[start, end]` sits inside, if any. */
export function findNoteInlineTokenAt(source, start, end = start) {
    return findNoteInlineTokens(source).find(token => token.from <= start && end <= token.to) || null;
}

/** Names of the images in the assets folder that `source` refers to. */
export function collectNoteAssetNames(source) {
    const names = new Set();
    const pattern = new RegExp(`!\\[[^\\]\\n]*\\]\\(${NOTE_ASSET_DIR}/(${ASSET_NAME})\\)`, 'gi');
    for (const match of String(source ?? '').matchAll(pattern)) names.add(match[1]);
    return [...names];
}

// A label must not close the brackets early or break the line it sits on.
function cleanLabel(label) {
    return String(label ?? '').replace(/[\[\]\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildNoteLinkMarkdown(label, url) {
    const target = String(url ?? '').trim();
    const text = cleanLabel(label);
    return text ? `[${text}](${target})` : target;
}

export function buildNoteImageMarkdown(label, target) {
    return `![${cleanLabel(label)}](${target})`;
}
