/**
 * Home and End inside a text field of the Table Editor move the caret to the
 * very start and the very end of that field. On macOS the browser scrolls the
 * page for these keys instead and leaves the caret where it was.
 *
 * With Shift the selection is extended to that edge. The fields are the same
 * as for surround-selection: step cells, text dividers, live table cells and
 * the source fields of diagram and ui blocks. CodeMirror and the JSON editor
 * keep their own handling.
 */
import { editingHost, isPlainTextarea } from './surround-selection.js';

/** Where the selection of a textarea goes: `[start, end, direction]`. */
export function textareaEdgeSelection({ start, end, direction, length }, toStart, extend) {
    const edge = toStart ? 0 : length;
    if (!extend) return [edge, edge, 'none'];
    // The end that stays put is the one the selection was started from.
    const anchor = direction === 'backward' ? end : start;
    return edge < anchor ? [edge, anchor, 'backward'] : [anchor, edge, 'forward'];
}

function edgePosition(host, toStart) {
    const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    if (!toStart) for (let next = node; next; next = walker.nextNode()) node = next;
    if (!node) return { node: host, offset: 0 };
    return { node, offset: toStart ? 0 : node.length };
}

/** Brings the caret into view when the field is taller than what is shown. */
function revealCaret(host) {
    const selection = host.ownerDocument.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset);
    const caret = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!caret || (!caret.height && !caret.top)) return;
    for (let parent = host.parentElement; parent; parent = parent.parentElement) {
        const { overflowY } = getComputedStyle(parent);
        if (!/auto|scroll/.test(overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
        const box = parent.getBoundingClientRect();
        // Room for a table header and titles pinned over the top of the pane.
        const top = box.top + Math.min(96, box.height / 3);
        if (caret.top < top) parent.scrollTop -= top - caret.top;
        else if (caret.bottom > box.bottom - 8) parent.scrollTop += caret.bottom - (box.bottom - 8);
        return;
    }
}

export function setupHomeEndKeys(root = document) {
    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Home' && event.key !== 'End') return;
        if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
        const toStart = event.key === 'Home';

        if (isPlainTextarea(event.target)) {
            const field = event.target;
            event.preventDefault();
            field.setSelectionRange(...textareaEdgeSelection({
                start: field.selectionStart,
                end: field.selectionEnd,
                direction: field.selectionDirection,
                length: field.value.length
            }, toStart, event.shiftKey));
            // A textarea scrolls to its caret only when the caret is re-set by focus.
            field.blur();
            field.focus();
            return;
        }

        const host = editingHost(event.target);
        const selection = host?.ownerDocument.getSelection();
        if (!host || !selection || !host.contains(selection.focusNode)) return;
        event.preventDefault();
        const { node, offset } = edgePosition(host, toStart);
        if (event.shiftKey) selection.extend(node, offset);
        else selection.collapse(node, offset);
        revealCaret(host);
    });
}
