/**
 * Behaviour of the note column beyond plain typing (a text divider gets the
 * link parts of it, without images):
 *
 *   paste an image           saved to the opened folder, inserted as `![](path)`
 *   paste a URL on selection the selection becomes the link label
 *   insert-link shortcut     a small form for the URL and its label
 *   image chip               hover: preview, click: full screen
 *   link chip                click: open in a new tab
 *
 * The cell itself stays a plain-text editable like the other columns; this
 * only edits its text and reacts to the chips it renders.
 */
import {
    buildNoteImageMarkdown,
    buildNoteLinkMarkdown,
    findNoteInlineTokenAt,
    isNoteAssetPath,
    isSafeLinkUrl
} from './note-inline.js';
import { matchShortcut } from './shortcut-registry.js';

/** Caret or selection as offsets into the cell's text. */
export function getSelectionOffsets(cell) {
    const selection = cell.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return null;
    const measure = (node, offset) => {
        const before = cell.ownerDocument.createRange();
        before.selectNodeContents(cell);
        before.setEnd(node, offset);
        return before.toString().length;
    };
    return {
        start: measure(range.startContainer, range.startOffset),
        end: measure(range.endContainer, range.endOffset)
    };
}

function locate(cell, offset) {
    const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let last = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (remaining <= node.length) return { node, offset: remaining };
        remaining -= node.length;
        last = node;
    }
    return last ? { node: last, offset: last.length } : { node: cell, offset: 0 };
}

export function setSelectionOffsets(cell, start, end = start) {
    const range = cell.ownerDocument.createRange();
    const from = locate(cell, start);
    const to = locate(cell, end);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const selection = cell.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Replaces `[start, end]` of the cell's text. It goes through the browser's
 * own text insertion so the cell's input handler saves it and undo works.
 * Focusing first matters: a blurred cell shows chips, not its text.
 *
 * `source` is the text the offsets were measured in. A cell trims its text
 * when it loses focus, so after a blur the offsets are shifted by the
 * leading space that was cut, and trailing space that was cut is put back.
 */
function replaceCellText(cell, start, end, text, source = null) {
    cell.focus();
    const current = cell.textContent;
    let from = start;
    let to = end;
    let insert = text;
    if (source !== null && source !== current && source.trim() === current) {
        const lead = source.length - source.trimStart().length;
        const kept = lead + current.length;
        insert = source.slice(Math.min(kept, start), start) + text;
        from = Math.min(start, kept) - lead;
        to = Math.min(end, kept) - lead;
    }
    const clamp = value => Math.min(Math.max(value, 0), current.length);
    setSelectionOffsets(cell, clamp(from), clamp(to));
    cell.ownerDocument.execCommand('insertText', false, insert);
}

function field(labelText, input) {
    const label = document.createElement('label');
    label.className = 'note-link-form__field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, input);
    return label;
}

export function createNoteCellController({ assets, notify = () => {} }) {
    let preview = null;
    let previewTarget = null;

    // ---------- image paste ----------

    /** The cell may have been re-rendered while the image was being saved. */
    const resolveCell = (cell, address) => {
        if (cell.isConnected) return cell;
        const body = address.bodyId ? document.getElementById(address.bodyId) : null;
        return body?.querySelector(`[data-field="${address.field}"][data-index="${address.index}"]`) || null;
    };

    const addressOf = cell => ({
        bodyId: cell.closest('tbody')?.id || '',
        field: cell.dataset.field,
        index: cell.dataset.index
    });

    async function insertImage(cell, blob, offsets) {
        const address = addressOf(cell);
        let path = null;
        try {
            path = await assets.save(blob);
        } catch (error) {
            notify(error?.message || '이미지를 저장하지 못했습니다.', 'error');
            return;
        }
        const target = resolveCell(cell, address);
        const markdown = buildNoteImageMarkdown('', path);
        if (!target) {
            notify(`이미지를 저장했지만 셀을 찾지 못했습니다: ${markdown}`, 'error');
            return;
        }
        replaceCellText(target, offsets.start, offsets.end, markdown);
        notify(`이미지를 저장했습니다: ${path}`);
    }

    function handlePaste(event, { images }) {
        const cell = event.currentTarget;
        const data = event.clipboardData;
        if (!data) return;
        const offsets = getSelectionOffsets(cell);
        if (!offsets) return;
        const text = data.getData('text/plain');

        // Spreadsheets put a picture of the copied cells next to their text;
        // the text is what was meant, so an image only counts on its own.
        const image = text ? null : [...data.files].find(file => file.type.startsWith('image/'));
        if (image) {
            event.preventDefault();
            if (images) void insertImage(cell, image, offsets);
            else notify('이미지는 노트 셀에만 넣을 수 있습니다.', 'error');
            return;
        }

        const url = text.trim();
        if (!isSafeLinkUrl(url) || offsets.start === offsets.end) return;
        const source = cell.textContent;
        const selected = source.slice(offsets.start, offsets.end);
        if (selected.includes('\n') || findNoteInlineTokenAt(source, offsets.start, offsets.end)) return;
        event.preventDefault();
        replaceCellText(cell, offsets.start, offsets.end, buildNoteLinkMarkdown(selected, url));
    }

    // ---------- link form ----------

    function openLinkForm(cell) {
        const offsets = getSelectionOffsets(cell);
        if (!offsets) return;
        const source = cell.textContent;
        // With the caret inside a link, the form edits that link.
        const found = findNoteInlineTokenAt(source, offsets.start, offsets.end);
        const existing = found?.type === 'link' ? found : null;
        const range = existing ? { start: existing.from, end: existing.to } : offsets;
        const selected = source.slice(offsets.start, offsets.end);
        const address = addressOf(cell);

        const dialog = document.createElement('dialog');
        dialog.className = 'note-link-form';
        const form = document.createElement('form');
        form.method = 'dialog';

        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://';
        urlInput.required = true;
        urlInput.spellcheck = false;
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = '비우면 주소를 그대로 넣습니다';

        if (existing) {
            urlInput.value = existing.target;
            labelInput.value = existing.text;
        } else if (isSafeLinkUrl(selected.trim())) {
            urlInput.value = selected.trim();
        } else if (!selected.includes('\n')) {
            labelInput.value = selected.trim();
        }

        const actions = document.createElement('div');
        actions.className = 'note-link-form__actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = '취소';
        cancel.addEventListener('click', () => dialog.close());
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'is-primary';
        submit.textContent = existing ? '링크 수정' : '링크 삽입';
        actions.append(cancel, submit);

        form.append(field('URL', urlInput), field('Label', labelInput), actions);
        dialog.append(form);

        let markdown = null;
        form.addEventListener('submit', (event) => {
            const url = urlInput.value.trim();
            if (!isSafeLinkUrl(url)) {
                event.preventDefault();
                urlInput.setCustomValidity('http:// 또는 https:// 로 시작하는 주소를 입력하세요.');
                urlInput.reportValidity();
                return;
            }
            markdown = buildNoteLinkMarkdown(labelInput.value, url);
        });
        urlInput.addEventListener('input', () => urlInput.setCustomValidity(''));
        // Keys typed in the form must not reach the table's own shortcuts.
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.addEventListener('close', () => {
            dialog.remove();
            const target = resolveCell(cell, address);
            if (!target) return;
            if (markdown === null) {
                // Cancelled: put the text and the caret back as they were.
                replaceCellText(target, offsets.start, offsets.start, '', source);
                setSelectionOffsets(target, offsets.start, offsets.end);
                return;
            }
            replaceCellText(target, range.start, range.end, markdown, source);
        });

        // Placed by the cell so the eye does not leave the row.
        const rect = cell.getBoundingClientRect();
        document.body.append(dialog);
        dialog.showModal();
        const width = dialog.offsetWidth;
        const height = dialog.offsetHeight;
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        const below = rect.bottom + 6;
        const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
        dialog.style.left = `${left}px`;
        dialog.style.top = `${top}px`;
        (urlInput.value && !existing ? labelInput : urlInput).focus();
    }

    function handleKeydown(event) {
        if (!matchShortcut(event, 'insertLink')) return;
        event.preventDefault();
        event.stopPropagation();
        openLinkForm(event.currentTarget);
    }

    // ---------- images: preview and full screen ----------

    async function resolveImageUrl(target) {
        if (!isNoteAssetPath(target)) return { url: isSafeLinkUrl(target) ? target : null };
        try {
            const url = await assets.getUrl(target);
            return url ? { url } : { message: `파일이 없습니다: ${target}` };
        } catch (error) {
            const denied = error?.name === 'NotAllowedError';
            return { message: denied ? '폴더 접근 권한이 필요합니다.' : (error?.message || '이미지를 열지 못했습니다.') };
        }
    }

    function hidePreview() {
        previewTarget = null;
        preview?.remove();
        preview = null;
    }

    function placePreview(anchor) {
        if (!preview) return;
        const rect = anchor.getBoundingClientRect();
        const width = preview.offsetWidth;
        const height = preview.offsetHeight;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
        const above = rect.top - height - 8;
        preview.style.left = `${left}px`;
        preview.style.top = `${above >= 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 8)}px`;
    }

    async function showPreview(chip) {
        const target = chip.dataset.noteImage;
        if (previewTarget === chip) return;
        hidePreview();
        previewTarget = chip;
        const resolved = await resolveImageUrl(target);
        if (previewTarget !== chip || !chip.isConnected) return;

        preview = document.createElement('div');
        preview.className = 'note-image-preview';
        if (resolved.url) {
            const img = document.createElement('img');
            img.alt = chip.textContent;
            img.addEventListener('load', () => placePreview(chip));
            img.addEventListener('error', () => {
                if (!preview) return;
                preview.textContent = '이미지를 불러오지 못했습니다.';
                placePreview(chip);
            });
            img.src = resolved.url;
            preview.append(img);
        } else {
            preview.textContent = resolved.message || '이미지를 불러오지 못했습니다.';
        }
        document.body.append(preview);
        placePreview(chip);
    }

    async function openLightbox(target, label = '') {
        hidePreview();
        const resolved = await resolveImageUrl(target);
        if (!resolved.url) {
            notify(resolved.message || '이미지를 열지 못했습니다.', 'error');
            return;
        }
        const dialog = document.createElement('dialog');
        dialog.className = 'note-image-lightbox';
        const img = document.createElement('img');
        img.src = resolved.url;
        img.alt = label;
        const caption = document.createElement('div');
        caption.className = 'note-image-lightbox__caption';
        caption.textContent = label && label !== target ? `${label} · ${target}` : target;
        dialog.append(img, caption);
        // Anywhere closes it, the image included: there is nothing to operate.
        dialog.addEventListener('click', () => dialog.close());
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.addEventListener('close', () => dialog.remove());
        document.body.append(dialog);
        dialog.showModal();
    }

    // ---------- chips ----------

    const chipOf = event => event.target.closest?.('.note-chip');

    function setupTable(table) {
        if (!table) return;
        // Stops the cell from taking focus, which would swap the chips for
        // the raw text before the click lands on one.
        table.addEventListener('mousedown', (event) => {
            if (event.button === 0 && chipOf(event)) event.preventDefault();
        });
        table.addEventListener('click', (event) => {
            const chip = chipOf(event);
            if (!chip) return;
            if (chip.dataset.noteLink) {
                window.open(chip.dataset.noteLink, '_blank', 'noopener,noreferrer');
            } else if (chip.dataset.noteImage) {
                void openLightbox(chip.dataset.noteImage, chip.textContent);
            }
        });
        table.addEventListener('mouseover', (event) => {
            const chip = chipOf(event);
            if (chip?.dataset.noteImage) void showPreview(chip);
        });
        table.addEventListener('mouseout', (event) => {
            const chip = chipOf(event);
            if (chip && !chip.contains(event.relatedTarget)) hidePreview();
        });
        // A preview is positioned once, so it would drift away on scroll.
        table.closest('.checklist-container')?.addEventListener('scroll', hidePreview, { passive: true, capture: true });
    }

    /** `images: false` leaves the cell with links only. */
    function mountCell(cell, { images = true } = {}) {
        cell.addEventListener('paste', event => handlePaste(event, { images }));
        cell.addEventListener('keydown', handleKeydown);
    }

    return { mountCell, setupTable, openLightbox, hidePreview };
}
