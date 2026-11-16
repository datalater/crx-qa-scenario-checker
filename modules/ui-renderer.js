import { getActiveFile } from './workspace-manager.js';
import { getChecklistAlertConfig, renderChecklistAlertToken } from './checklist-alerts.js';
import { findNoteInlineTokens } from './note-inline.js';
import { stepLinesToText } from './step-lines.js';
import { CODE_VIEWS, hasCodeView, resolveCodeView, storedCodeView } from './code-view.js';
import { applyCodeHeight, createCodeHeightHandle, parseCodeHeightPx } from './code-height.js';
import {
    getDividerTitle,
    isDivider,
    parseDivider,
    DEFAULT_DIVIDER_TYPE,
    DIVIDER_HEIGHTS,
    DIVIDER_WRAPS,
    PLAIN_DIVIDER_LANG,
    resolveDividerHeight,
    resolveDividerLang,
    resolveDividerType,
    resolveDividerView,
    resolveDividerWrap,
    serializeDivider
} from './divider-model.js';

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

/**
 * Renders a cell's text. Every cell understands backtick tokens; a `rich`
 * cell (the note column) also turns links and images into chips.
 */
export function formatChecklistCellContent(rawValue, options = {}) {
    if (!rawValue) return '-';
    const source = String(rawValue);
    if (options.rich !== true) return formatChecklistCodeTokens(source);

    let cursor = 0;
    let rendered = '';
    findNoteInlineTokens(source).forEach((token) => {
        rendered += formatChecklistCodeTokens(source.slice(cursor, token.from));
        rendered += renderNoteChip(token);
        cursor = token.to;
    });
    return rendered + formatChecklistCodeTokens(source.slice(cursor));
}

function formatChecklistCodeTokens(source) {
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

const NOTE_CHIP_ICONS = {
    link: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"></path></svg>',
    image: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M16 13.25A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75ZM1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h.94l.03-.03 6.077-6.078a1.75 1.75 0 0 1 2.412-.06L14.5 10.31V2.75a.25.25 0 0 0-.25-.25Zm12.5 11a.25.25 0 0 0 .25-.25v-.917l-4.298-3.889a.25.25 0 0 0-.344.009L4.81 13.5ZM7 6a2 2 0 1 1-3.999.001A2 2 0 0 1 7 6ZM5.5 6a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0Z"></path></svg>'
};

/**
 * A chip carries its target in a data attribute; the note cell controller
 * opens the link or the image from one listener on the table. It is not an
 * anchor because the cell swaps back to its raw text as soon as it is
 * focused, which would remove an anchor before its click arrives.
 */
function renderNoteChip(token) {
    const target = escapeChecklistAttribute(token.target);
    const hint = token.type === 'image' ? '클릭: 크게 보기' : '클릭: 새 탭에서 열기';
    return `<span class="note-chip note-chip--${token.type}" contenteditable="false" role="${token.type === 'image' ? 'button' : 'link'}"`
        + ` data-note-${token.type}="${target}" title="${target}\n${hint}">`
        + `<span class="note-chip__icon">${NOTE_CHIP_ICONS[token.type]}</span>`
        + `<span class="note-chip__label">${escapeChecklistHtml(token.label)}</span></span>`;
}

function escapeChecklistAttribute(value) {
    return escapeChecklistHtml(value).replace(/"/g, '&quot;');
}

function escapeChecklistHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderChecklistInlineToken(token) {
    if (token === '\\n') {
        return '<span class="checklist-line-spacer" role="separator"></span>';
    }
    const alertConfig = getChecklistAlertConfig(token);
    if (alertConfig) {
        return renderChecklistAlertToken(alertConfig);
    }
    return `<code class="inline-code">${escapeChecklistHtml(token)}</code>`;
}

/**
 * Row filters reuse the GFM alert vocabulary of the `[!note]` inline tokens:
 * a filter keeps the rows that carry that token in any of their cells.
 */
export const NOTE_ALERT_FILTERS = ['note', 'tip', 'important', 'warning', 'caution'];

const STEP_TEXT_FIELDS = ['given', 'when', 'then', 'note'];

export const CHECKLIST_FILTERS = ['all', 'outline', ...NOTE_ALERT_FILTERS];

export function normalizeChecklistFilter(value) {
    const filter = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return CHECKLIST_FILTERS.includes(filter) ? filter : 'all';
}

/**
 * `outline` hides every step, leaving the dividers as a table of contents.
 * An alert filter keeps the steps that carry that alert token.
 */
export function stepMatchesChecklistFilter(step, filter) {
    if (filter === 'all') return true;
    if (filter === 'outline') return false;
    const token = `\`[!${filter}]\``;
    return STEP_TEXT_FIELDS.some(field => (
        stepLinesToText(step?.[field]).toLowerCase().includes(token)
    ));
}

/**
 * A divider is kept only when the section it opens still has a visible step,
 * so filtering never leaves a heading with nothing under it.
 */
export function buildChecklistVisibility(steps, filter) {
    const list = Array.isArray(steps) ? steps : [];
    const visible = list.map(step => (
        isChecklistDividerStep(step) ? false : stepMatchesChecklistFilter(step, filter)
    ));

    if (filter === 'outline') return list.map(step => isChecklistDividerStep(step));

    // The `all` view shows the scenario as authored, so every divider stays put
    // even when it has no step under it (e.g. two dividers in a row).
    if (filter === 'all') return list.map(() => true);

    list.forEach((step, index) => {
        if (!isChecklistDividerStep(step)) return;
        for (let i = index + 1; i < list.length; i += 1) {
            if (isChecklistDividerStep(list[i])) break;
            if (visible[i]) {
                visible[index] = true;
                break;
            }
        }
    });

    return visible;
}

// Thin wrappers over divider-model so existing callers keep their names.
export function normalizeChecklistDividerValue(value) {
    const divider = parseDivider(value);
    if (!divider) return null;
    return divider.value || true;
}

export function getChecklistDividerColor(step) {
    return parseDivider(step?.divider)?.color || null;
}

export function normalizeEditableChecklistDividerValue(value) {
    const normalized = normalizeChecklistDividerValue(value);
    return normalized === null ? true : normalized;
}

export function isChecklistDividerStep(step) {
    return isDivider(step?.divider);
}

/** Section headings: type text, default color, non-empty title. */
export function isStickyHeadingDivider(divider, title) {
    return divider?.type === DEFAULT_DIVIDER_TYPE
        && !divider.color
        && String(title ?? '').trim().length > 0;
}

function addPinnedRowControls(row, controlsHost) {
    row.classList.add('is-pinned-row');
    const icon = document.createElement('span');
    icon.className = 'checklist-pin-icon';
    icon.title = '고정된 행';
    icon.setAttribute('aria-label', '고정된 행');
    icon.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M5 1h6v1l-1 1v4l2 2v1H8.5v5h-1v-5H4V9l2-2V3L5 2z"/></svg>';
    (row.querySelector('.col-num') || controlsHost).prepend(icon);
    controlsHost.appendChild(createStickyJumpButton());
}

function createStickyJumpButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'checklist-sticky-jump';
    button.title = '원래 위치로 이동';
    button.setAttribute('aria-label', '원래 위치로 이동');
    button.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M3 2.75A.75.75 0 0 1 3.75 2h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 2.75Zm4.47 2.72a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 1 1-1.06 1.06L8.75 7.81v5.44a.75.75 0 0 1-1.5 0V7.81L5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25Z"></path></svg>';
    return button;
}

export function getChecklistDividerTitle(step) {
    return getDividerTitle(step?.divider);
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
        onMoveFolder,
        canDropFolder,
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
    const canDragFolders = Boolean(canMutateTree && typeof onMoveFolder === 'function');
    const DRAG_FILE_MIME = 'application/x-qa-scenario-file-id';
    const DRAG_FOLDER_MIME = 'application/x-qa-scenario-folder-id';
    let draggingFileId = '';
    let draggingFolderId = '';
    const canDropDraggedFolder = (targetFolderId) => Boolean(draggingFolderId)
        && (typeof canDropFolder !== 'function' || canDropFolder(draggingFolderId, targetFolderId));

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
        container.classList.remove('is-drop-target-root');
    };

    const moveFolderToFolder = (folderId, targetFolderId) => {
        if (!canDragFolders) return;
        const maybePromise = onMoveFolder(folderId, targetFolderId);
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch((error) => {
                console.error('[qa-scenario] failed to move folder by drag and drop', error);
            });
        }
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

        if (canDragMove || canDragFolders) {
            folderRow.addEventListener('dragover', (event) => {
                if (draggingFolderId) {
                    if (!canDropDraggedFolder(folder.id)) return;
                } else {
                    const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                    if (!draggedFileId || !canDragMove) return;
                    const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                    if (!draggedFile || draggedFile.folderId === folder.id) return;
                }
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
                if (draggingFolderId) {
                    if (!canDropDraggedFolder(folder.id)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const movedFolderId = draggingFolderId;
                    draggingFolderId = '';
                    clearDropTargets();
                    moveFolderToFolder(movedFolderId, folder.id);
                    return;
                }
                const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                if (!draggedFileId || !canDragMove) return;
                const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                if (!draggedFile || draggedFile.folderId === folder.id) return;
                event.preventDefault();
                event.stopPropagation();
                draggingFileId = '';
                clearDropTargets();
                moveFileToFolder(draggedFileId, folder.id);
            });
        }

        // The root folder itself stays put; every other folder can be dragged.
        if (canDragFolders && folder.parentId && folderById.has(folder.parentId)) {
            folderRow.draggable = true;
            folderRow.addEventListener('dragstart', (event) => {
                if (!event.dataTransfer) return;
                draggingFolderId = folder.id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(DRAG_FOLDER_MIME, folder.id);
                folderRow.classList.add('is-dragging');
            });
            folderRow.addEventListener('dragend', () => {
                draggingFolderId = '';
                folderRow.classList.remove('is-dragging');
                clearDropTargets();
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

    // Dropping on the empty area of the tree (not on any row) moves the item to the root folder.
    // Only a drop directly on the container counts, so gaps between nested rows never trigger it.
    const rootFolderForDrop = rootFolders[0] || null;
    if ((canDragMove || canDragFolders) && rootFolderForDrop) {
        const canDropAtRoot = () => {
            if (draggingFolderId) return canDropDraggedFolder(rootFolderForDrop.id);
            if (!draggingFileId || !canDragMove) return false;
            const draggedFile = workspace.files.find((item) => item.id === draggingFileId);
            return Boolean(draggedFile) && draggedFile.folderId !== rootFolderForDrop.id;
        };
        container.ondragover = (event) => {
            if (event.target !== container || !canDropAtRoot()) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            container.classList.add('is-drop-target-root');
        };
        container.ondragleave = (event) => {
            if (event.target === container) container.classList.remove('is-drop-target-root');
        };
        container.ondrop = (event) => {
            container.classList.remove('is-drop-target-root');
            if (event.target !== container || !canDropAtRoot()) return;
            event.preventDefault();
            if (draggingFolderId) {
                const movedFolderId = draggingFolderId;
                draggingFolderId = '';
                clearDropTargets();
                moveFolderToFolder(movedFolderId, rootFolderForDrop.id);
                return;
            }
            const movedFileId = draggingFileId;
            draggingFileId = '';
            clearDropTargets();
            moveFileToFolder(movedFileId, rootFolderForDrop.id);
        };
    } else {
        container.ondragover = null;
        container.ondragleave = null;
        container.ondrop = null;
    }

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

function blurOnEscape(editable) {
    editable.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.currentTarget?.blur === 'function') {
            event.currentTarget.blur();
        }
    });
}

// CodeMirror views hold listeners and observers, so each render destroys the
// ones it created before the rows are replaced.
const mountedEditorsByContainer = new WeakMap();

function trackMountedEditor(container, editor) {
    if (!mountedEditorsByContainer.has(container)) mountedEditorsByContainer.set(container, []);
    mountedEditorsByContainer.get(container).push(editor);
}

function destroyMountedEditors(container) {
    const editors = mountedEditorsByContainer.get(container);
    if (!editors) return;
    editors.forEach((editor) => {
        try {
            editor.destroy();
        } catch (_) { /* already gone */ }
    });
    mountedEditorsByContainer.delete(container);
}

/**
 * Divider editors share one contract: `{ kind, element, destroy? }`, with
 * edits reported through `commit(value)`. The type registry picks the editor,
 * so a new divider type needs no new renderer.
 */
const DIVIDER_EDITORS = {
    text: mountTextDividerEditor,
    code: mountCodeDividerEditor
};

function mountDividerEditor(dividerType, context) {
    const mount = DIVIDER_EDITORS[dividerType.editor] || DIVIDER_EDITORS.text;
    return mount(dividerType, context) || mountTextDividerEditor(dividerType, context);
}

function mountTextDividerEditor(_dividerType, { rawTitle, commit }) {
    const element = document.createElement('div');
    element.className = 'cell-content checklist-divider-content';
    // plaintext-only keeps Enter a single "\n"; see the step cells.
    element.contentEditable = 'plaintext-only';
    element.dataset.field = 'divider';

    let rawValue = rawTitle;
    element.innerHTML = formatChecklistCellContent(rawValue);
    element.addEventListener('focus', () => {
        element.textContent = rawValue;
    });
    element.addEventListener('input', () => {
        commit({ value: element.innerText });
    });
    element.addEventListener('blur', () => {
        rawValue = getDividerTitle(commit({ value: element.innerText }));
        element.innerHTML = formatChecklistCellContent(rawValue);
    });
    blurOnEscape(element);
    return { kind: 'text', element };
}

function createDividerHeadLabel(text) {
    const label = document.createElement('span');
    label.className = 'step-detail-block-kind checklist-divider-head-label';
    label.textContent = String(text).toLowerCase();
    return label;
}

/**
 * A small header select. An
 * unknown stored value stays selectable so opening the row does not
 * silently replace it.
 */
function createDividerOptionSelect({ label, options, selected }) {
    const select = document.createElement('select');
    select.className = 'step-detail-lang-select checklist-divider-select';
    select.setAttribute('aria-label', label);

    const ids = [...options];
    if (selected && !ids.includes(selected)) ids.push(selected);
    [...new Set(ids)].forEach((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        option.selected = id === selected;
        select.appendChild(option);
    });
    return select;
}

/** Language picker: plain, then the languages in the bundle. */
function createDividerLangSelect({ selected, languages }) {
    return createDividerOptionSelect({
        label: 'Code language',
        options: [PLAIN_DIVIDER_LANG, ...languages],
        selected
    });
}

/** Returns null without the CodeMirror bundle, which falls back to text. */
function mountCodeDividerEditor(dividerType, { divider, commit }) {
    const codeMirror = typeof window !== 'undefined' ? window.QaCodeMirror : null;
    const factory = codeMirror?.createCodeEditor;
    if (typeof factory !== 'function') return null;

    const element = document.createElement('div');
    element.className = 'checklist-divider-code';
    element.dataset.field = 'divider';

    const host = document.createElement('div');
    host.className = 'checklist-divider-code-host';
    const applyHeight = height => applyCodeHeight(host, height);
    applyHeight(resolveDividerHeight(divider));
    const editor = factory({
        parent: host,
        doc: divider.value,
        lang: resolveDividerLang(divider),
        view: resolveDividerView(divider),
        wrap: resolveDividerWrap(divider) === 'on',
        placeholder: dividerType.placeholder || '',
        onChange: value => commit({ value })
    });

    // source/live, shown only for languages with a live view (markdown).
    let storedView = divider.view;
    const viewLabel = createDividerHeadLabel('view');
    const viewSelect = createDividerOptionSelect({
        label: 'Editor view',
        options: CODE_VIEWS,
        selected: resolveCodeView('markdown', storedView)
    });
    const applyViewVisibility = (lang) => {
        const visible = hasCodeView(lang);
        viewLabel.hidden = !visible;
        viewSelect.hidden = !visible;
    };
    applyViewVisibility(resolveDividerLang(divider));
    viewSelect.addEventListener('change', () => {
        storedView = viewSelect.value;
        commit({ view: viewSelect.value });
        editor.setView(viewSelect.value);
    });
    viewSelect.addEventListener('click', event => event.stopPropagation());

    const langSelect = createDividerLangSelect({
        selected: resolveDividerLang(divider),
        languages: codeMirror.SUPPORTED_LANGUAGES || []
    });
    langSelect.addEventListener('change', () => {
        commit({ lang: langSelect.value });
        editor.setLanguage(langSelect.value);
        editor.setView(resolveCodeView(langSelect.value, storedView));
        applyViewVisibility(langSelect.value);
        currentLang = resolveDividerLang({ type: divider.type, lang: langSelect.value });
        applyWrap();
    });
    // Picking a language should not select the row or open its menu.
    langSelect.addEventListener('click', event => event.stopPropagation());

    const heightSelect = createDividerOptionSelect({
        label: 'Editor height',
        options: DIVIDER_HEIGHTS,
        selected: divider.height || resolveDividerHeight(divider)
    });
    heightSelect.addEventListener('change', () => {
        commit({ height: heightSelect.value });
        applyHeight(resolveDividerHeight({ type: divider.type, height: heightSelect.value }));
    });
    heightSelect.addEventListener('click', event => event.stopPropagation());

    // Without a pick, wrap follows the language (markdown on, code off), so a
    // language change can flip it.
    let storedWrap = divider.wrap;
    let currentLang = resolveDividerLang(divider);
    const wrapSelect = createDividerOptionSelect({
        label: 'Line wrap',
        options: DIVIDER_WRAPS,
        selected: resolveDividerWrap(divider)
    });
    const applyWrap = () => {
        const wrap = resolveDividerWrap({ type: divider.type, lang: currentLang, wrap: storedWrap });
        wrapSelect.value = wrap;
        editor.setWrap(wrap === 'on');
    };
    wrapSelect.addEventListener('change', () => {
        storedWrap = wrapSelect.value;
        commit({ wrap: wrapSelect.value });
        applyWrap();
    });
    wrapSelect.addEventListener('click', event => event.stopPropagation());

    // Dragging sets an exact height ("480px"); it then shows in the select
    // like the named heights. A double click goes back to the type default.
    const showHeight = (height) => {
        if (![...heightSelect.options].some(option => option.value === height)) {
            const option = document.createElement('option');
            option.value = height;
            option.textContent = height;
            heightSelect.appendChild(option);
        }
        heightSelect.value = height;
    };
    const heightHandle = createCodeHeightHandle(host, {
        onCommit: (height) => {
            commit({ height });
            showHeight(height);
        },
        onReset: () => {
            commit({ height: '' });
            const height = resolveDividerHeight({ type: divider.type });
            applyHeight(height);
            showHeight(height);
        }
    });

    // The header is `label [select]` pairs. It sits above
    // the editor because the table is often wider than the pane, so controls
    // beside the editor could end up off-screen.
    const head = document.createElement('div');
    head.className = 'step-detail-block-head checklist-divider-code-head';
    head.append(
        createDividerHeadLabel(dividerType.label),
        langSelect,
        createDividerHeadLabel('height'),
        heightSelect,
        createDividerHeadLabel('wrap'),
        wrapSelect,
        viewLabel,
        viewSelect
    );

    element.append(head, host, heightHandle);
    // Escape leaves the editor like the other cells, unless CodeMirror used
    // it first (closing search or autocomplete).
    element.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        editor.blur();
    });
    return { kind: 'code', element, destroy: () => editor.destroy() };
}

export function renderChecklist(container, data, options = {}) {
    const {
        onUpdatePass, onUpdateStep, onHighlightStep, onScenarioTitleUpdate,
        onAddStep, onAddDivider, onOpenChecklistContextMenu,
        onNoteCellMount, activeFilter = 'all',
        searchResults = [], activeSearchResult = null, pinnedOnly = false
    } = options;
    if (!container) return;
    const canInsertRows = typeof onAddStep === 'function' || typeof onAddDivider === 'function';

    // Rows are rebuilt from scratch. Detach the old rows before destroying
    // their editors: CodeMirror's destroy removes its DOM, and doing that
    // while the rows are still in the table reset the pane's scroll position.
    container.replaceChildren();
    destroyMountedEditors(container);

    if (pinnedOnly && (!Array.isArray(data?.steps) || !data.steps.some(step => step.pinned === true))) return;

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
    const filter = normalizeChecklistFilter(activeFilter);
    const visibility = pinnedOnly
        ? data.steps.map(step => step.pinned === true)
        : buildChecklistVisibility(data.steps, filter);
    const searchResultsByStep = new Map();
    searchResults.forEach((result) => {
        if (!searchResultsByStep.has(result.stepIndex)) searchResultsByStep.set(result.stepIndex, []);
        searchResultsByStep.get(result.stepIndex).push(result);
    });

    if (!visibility.some(Boolean)) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-state';
        emptyRow.innerHTML = '<td colspan="6">이 조건에 해당하는 행이 없습니다.</td>';
        container.appendChild(emptyRow);
        return;
    }

    let visibleIndex = 0;
    data.steps.forEach((step, index) => {
        // The step number keeps counting through hidden rows so a filtered view
        // still shows where each row sits in the whole scenario.
        if (!isChecklistDividerStep(step)) visibleIndex += 1;
        if (!visibility[index]) return;
        if (isChecklistDividerStep(step)) {
            const dividerRow = document.createElement('tr');
            dividerRow.className = 'checklist-divider-row';
            dividerRow.dataset.stepIndex = String(index);
            const dividerSearchResults = searchResultsByStep.get(index) || [];
            if (dividerSearchResults.length) dividerRow.classList.add('is-search-match');
            if (activeSearchResult?.stepIndex === index) dividerRow.classList.add('is-search-current');
            const dividerCell = document.createElement('td');
            dividerCell.colSpan = 6;
            const divider = parseDivider(step.divider);
            const dividerType = resolveDividerType(divider.type);
            // An edit patches one attribute on top of the latest state, so
            // typing or picking a language never drops another attribute.
            let currentDivider = divider;
            const commitDivider = (patch) => {
                currentDivider = { ...currentDivider, ...patch };
                const stored = serializeDivider(currentDivider);
                onUpdateStep(index, 'divider', stored);
                return stored;
            };

            if (divider.color) {
                dividerRow.style.setProperty('--divider-color', divider.color);
                dividerRow.classList.add('has-custom-color');
            }

            const dividerEditor = mountDividerEditor(dividerType, {
                divider,
                rawTitle: getChecklistDividerTitle(step),
                commit: commitDivider
            });
            dividerRow.classList.add(`is-divider-${dividerEditor.kind}`);
            if (dividerEditor.destroy) trackMountedEditor(container, dividerEditor);

            const dividerInner = document.createElement('div');
            dividerInner.className = 'checklist-divider-inner';

            const dividerSpacer = document.createElement('span');
            dividerSpacer.className = 'checklist-divider-spacer';
            dividerSpacer.setAttribute('aria-hidden', 'true');

            dividerInner.appendChild(dividerSpacer);
            dividerInner.appendChild(dividerEditor.element);
            // A plain text divider with a title acts as a section heading that can pin to the top.
            if (step.pinned !== true && isStickyHeadingDivider(divider, getChecklistDividerTitle(step))) {
                dividerRow.classList.add('is-sticky-heading');
                dividerInner.appendChild(createStickyJumpButton());
            }
            if (pinnedOnly) addPinnedRowControls(dividerRow, dividerInner);
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

        const tr = document.createElement('tr');
        tr.dataset.stepIndex = String(index);
        const rowSearchResults = searchResultsByStep.get(index) || [];
        if (rowSearchResults.length) tr.classList.add('is-search-match');
        if (activeSearchResult?.stepIndex === index) tr.classList.add('is-search-current');
        const isPassed = step.pass === true;
        
        // plaintext-only so Enter inserts a single "\n" text node. Plain
        // contenteditable builds <br>/<div> on Enter, which innerText then
        // counts alongside the existing literal "\n", doubling blank lines.
        tr.innerHTML = `
            <td class="col-num">${visibleIndex}</td>
            <td class="col-given"><div class="cell-content" contenteditable="plaintext-only" data-index="${index}" data-field="given"></div></td>
            <td class="col-when"><div class="cell-content" contenteditable="plaintext-only" data-index="${index}" data-field="when"></div></td>
            <td class="col-then"><div class="cell-content" contenteditable="plaintext-only" data-index="${index}" data-field="then"></div></td>
            <td class="col-pass">
                <label class="checkbox-container">
                    <input type="checkbox" data-index="${index}" ${isPassed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
            <td class="col-note"><div class="cell-content" contenteditable="plaintext-only" data-index="${index}" data-field="note"></div></td>
        `;

        if (pinnedOnly) addPinnedRowControls(tr, tr.querySelector('.col-then'));

        // The note column is the only one that renders links and images.
        const populateCell = (field, val, { rich = false } = {}) => {
            const cell = tr.querySelector(`[data-field="${field}"]`);
            cell.dataset.rawValue = val;
            cell.innerHTML = formatChecklistCellContent(val, { rich });
            
            cell.addEventListener('focus', (e) => { e.target.textContent = e.target.dataset.rawValue; });
            cell.addEventListener('input', (e) => onUpdateStep(index, field, e.target.innerText));
            cell.addEventListener('blur', (e) => {
                let v = e.target.innerText.trim();
                if (v === '-') v = '';
                onUpdateStep(index, field, v);
                e.target.dataset.rawValue = v;
                e.target.innerHTML = formatChecklistCellContent(v, { rich });
            });
            blurOnEscape(cell);
            return cell;
        };

        populateCell('given', stepLinesToText(step.given));
        populateCell('when', stepLinesToText(step.when));
        populateCell('then', stepLinesToText(step.then));
        const noteValue = stepLinesToText(step.note);
        const noteCell = populateCell('note', noteValue, { rich: true });
        if (noteValue) tr.classList.add('has-note');
        if (typeof onNoteCellMount === 'function') onNoteCellMount(noteCell);
        rowSearchResults.forEach((result) => {
            if (STEP_TEXT_FIELDS.includes(result.field)) {
                tr.querySelector(`[data-field="${result.field}"]`)?.classList.add('is-search-field-match');
            }
        });

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
