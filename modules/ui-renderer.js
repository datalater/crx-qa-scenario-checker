import { getActiveFile } from './workspace-manager.js';

export function createTreeRowActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return null;
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'tree-row-actions';

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-row-action';
        if (action.variant === 'danger') {
            btn.classList.add('danger');
        }
        btn.textContent = action.label;
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick();
        });
        actionsWrap.appendChild(btn);
    });

    return actionsWrap;
}

export function formatChecklistCellContent(rawValue) {
    if (!rawValue) return '-';
    const source = String(rawValue);
    const pattern = /`([^`\n]+)`/g;
    let cursor = 0;
    let rendered = '';
    let match = pattern.exec(source);

    while (match) {
        rendered += escapeChecklistHtml(source.slice(cursor, match.index));
        rendered += renderChecklistInlineToken(match[1]);
        cursor = pattern.lastIndex;
        match = pattern.exec(source);
    }

    rendered += escapeChecklistHtml(source.slice(cursor));
    return rendered;
}

function escapeChecklistHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const CHECKLIST_ALERTS = {
    note: {
        label: 'Note',
        className: 'note',
        icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8.75-3.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM8 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 6Z"></path></svg>'
    },
    tip: {
        label: 'Tip',
        className: 'tip',
        icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1a4.75 4.75 0 0 0-2.694 8.663c.343.234.694.73.694 1.337V11h4v-.001c0-.607.35-1.103.694-1.337A4.75 4.75 0 0 0 8 1Zm-4 4.75a4 4 0 1 1 6.301 3.25c-.582.397-1.063 1.02-1.237 1.75H6.936c-.174-.73-.655-1.353-1.237-1.75A3.989 3.989 0 0 1 4 5.75ZM6 12.5A.5.5 0 0 1 6.5 12h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5Zm.75 1.75a.75.75 0 0 0 1.5 0h-1.5Z"></path></svg>'
    },
    important: {
        label: 'Important',
        className: 'important',
        icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 1.75a.75.75 0 0 1 1.5 0v6.5a.75.75 0 0 1-1.5 0v-6.5ZM8 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"></path><path fill="currentColor" d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path></svg>'
    },
    warning: {
        label: 'Warning',
        className: 'warning',
        icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6.457 1.047a1.75 1.75 0 0 1 3.086 0l5.273 9.496A1.75 1.75 0 0 1 13.273 13H2.727a1.75 1.75 0 0 1-1.543-2.457l5.273-9.496ZM8 4.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 4.5Zm0 6a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75Z"></path></svg>'
    },
    caution: {
        label: 'Caution',
        className: 'caution',
        icon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.48 1.117a.75.75 0 0 1 1.04 0l5.363 5.048a.75.75 0 0 1 .237.546v2.578a.75.75 0 0 1-.237.546L8.52 14.883a.75.75 0 0 1-1.04 0L2.117 9.835a.75.75 0 0 1-.237-.546V6.711a.75.75 0 0 1 .237-.546L7.48 1.117ZM8 4.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 4.5Zm0 6a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75Z"></path></svg>'
    }
};

function renderChecklistInlineToken(token) {
    if (token === '\\n') {
        return '<span class="checklist-line-spacer" role="separator"></span>';
    }
    const alertConfig = getChecklistAlertConfig(token);
    if (alertConfig) {
        return `<span class="checklist-alert-token checklist-alert-token--${alertConfig.className}" title="${alertConfig.label}"><span class="checklist-alert-token__icon" aria-hidden="true">${alertConfig.icon}</span><span class="checklist-alert-token__label">${alertConfig.label}</span></span>`;
    }
    return `<code class="inline-code">${escapeChecklistHtml(token)}</code>`;
}

function getChecklistAlertConfig(token) {
    const normalized = String(token || '').trim();
    const match = normalized.match(/^\[!([a-z]+)\]$/i);
    if (!match) return null;
    return CHECKLIST_ALERTS[match[1].toLowerCase()] || null;
}

export const NOTE_BLOCK_TYPES = ['link', 'text', 'code'];

/**
 * Note tones reuse the GFM alert vocabulary already used by the `[!note]`
 * inline tokens, so a label reads the same way as an alert in the spec it came
 * from. A tone is stored by name rather than by colour: the set stays small,
 * the value survives a theme change, and it can be validated.
 */
export const NOTE_TONES = ['note', 'tip', 'important', 'warning', 'caution'];

export function normalizeNoteTone(value) {
    if (typeof value !== 'string') return '';
    const tone = value.trim().toLowerCase();
    return NOTE_TONES.includes(tone) ? tone : '';
}

export function isSafeChecklistRefLink(link) {
    if (typeof link !== 'string' || !link.trim()) return false;
    try {
        const parsed = new URL(link.trim());
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_) {
        return false;
    }
}

export function normalizeNoteBlock(value, options = {}) {
    const { keepEmpty = false } = options;

    if (typeof value === 'string') {
        const text = value.trim();
        if (text) return { type: 'text', value: text };
        return keepEmpty ? { type: 'text', value: '' } : null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const type = typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
    if (!NOTE_BLOCK_TYPES.includes(type)) return null;

    // Code keeps its own whitespace; the other types are single-line values.
    const rawValue = value.value == null ? '' : String(value.value);
    const normalizedValue = type === 'code' ? rawValue.replace(/\s+$/, '') : rawValue.trim();
    // An empty value is kept while editing: the block was just added, or the
    // user cleared the field and is about to retype it.
    if (!normalizedValue && !keepEmpty) return null;

    const block = { type, value: normalizedValue };

    if (type === 'link') {
        const label = typeof value.label === 'string' ? value.label.trim() : '';
        if (label) block.label = label;
    }
    if (type === 'code') {
        const lang = typeof value.lang === 'string' ? value.lang.trim().toLowerCase() : '';
        if (lang) block.lang = lang;
    }
    return block;
}

/**
 * A note groups related blocks under one label, so a step can carry several
 * notes of different kinds (spec origin, open question, sample code...).
 * An empty label is allowed while the user is still typing one.
 */
export function normalizeNoteEntry(value, options = {}) {
    const { keepEmpty = false } = options;

    if (typeof value === 'string') {
        const text = value.trim();
        if (text) return { label: '', blocks: [{ type: 'text', value: text }] };
        return keepEmpty ? createEmptyNoteEntry() : null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const label = typeof value.label === 'string' ? value.label.trim() : '';
    const source = Array.isArray(value.blocks) ? value.blocks : [];
    const blocks = [];
    source.forEach((item) => {
        const block = normalizeNoteBlock(item, { keepEmpty });
        if (block) blocks.push(block);
    });

    if (!label && blocks.length === 0 && !keepEmpty) return null;

    const entry = { label, blocks };
    const tone = normalizeNoteTone(value.tone);
    if (tone) entry.tone = tone;
    return entry;
}

function convertLegacyRefToNotes(legacyRef) {
    const refs = Array.isArray(legacyRef) ? legacyRef : [legacyRef];
    const notes = [];
    refs.forEach((entry) => {
        if (typeof entry === 'string') {
            const label = entry.trim();
            if (label) notes.push({ label, blocks: [] });
            return;
        }
        if (!entry || typeof entry !== 'object') return;
        const label = typeof entry.slug === 'string' ? entry.slug.trim() : '';
        const link = typeof entry.link === 'string' ? entry.link.trim() : '';
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        const blocks = [];
        if (link) blocks.push({ type: 'link', value: link });
        if (text) blocks.push({ type: 'text', value: text });
        if (label || blocks.length) notes.push({ label, blocks });
    });
    return notes;
}

/**
 * Reads a step's notes, accepting every shape this field has had:
 *   notes: [{ label, blocks }]       -> current
 *   note: "plain text"               -> one unlabeled note
 *   note: [{ type, value }]          -> flat block list, wrapped in one note
 *   ref:  [{ slug, link, text }]     -> one note per ref
 */
export function getChecklistNotes(step) {
    const notes = [];

    if (step?.ref !== undefined && step?.ref !== null) {
        notes.push(...convertLegacyRefToNotes(step.ref));
    }

    const legacyNote = step?.note;
    if (typeof legacyNote === 'string') {
        const text = legacyNote.trim();
        if (text) notes.push({ label: '', blocks: [{ type: 'text', value: text }] });
    } else if (Array.isArray(legacyNote)) {
        // Flat block list: a leading `label` block becomes the note label.
        const blocks = [];
        let label = '';
        legacyNote.forEach((item) => {
            if (item && typeof item === 'object' && item.type === 'label') {
                const value = typeof item.value === 'string' ? item.value.trim() : '';
                if (value && !label) label = value;
                return;
            }
            const block = normalizeNoteBlock(item);
            if (block) blocks.push(block);
        });
        if (label || blocks.length) notes.push({ label, blocks });
    }

    if (Array.isArray(step?.notes)) {
        // An empty note is kept: the user just created that card and is about
        // to type into it, so dropping it would make the card disappear.
        step.notes.forEach((item) => {
            const note = normalizeNoteEntry(item, { keepEmpty: true });
            if (note) notes.push(note);
        });
    }

    return notes;
}

export function serializeNotes(notes) {
    return notes.map((note) => {
        const serialized = { label: note.label || '' };
        const tone = normalizeNoteTone(note.tone);
        if (tone) serialized.tone = tone;
        serialized.blocks = (note.blocks || []).map(block => ({ ...block }));
        return serialized;
    });
}

export function hasLegacyChecklistNoteShape(step) {
    if (step?.ref !== undefined && step?.ref !== null) {
        return Array.isArray(step.ref) ? step.ref.length > 0 : true;
    }
    const legacyNote = step?.note;
    if (typeof legacyNote === 'string') return legacyNote.trim().length > 0;
    if (Array.isArray(legacyNote)) return legacyNote.length > 0;
    return false;
}

export function createEmptyNoteEntry() {
    return { label: '', blocks: [] };
}

/**
 * Builds one chip per note for the table. The label is what the user typed;
 * without one, fall back to a link label, its host, then a generic index.
 */
export function getChecklistNoteChips(step) {
    return getChecklistNotes(step).map((note, noteIndex) => {
        const linkBlock = note.blocks.find(block => block.type === 'link');
        let label = note.label;
        if (!label && linkBlock) {
            label = linkBlock.label || formatLinkHost(linkBlock.value);
        }
        if (!label) label = `Note ${noteIndex + 1}`;

        const link = linkBlock && isSafeChecklistRefLink(linkBlock.value)
            ? linkBlock.value
            : '';

        return {
            noteIndex,
            label,
            link,
            hasLink: Boolean(link),
            tone: normalizeNoteTone(note.tone),
            blockCount: note.blocks.length
        };
    });
}

function formatLinkHost(link) {
    try {
        return new URL(link).hostname.replace(/^www\./, '');
    } catch (_) {
        return 'link';
    }
}

function normalizeStepFieldForEditor(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => (item == null ? '' : String(item).trim()))
            .filter(Boolean)
            .join('\n');
    }
    if (value == null) return '';
    return String(value).trim();
}

export function normalizeChecklistDividerValue(value) {
    if (value === true) return true;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (value && typeof value === 'object' && 'value' in value) {
        return normalizeChecklistDividerValue(value.value);
    }
    return null;
}

export function getChecklistDividerColor(step) {
    const divider = step?.divider;
    if (divider && typeof divider === 'object' && typeof divider.color === 'string') {
        return divider.color.trim() || null;
    }
    return null;
}

export function buildChecklistDividerData(textValue, color) {
    if (!color) return textValue;
    return { value: textValue, color };
}

export function normalizeEditableChecklistDividerValue(value) {
    const normalized = normalizeChecklistDividerValue(value);
    return normalized === null ? true : normalized;
}

export function isChecklistDividerStep(step) {
    return normalizeChecklistDividerValue(step?.divider) !== null;
}

export function getChecklistDividerTitle(step) {
    const normalized = normalizeChecklistDividerValue(step?.divider);
    if (typeof normalized === 'string') return normalized;
    return normalized === true ? 'divider' : '';
}

export function updatePassHeaderState(passHeaderToggle, currentData) {
    if (!passHeaderToggle) return;

    const steps = (currentData && Array.isArray(currentData.steps)) ? currentData.steps : [];
    const checkableSteps = steps.filter(step => !isChecklistDividerStep(step));
    const hasSteps = checkableSteps.length > 0;
    const allPassed = hasSteps && checkableSteps.every(step => step.pass === true);

    passHeaderToggle.classList.toggle('all-passed', allPassed);
    passHeaderToggle.classList.toggle('disabled', !hasSteps);
    passHeaderToggle.setAttribute('aria-pressed', allPassed ? 'true' : 'false');
}

export function computeChecklistProgress(currentData) {
    const steps = (currentData && Array.isArray(currentData.steps)) ? currentData.steps : [];
    const checkableSteps = steps.filter(step => !isChecklistDividerStep(step));
    const total = checkableSteps.length;
    const passed = checkableSteps.filter(step => step?.pass === true).length;
    return {
        passed,
        total,
        hasSteps: total > 0,
        allPassed: total > 0 && passed === total
    };
}

export function updateChecklistProgressIndicator(indicator, currentData) {
    if (!indicator) return;

    const { passed, total, hasSteps, allPassed } = computeChecklistProgress(currentData);

    indicator.hidden = !hasSteps;
    indicator.classList.toggle('is-complete', allPassed);

    if (!hasSteps) {
        indicator.textContent = '';
        indicator.removeAttribute('title');
        return;
    }

    indicator.textContent = `${passed}/${total}`;
    indicator.title = allPassed
        ? `All ${total} steps passed`
        : `${passed} of ${total} steps passed`;
}

export function renderFileTree(container, workspace, options = {}) {
    const { 
        activeFileDirty, 
        canMutateTree,
        showInlineActions,
        onOpenContextMenu,
        onMoveFile,
        pendingCopyFileIds,
        fileSearchState,
        onToggleFolder, 
        onSelectFile, 
        onRenameFolder, 
        onDeleteFolder, 
        onRenameFile, 
        onDeleteFile 
    } = options;

    if (!container || !workspace) return;
    container.innerHTML = '';
    if (typeof onOpenContextMenu === 'function') {
        container.oncontextmenu = (event) => {
            event.preventDefault();
            onOpenContextMenu({
                type: 'empty',
                id: null,
                x: event.clientX,
                y: event.clientY
            });
        };
    } else {
        container.oncontextmenu = null;
    }

    const activeFile = getActiveFile(workspace);
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const selectedFolderId = workspace.uiState.lastSelectionType === 'folder'
        ? workspace.uiState.selectedFolderId
        : null;
    const selectedFileId = workspace.uiState.lastSelectionType === 'file'
        ? workspace.uiState.selectedFileId
        : null;
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    const pendingCopySet = pendingCopyFileIds instanceof Set
        ? pendingCopyFileIds
        : new Set(Array.isArray(pendingCopyFileIds) ? pendingCopyFileIds : []);
    const searchQuery = String(fileSearchState?.query || '').trim();
    const hasSearchQuery = searchQuery.length > 0;
    const searchNeedle = searchQuery.toLowerCase();
    const searchMatchesByFileId = fileSearchState?.matchesByFileId instanceof Map
        ? fileSearchState.matchesByFileId
        : new Map();
    const canDragMove = Boolean(canMutateTree && typeof onMoveFile === 'function');
    const DRAG_FILE_MIME = 'application/x-qa-scenario-file-id';
    let draggingFileId = '';

    const folderById = new Map(workspace.folders.map(folder => [folder.id, folder]));
    const rootFolders = [];
    const childFoldersByParentId = new Map();
    workspace.folders.forEach((folder) => {
        const parentId = folder.parentId;
        if (!parentId || !folderById.has(parentId)) {
            rootFolders.push(folder);
            return;
        }
        if (!childFoldersByParentId.has(parentId)) {
            childFoldersByParentId.set(parentId, []);
        }
        childFoldersByParentId.get(parentId).push(folder);
    });

    const filesByFolderId = new Map();
    workspace.files.forEach((file) => {
        if (!filesByFolderId.has(file.folderId)) {
            filesByFolderId.set(file.folderId, []);
        }
        filesByFolderId.get(file.folderId).push(file);
    });

    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });

    const visibleFolderIds = new Set();
    if (hasSearchQuery) {
        workspace.files.forEach((file) => {
            if (!searchMatchesByFileId.has(file.id)) return;
            let cursor = file.folderId;
            while (cursor) {
                if (visibleFolderIds.has(cursor)) break;
                visibleFolderIds.add(cursor);
                const parentFolder = folderById.get(cursor);
                cursor = parentFolder?.parentId || null;
            }
        });
    }

    const appendHighlightedText = (target, sourceText) => {
        target.textContent = '';
        const text = String(sourceText || '');
        if (!hasSearchQuery || !searchNeedle) {
            target.textContent = text;
            return;
        }

        const lowered = text.toLowerCase();
        let cursor = 0;
        while (cursor < text.length) {
            const found = lowered.indexOf(searchNeedle, cursor);
            if (found < 0) {
                target.appendChild(document.createTextNode(text.slice(cursor)));
                break;
            }

            if (found > cursor) {
                target.appendChild(document.createTextNode(text.slice(cursor, found)));
            }

            const mark = document.createElement('mark');
            mark.className = 'tree-search-hit';
            mark.textContent = text.slice(found, found + searchNeedle.length);
            target.appendChild(mark);
            cursor = found + searchNeedle.length;
        }
    };

    const getDraggedFileId = (dataTransfer) => {
        if (!dataTransfer || typeof dataTransfer.getData !== 'function') return '';
        return dataTransfer.getData(DRAG_FILE_MIME) || dataTransfer.getData('text/plain') || '';
    };

    const getCurrentDraggedFileId = (dataTransfer) => draggingFileId || getDraggedFileId(dataTransfer);

    const clearDropTargets = () => {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tree-folder-row.is-drop-target').forEach((node) => {
            node.classList.remove('is-drop-target');
        });
    };

    const moveFileToFolder = (fileId, folderId) => {
        if (!canDragMove) return;
        const maybePromise = onMoveFile(fileId, folderId);
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch((error) => {
                console.error('[qa-scenario] failed to move file by drag and drop', error);
            });
        }
    };

    const renderFolder = (folder, depth = 0) => {
        if (hasSearchQuery && !visibleFolderIds.has(folder.id)) {
            return null;
        }

        const folderWrap = document.createElement('div');
        folderWrap.className = 'tree-folder';

        const folderRow = document.createElement('div');
        folderRow.className = 'tree-folder-row';
        folderRow.style.paddingLeft = `${10 + (depth * 16)}px`;
        folderRow.setAttribute('role', 'button');
        folderRow.tabIndex = 0;
        if (folder.id === activeFolderId) folderRow.classList.add('active-parent');
        if (folder.id === selectedFolderId) folderRow.classList.add('active-target');

        const isExpanded = hasSearchQuery ? true : expandedSet.has(folder.id);
        const chevron = document.createElement('span');
        chevron.className = 'tree-chevron';
        chevron.textContent = isExpanded ? '▾' : '▸';

        const icon = document.createElement('span');
        icon.className = 'tree-icon tree-icon-folder';

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = folder.name;
        name.title = folder.path || folder.name;

        const folderActionItems = [];
        if (showInlineActions && canMutateTree && typeof onRenameFolder === 'function') {
            folderActionItems.push({ label: 'Edit', onClick: () => onRenameFolder(folder.id) });
        }
        if (showInlineActions && canMutateTree && typeof onDeleteFolder === 'function') {
            folderActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFolder(folder.id) });
        }
        const folderActions = createTreeRowActions(folderActionItems);

        folderRow.appendChild(chevron);
        folderRow.appendChild(icon);
        folderRow.appendChild(name);
        if (folderActions) {
            folderRow.appendChild(folderActions);
        }

        if (canDragMove) {
            folderRow.addEventListener('dragover', (event) => {
                const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                if (!draggedFileId) return;
                const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                if (!draggedFile || draggedFile.folderId === folder.id) return;
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
                folderRow.classList.add('is-drop-target');
            });

            folderRow.addEventListener('dragleave', () => {
                folderRow.classList.remove('is-drop-target');
            });

            folderRow.addEventListener('drop', (event) => {
                folderRow.classList.remove('is-drop-target');
                const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                if (!draggedFileId) return;
                const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                if (!draggedFile || draggedFile.folderId === folder.id) return;
                event.preventDefault();
                event.stopPropagation();
                draggingFileId = '';
                clearDropTargets();
                moveFileToFolder(draggedFileId, folder.id);
            });
        }

        folderRow.addEventListener('click', () => onToggleFolder(folder.id));
        if (typeof onOpenContextMenu === 'function') {
            folderRow.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenContextMenu({
                    type: 'folder',
                    id: folder.id,
                    x: event.clientX,
                    y: event.clientY
                });
            });
        }
        folderWrap.appendChild(folderRow);

        if (isExpanded) {
            const fileList = document.createElement('div');
            fileList.className = 'tree-file-list';

            const childFolders = (childFoldersByParentId.get(folder.id) || [])
                .sort(byName)
                .filter((childFolder) => !hasSearchQuery || visibleFolderIds.has(childFolder.id));
            childFolders.forEach((childFolder) => {
                const childNode = renderFolder(childFolder, depth + 1);
                if (childNode) {
                    fileList.appendChild(childNode);
                }
            });

            const files = (filesByFolderId.get(folder.id) || [])
                .sort(byName)
                .filter((file) => !hasSearchQuery || searchMatchesByFileId.has(file.id));

            if (files.length === 0 && childFolders.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tree-empty';
                empty.textContent = 'No files';
                empty.style.paddingLeft = `${40 + (depth * 16)}px`;
                fileList.appendChild(empty);
            } else {
                files.forEach(file => {
                    const fileRow = document.createElement('div');
                    fileRow.className = 'tree-file-row';
                    fileRow.style.paddingLeft = `${28 + (depth * 16)}px`;
                    const isActive = activeFile && activeFile.id === file.id;
                    const isPendingCopy = pendingCopySet.has(file.id);
                    if (file.id === selectedFileId) fileRow.classList.add('is-selected');
                    if (isActive) fileRow.classList.add('is-open');
                    if (isPendingCopy) fileRow.classList.add('is-pending-copy');

                    const openIndicator = document.createElement('span');
                    openIndicator.className = `tree-open-indicator${isActive ? ' is-active' : ''}`;

                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'tree-icon tree-icon-file';

                    const fileTextWrap = document.createElement('span');
                    fileTextWrap.className = 'tree-file-text';

                    const fileName = document.createElement('span');
                    fileName.className = 'tree-name';

                    const visibleFileName = `${file.name}${isActive && activeFileDirty ? ' *' : ''}`;
                    fileName.title = visibleFileName;
                    appendHighlightedText(fileName, visibleFileName);
                    fileTextWrap.appendChild(fileName);

                    const matchInfo = searchMatchesByFileId.get(file.id);
                    const hasContentSnippet = Boolean(hasSearchQuery && matchInfo?.snippet);
                    if (hasContentSnippet) {
                        fileRow.classList.add('has-search-snippet');
                        const snippet = document.createElement('span');
                        snippet.className = 'tree-search-snippet';
                        appendHighlightedText(snippet, matchInfo.snippet);
                        fileTextWrap.appendChild(snippet);
                    }

                    const fileActionItems = [];
                    if (showInlineActions && canMutateTree && typeof onRenameFile === 'function') {
                        fileActionItems.push({ label: 'Edit', onClick: () => onRenameFile(file.id) });
                    }
                    if (showInlineActions && canMutateTree && typeof onDeleteFile === 'function') {
                        fileActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFile(file.id) });
                    }
                    const fileActions = createTreeRowActions(fileActionItems);

                    const searchBadges = document.createElement('span');
                    searchBadges.className = 'tree-search-badges';
                    if (hasSearchQuery && matchInfo?.nameMatched) {
                        const nameBadge = document.createElement('span');
                        nameBadge.className = 'tree-search-badge';
                        nameBadge.textContent = 'Name';
                        searchBadges.appendChild(nameBadge);
                    }
                    if (hasSearchQuery && Number(matchInfo?.contentMatchCount) > 0) {
                        const contentBadge = document.createElement('span');
                        contentBadge.className = 'tree-search-badge';
                        contentBadge.textContent = `${matchInfo.contentMatchCount} matches`;
                        contentBadge.title = 'Content matches';
                        searchBadges.appendChild(contentBadge);
                    }

                    fileRow.appendChild(openIndicator);
                    fileRow.appendChild(fileIcon);
                    fileRow.appendChild(fileTextWrap);
                    if (isPendingCopy) {
                        const pendingBadge = document.createElement('span');
                        pendingBadge.className = 'tree-copy-pending-badge';
                        pendingBadge.textContent = '복사 중...';
                        fileRow.appendChild(pendingBadge);
                    }
                    if (searchBadges.childElementCount > 0) {
                        fileRow.appendChild(searchBadges);
                    }
                    if (fileActions) {
                        fileRow.appendChild(fileActions);
                    }
                    if (canDragMove) {
                        fileRow.draggable = true;
                        fileRow.addEventListener('dragstart', (event) => {
                            if (!event.dataTransfer) return;
                            draggingFileId = file.id;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData(DRAG_FILE_MIME, file.id);
                            event.dataTransfer.setData('text/plain', file.id);
                            fileRow.classList.add('is-dragging');
                        });
                        fileRow.addEventListener('dragend', () => {
                            draggingFileId = '';
                            fileRow.classList.remove('is-dragging');
                            clearDropTargets();
                        });
                    }
                    fileRow.addEventListener('click', () => onSelectFile(file.id));
                    if (typeof onOpenContextMenu === 'function') {
                        fileRow.addEventListener('contextmenu', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenContextMenu({
                                type: 'file',
                                id: file.id,
                                x: event.clientX,
                                y: event.clientY
                            });
                        });
                    }
                    fileList.appendChild(fileRow);
                });
            }
            folderWrap.appendChild(fileList);
        }
        return folderWrap;
    };

    if (hasSearchQuery && searchMatchesByFileId.size === 0) {
        const empty = document.createElement('div');
        empty.className = 'tree-empty';
        empty.textContent = `No matching files for "${searchQuery}"`;
        container.appendChild(empty);
        return;
    }

    rootFolders
        .sort(byName)
        .forEach((folder) => {
            const folderNode = renderFolder(folder);
            if (folderNode) {
                container.appendChild(folderNode);
            }
        });
}

function createAddRowButton(label, insertIndex, onClick, title, className = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `checklist-add-row-btn ${className}`.trim();
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(insertIndex);
    });
    return btn;
}

function appendAddRowButton(container, insertIndex, options = {}) {
    const {
        stepTitle = 'Add step below',
        dividerTitle = 'Add divider below',
        zoneClassName = '',
        onAddStep,
        onAddDivider
    } = options;
    const wrapperRow = document.createElement('tr');
    wrapperRow.className = `checklist-add-row-zone ${zoneClassName}`.trim();
    const cell = document.createElement('td');
    cell.colSpan = 6;
    const actions = document.createElement('div');
    actions.className = 'checklist-add-row-actions';
    if (typeof onAddStep === 'function') {
        actions.appendChild(createAddRowButton('+', insertIndex, onAddStep, stepTitle));
    }
    if (typeof onAddDivider === 'function') {
        actions.appendChild(createAddRowButton('/', insertIndex, onAddDivider, dividerTitle, 'is-divider'));
    }
    cell.appendChild(actions);
    wrapperRow.appendChild(cell);
    container.appendChild(wrapperRow);
}

const CHECKLIST_REF_LINK_ICON = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M3.75 2h3a.75.75 0 0 1 0 1.5h-3a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3a.75.75 0 0 1 1.5 0v3A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5A1.75 1.75 0 0 1 3.75 2Zm6.5 0h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V4.56L8.56 9.25a.75.75 0 1 1-1.06-1.06L12.19 3.5h-1.94a.75.75 0 0 1 0-1.5Z"></path></svg>';

const CHECKLIST_NOTE_ICON = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M1 2.75A1.75 1.75 0 0 1 2.75 1h10.5A1.75 1.75 0 0 1 15 2.75v8.5A1.75 1.75 0 0 1 13.25 13H7.06l-3.53 2.72A.75.75 0 0 1 2.3 15.1l.2-2.1h-.25A1.75 1.75 0 0 1 1 11.25v-8.5Zm3.5 2a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z"></path></svg>';

function renderChecklistNoteCell(cell, options) {
    if (!cell) return;
    const { index, chips, activeNoteKey, onOpenStepDetail } = options;

    const open = (target, event) => {
        event.stopPropagation();
        if (typeof onOpenStepDetail === 'function') onOpenStepDetail(index, target);
    };

    // Clicking anywhere in the cell opens the panel; the chips and the add
    // button narrow that down to a specific note or a new one.
    cell.addEventListener('click', (event) => open({ type: 'panel' }, event));

    const wrapper = document.createElement('div');
    wrapper.className = 'checklist-note-wrapper';

    chips.forEach((chip) => {
        // The label button and the link anchor are siblings: an anchor nested
        // inside a button is invalid HTML and swallows the navigation.
        const group = document.createElement('span');
        group.className = 'checklist-note-chip-group';
        if (chip.tone) group.classList.add(`is-tone-${chip.tone}`);
        if (activeNoteKey === chip.noteIndex) group.classList.add('is-active');

        const chipEl = document.createElement('button');
        chipEl.type = 'button';
        chipEl.className = 'checklist-note-chip';

        const labelEl = document.createElement('span');
        labelEl.className = 'checklist-note-chip__label';
        labelEl.textContent = chip.label;
        chipEl.appendChild(labelEl);

        const blockLabel = chip.blockCount === 1 ? '1 block' : `${chip.blockCount} blocks`;
        chipEl.title = `Open note "${chip.label}" (${blockLabel})`;
        chipEl.setAttribute('aria-label', `Open note ${chip.label}, ${blockLabel}`);
        chipEl.addEventListener('click', (event) => {
            open({ type: 'note', noteIndex: chip.noteIndex }, event);
        });
        group.appendChild(chipEl);

        if (chip.link) {
            const linkEl = document.createElement('a');
            linkEl.className = 'checklist-note-chip__link';
            linkEl.href = chip.link;
            // A named target reuses one background tab instead of piling up a
            // new one per click, and never navigates this window.
            linkEl.target = 'qa-scenario-reference';
            linkEl.rel = 'noopener noreferrer';
            linkEl.innerHTML = CHECKLIST_REF_LINK_ICON;
            linkEl.title = `Open ${chip.link}`;
            linkEl.setAttribute('aria-label', `Open link for ${chip.label} in a new tab`);
            // The cell and the row both open the panel on click, so the anchor
            // must stop the event from reaching them.
            linkEl.addEventListener('click', (event) => {
                event.stopPropagation();
            });
            group.appendChild(linkEl);
        }

        wrapper.appendChild(group);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'checklist-note-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add note';
    addBtn.setAttribute('aria-label', 'Add note');
    addBtn.addEventListener('click', (event) => open({ type: 'new' }, event));
    wrapper.appendChild(addBtn);

    cell.appendChild(wrapper);
}

export function renderChecklist(container, data, options = {}) {
    const { onUpdatePass, onUpdateStep, onHighlightStep, onScenarioTitleUpdate, onAddStep, onAddDivider, onOpenChecklistContextMenu, onOpenStepDetail, activeNoteIndex = null, activeNoteKey = null } = options;
    if (!container) return;
    const canInsertRows = typeof onAddStep === 'function' || typeof onAddDivider === 'function';

    const blurOnEscape = (editable) => {
        editable.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.currentTarget?.blur === 'function') {
                event.currentTarget.blur();
            }
        });
    };

    if (!data || !data.steps || !Array.isArray(data.steps)) {
        container.innerHTML = '<tr class="empty-state"><td colspan="6">JSON structure must contain a "steps" array.</td></tr>';
        if (onScenarioTitleUpdate) onScenarioTitleUpdate("No valid steps found", false);
        return;
    }

    if (onScenarioTitleUpdate) {
        onScenarioTitleUpdate(data.scenario || "Untitled Scenario", Object.prototype.hasOwnProperty.call(data, 'scenario'));
    }

    if (data.steps.length === 0) {
        container.innerHTML = '';
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-state';
        emptyRow.innerHTML = '<td colspan="6">No steps in this scenario file.</td>';
        container.appendChild(emptyRow);
        if (canInsertRows) {
            appendAddRowButton(container, 0, {
                stepTitle: 'Add first step',
                dividerTitle: 'Add first divider',
                onAddStep,
                onAddDivider
            });
        }
        return;
    }

    container.innerHTML = '';
    let visibleIndex = 0;
    data.steps.forEach((step, index) => {
        if (isChecklistDividerStep(step)) {
            const dividerRow = document.createElement('tr');
            dividerRow.className = 'checklist-divider-row';
            const dividerCell = document.createElement('td');
            dividerCell.colSpan = 6;
            const dividerContent = document.createElement('div');
            dividerContent.className = 'cell-content checklist-divider-content';
            dividerContent.contentEditable = 'true';
            dividerContent.dataset.field = 'divider';

            const rawDividerText = getChecklistDividerTitle(step);
            const dividerColor = getChecklistDividerColor(step);
            dividerContent.dataset.rawValue = rawDividerText;
            if (dividerColor) dividerContent.dataset.dividerColor = dividerColor;
            dividerContent.innerHTML = formatChecklistCellContent(rawDividerText);

            if (dividerColor) {
                dividerRow.style.setProperty('--divider-color', dividerColor);
                dividerRow.classList.add('has-custom-color');
            }

            dividerContent.addEventListener('focus', (event) => {
                event.target.textContent = event.target.dataset.rawValue;
            });
            dividerContent.addEventListener('input', (event) => {
                const color = event.target.dataset.dividerColor || '';
                const text = event.target.innerText;
                onUpdateStep(index, 'divider', color ? buildChecklistDividerData(text, color) : text);
            });
            dividerContent.addEventListener('blur', (event) => {
                const color = event.target.dataset.dividerColor || '';
                const nextTextValue = normalizeEditableChecklistDividerValue(event.target.innerText);
                const nextDividerValue = color ? buildChecklistDividerData(nextTextValue, color) : nextTextValue;
                onUpdateStep(index, 'divider', nextDividerValue);

                const nextLabel = getChecklistDividerTitle({ divider: nextDividerValue });
                event.target.dataset.rawValue = nextLabel;
                event.target.innerHTML = formatChecklistCellContent(nextLabel);
            });
            blurOnEscape(dividerContent);

            const dividerInner = document.createElement('div');
            dividerInner.className = 'checklist-divider-inner';

            const dividerSpacer = document.createElement('span');
            dividerSpacer.className = 'checklist-divider-spacer';
            dividerSpacer.setAttribute('aria-hidden', 'true');

            dividerInner.appendChild(dividerSpacer);
            dividerInner.appendChild(dividerContent);
            dividerCell.appendChild(dividerInner);
            dividerRow.appendChild(dividerCell);
            dividerRow.addEventListener('click', () => {
                const rows = container.querySelectorAll('tr');
                rows.forEach((row) => {
                    row.classList.remove('selected-row');
                });
                dividerRow.classList.add('selected-row');
                onHighlightStep(index);
            });
            if (typeof onOpenChecklistContextMenu === 'function') {
                dividerRow.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenChecklistContextMenu({ index, isDivider: true, x: event.clientX, y: event.clientY });
                });
            }
            if (index === 0 && canInsertRows) {
                appendAddRowButton(container, 0, {
                    stepTitle: 'Add step above',
                    dividerTitle: 'Add divider above',
                    zoneClassName: 'is-before-first-row',
                    onAddStep,
                    onAddDivider
                });
            }
            container.appendChild(dividerRow);
            if (canInsertRows) {
                appendAddRowButton(container, index + 1, {
                    onAddStep,
                    onAddDivider
                });
            }
            return;
        }

        visibleIndex += 1;
        const tr = document.createElement('tr');
        const isPassed = step.pass === true;
        
        tr.innerHTML = `
            <td class="col-num">${visibleIndex}</td>
            <td class="col-given"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="given"></div></td>
            <td class="col-when"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="when"></div></td>
            <td class="col-then"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="then"></div></td>
            <td class="col-pass">
                <label class="checkbox-container">
                    <input type="checkbox" data-index="${index}" ${isPassed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
            <td class="col-note"></td>
        `;

        const noteChips = getChecklistNoteChips(step);
        const isActiveStep = activeNoteIndex === index;
        renderChecklistNoteCell(tr.querySelector('.col-note'), {
            index,
            chips: noteChips,
            activeNoteKey: isActiveStep ? activeNoteKey : null,
            onOpenStepDetail
        });
        if (noteChips.length > 0) tr.classList.add('has-note');
        if (isActiveStep) tr.classList.add('is-note-active');

        const populateCell = (field, val) => {
            const cell = tr.querySelector(`[data-field="${field}"]`);
            cell.dataset.rawValue = val;
            cell.innerHTML = formatChecklistCellContent(val);
            
            cell.addEventListener('focus', (e) => { e.target.textContent = e.target.dataset.rawValue; });
            cell.addEventListener('input', (e) => onUpdateStep(index, field, e.target.innerText));
            cell.addEventListener('blur', (e) => {
                let v = e.target.innerText.trim();
                if (v === '-') v = '';
                onUpdateStep(index, field, v);
                e.target.dataset.rawValue = v;
                e.target.innerHTML = formatChecklistCellContent(v);
            });
            blurOnEscape(cell);
        };

        populateCell('given', normalizeStepFieldForEditor(step.given));
        populateCell('when', normalizeStepFieldForEditor(step.when));
        populateCell('then', normalizeStepFieldForEditor(step.then));

        tr.addEventListener('click', () => {
            const rows = container.querySelectorAll('tr');
            rows.forEach((row) => {
                row.classList.remove('selected-row');
            });
            tr.classList.add('selected-row');
            onHighlightStep(index);
        });
        if (typeof onOpenChecklistContextMenu === 'function') {
            tr.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenChecklistContextMenu({ index, x: event.clientX, y: event.clientY });
            });
        }

        tr.querySelector('.col-pass input').addEventListener('change', (e) => onUpdatePass(index, e.target.checked));
        if (index === 0 && canInsertRows) {
            appendAddRowButton(container, 0, {
                stepTitle: 'Add step above',
                dividerTitle: 'Add divider above',
                zoneClassName: 'is-before-first-row',
                onAddStep,
                onAddDivider
            });
        }
        container.appendChild(tr);
        if (canInsertRows) {
            appendAddRowButton(container, index + 1, {
                onAddStep,
                onAddDivider
            });
        }
    });
}
