/**
 * Typing an opening bracket or quote over a selection wraps the selection
 * instead of replacing it: select `시간표 설정`, type `(`, get `(시간표 설정)`.
 *
 * It covers every plain text field of the Table Editor: the step cells, text
 * dividers, cells of a live markdown table, and the source fields of the
 * diagram and ui blocks. A CodeMirror editor already does this on its own,
 * and the JSON editor is left as it is.
 */
import { getSelectionOffsets, setSelectionOffsets } from './note-cell-controller.js';

export const SURROUND_PAIRS = Object.freeze({
    '(': ')',
    '[': ']',
    '{': '}',
    '`': '`',
    '"': '"',
    "'": "'"
});

/** The wrapped text and where the selection sits afterwards (the inside). */
export function surroundText(text, start, end, open) {
    const close = SURROUND_PAIRS[open];
    if (!close || start === end) return null;
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return {
        text: text.slice(0, from) + open + text.slice(from, to) + close + text.slice(to),
        start: from + 1,
        end: to + 1
    };
}

/**
 * In a ui block, `@title 시간표 설정` with the content selected should become
 * `@title(시간표 설정)`: a parenthesis or a quote only scopes a role when it
 * touches the name. True when the single space before `start` is that gap.
 */
export function isRoleGapBefore(text, start) {
    return /(^|[\s(])@[A-Za-z][\w-]* $/.test(text.slice(0, start));
}

function isPlainTextarea(target) {
    return target instanceof HTMLTextAreaElement && target.id !== 'editing' && !target.readOnly;
}

/** The editable element a keystroke lands in, unless CodeMirror owns it. */
function editingHost(target) {
    const host = target?.closest?.('[contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]');
    return host && !host.classList.contains('cm-content') ? host : null;
}

// The closing mark goes in first, then the opening one: each is a normal text
// insertion, so the field saves as it does when typed and undo steps back
// through them. The selected text itself is never rewritten.
function wrapTextarea(field, open) {
    const { selectionStart: start, selectionEnd: end } = field;
    field.setSelectionRange(end, end);
    document.execCommand('insertText', false, SURROUND_PAIRS[open]);
    // The opening mark replaces the gap after a role name, if there is one.
    const closesGap = (open === '(' || open === '"') && field.classList.contains('cm-ui-source') && isRoleGapBefore(field.value, start);
    field.setSelectionRange(closesGap ? start - 1 : start, start);
    document.execCommand('insertText', false, open);
    const shift = closesGap ? 0 : 1;
    field.setSelectionRange(start + shift, end + shift);
}

function wrapEditable(host, offsets, open) {
    const start = Math.min(offsets.start, offsets.end);
    const end = Math.max(offsets.start, offsets.end);
    setSelectionOffsets(host, end);
    document.execCommand('insertText', false, SURROUND_PAIRS[open]);
    setSelectionOffsets(host, start);
    document.execCommand('insertText', false, open);
    setSelectionOffsets(host, start + 1, end + 1);
}

export function setupSurroundSelection(root = document) {
    root.addEventListener('beforeinput', (event) => {
        if (event.inputType !== 'insertText' || event.isComposing) return;
        if (!Object.hasOwn(SURROUND_PAIRS, event.data ?? '')) return;

        if (isPlainTextarea(event.target)) {
            if (event.target.selectionStart === event.target.selectionEnd) return;
            event.preventDefault();
            wrapTextarea(event.target, event.data);
            return;
        }

        const host = editingHost(event.target);
        const offsets = host ? getSelectionOffsets(host) : null;
        if (!offsets || offsets.start === offsets.end) return;
        event.preventDefault();
        wrapEditable(host, offsets, event.data);
    }, true);
}
