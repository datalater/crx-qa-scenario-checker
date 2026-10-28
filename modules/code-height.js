/**
 * Editor height for code dividers and note code blocks.
 *
 *   fixed    capped at 300px, scrolls past that (the CodeMirror theme)
 *   auto     grows to fit the whole text
 *   "480px"  exactly that tall, set by dragging the handle under the editor
 *
 * A dragged height is stored as a string: an older build drops non-string
 * attributes, but keeps (and renders as fixed) a string it does not know.
 */

export const CODE_HEIGHT_MIN_PX = 80;

const PX_PATTERN = /^(\d+)px$/;

/** "480px" -> 480; null for anything else or below the minimum. */
export function parseCodeHeightPx(value) {
    const match = typeof value === 'string' ? PX_PATTERN.exec(value.trim().toLowerCase()) : null;
    if (!match) return null;
    const px = Number(match[1]);
    return px >= CODE_HEIGHT_MIN_PX ? px : null;
}

export function formatCodeHeightPx(px) {
    return `${Math.max(CODE_HEIGHT_MIN_PX, Math.round(px))}px`;
}

/** Shows `height` ('fixed', 'auto' or "<n>px") on an editor host element. */
export function applyCodeHeight(host, height) {
    const px = parseCodeHeightPx(height);
    host.classList.toggle('is-height-auto', height === 'auto');
    host.classList.toggle('is-height-custom', px !== null);
    if (px !== null) host.style.setProperty('--code-editor-height', `${px}px`);
    else host.style.removeProperty('--code-editor-height');
}

/**
 * Adds a drag handle under `host`. Dragging resizes the editor live and
 * reports the final height once, as "<n>px", through `onCommit`. A double
 * click reports `null` (back to the default) through `onReset`.
 */
export function createCodeHeightHandle(host, { onCommit, onReset }) {
    const handle = document.createElement('div');
    handle.className = 'code-height-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.title = '드래그해서 높이 조절 · 더블클릭하면 기본 높이';

    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const editor = host.querySelector('.cm-editor');
        if (!editor) return;
        event.preventDefault();
        event.stopPropagation();
        const startY = event.clientY;
        const startHeight = editor.getBoundingClientRect().height;
        let height = formatCodeHeightPx(startHeight);
        handle.setPointerCapture(event.pointerId);
        handle.classList.add('is-dragging');

        const onMove = (moveEvent) => {
            height = formatCodeHeightPx(startHeight + moveEvent.clientY - startY);
            applyCodeHeight(host, height);
        };
        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            handle.classList.remove('is-dragging');
            onCommit(height);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    });
    handle.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset();
    });
    // A click on the handle must not select the row behind it.
    handle.addEventListener('click', event => event.stopPropagation());
    return handle;
}
