// Shared top tab bar of opened files (used by both JSON editor and Table Editor).

export function syncOpenFileIds(workspace) {
    const uiState = workspace?.uiState;
    if (!uiState) return [];
    const existing = new Set((workspace.files || []).map((file) => file.id));
    const seen = new Set();
    const ids = (Array.isArray(uiState.openFileIds) ? uiState.openFileIds : [])
        .filter((id) => existing.has(id) && !seen.has(id) && seen.add(id));
    const activeId = uiState.activeFileId;
    if (activeId && existing.has(activeId) && !seen.has(activeId)) ids.push(activeId);
    uiState.openFileIds = ids;
    return ids;
}

export function closeOpenFileTab(workspace, fileId) {
    const ids = syncOpenFileIds(workspace);
    const index = ids.indexOf(fileId);
    if (index < 0 || ids.length <= 1) return null;
    ids.splice(index, 1);
    workspace.uiState.openFileIds = ids;
    if (workspace.uiState.activeFileId !== fileId) return workspace.uiState.activeFileId;
    return ids[Math.min(index, ids.length - 1)];
}

/**
 * Closes every tab for which shouldClose(id, index) is true.
 * Returns the file id that should be active afterwards (null if nothing would remain).
 * `keepActiveId` becomes active when the current active tab gets closed.
 */
export function closeTabsWhere(workspace, shouldClose, keepActiveId = null) {
    const ids = syncOpenFileIds(workspace);
    const kept = ids.filter((id, index) => !shouldClose(id, index));
    if (!kept.length) return null;
    workspace.uiState.openFileIds = kept;
    const activeId = workspace.uiState.activeFileId;
    if (kept.includes(activeId)) return activeId;
    return kept.includes(keepActiveId) ? keepActiveId : kept[0];
}

/**
 * Moves a tab next to another one. `targetId: null` moves it to the end.
 * Returns true when the order changed.
 */
export function reorderOpenFileIds(workspace, fileId, targetId, placeAfter = false) {
    const ids = [...syncOpenFileIds(workspace)];
    const from = ids.indexOf(fileId);
    if (from < 0 || fileId === targetId) return false;
    ids.splice(from, 1);
    let to = ids.length;
    if (targetId !== null) {
        const targetIndex = ids.indexOf(targetId);
        if (targetIndex < 0) return false;
        to = placeAfter ? targetIndex + 1 : targetIndex;
    }
    ids.splice(to, 0, fileId);
    if (ids.every((id, index) => id === workspace.uiState.openFileIds[index])) return false;
    workspace.uiState.openFileIds = ids;
    return true;
}

export function renderOpenFileTabs(container, workspace, { isDirty, onSelect, onClose, onContextMenu, onReorder } = {}) {
    if (!container) return;
    const ids = syncOpenFileIds(workspace);
    container.hidden = ids.length === 0;
    container.replaceChildren();
    const activeId = workspace.uiState.activeFileId;
    const canReorder = ids.length > 1 && typeof onReorder === 'function';
    let draggingId = '';

    const clearDropMarks = () => {
        container.classList.remove('is-drop-end');
        container.querySelectorAll('.drop-before, .drop-after').forEach((node) => {
            node.classList.remove('drop-before', 'drop-after');
        });
    };
    const finishDrag = () => {
        draggingId = '';
        container.querySelectorAll('.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
        clearDropMarks();
    };
    const commitReorder = (targetId, placeAfter) => {
        const movedId = draggingId;
        finishDrag();
        if (movedId && reorderOpenFileIds(workspace, movedId, targetId, placeAfter)) onReorder();
    };

    if (canReorder) {
        // Dropping on the empty part of the bar (right of the last tab) moves the tab to the end.
        container.ondragover = (event) => {
            if (!draggingId || event.target !== container) return;
            event.preventDefault();
            clearDropMarks();
            container.classList.add('is-drop-end');
        };
        container.ondragleave = (event) => {
            if (event.target === container) container.classList.remove('is-drop-end');
        };
        container.ondrop = (event) => {
            if (!draggingId || event.target !== container) return;
            event.preventDefault();
            commitReorder(null, false);
        };
    } else {
        container.ondragover = null;
        container.ondragleave = null;
        container.ondrop = null;
    }

    ids.forEach((id) => {
        const file = workspace.files.find((item) => item.id === id);
        if (!file) return;
        const isActive = id === activeId;
        const tab = document.createElement('div');
        tab.className = 'open-file-tab' + (isActive ? ' is-active' : '');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(isActive));
        tab.dataset.fileId = id;
        tab.title = file.name;

        const label = document.createElement('span');
        label.className = 'open-file-tab-label';
        label.textContent = file.name;
        tab.appendChild(label);

        if (isActive && typeof isDirty === 'function' && isDirty()) {
            const dot = document.createElement('span');
            dot.className = 'open-file-tab-dirty';
            dot.textContent = '●';
            tab.appendChild(dot);
        }
        if (ids.length > 1) {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'open-file-tab-close';
            close.setAttribute('aria-label', `Close ${file.name}`);
            close.textContent = '×';
            // Pressing the close button must never turn into a tab drag.
            close.draggable = false;
            close.addEventListener('mousedown', () => {
                tab.draggable = false;
                window.addEventListener('mouseup', () => { tab.draggable = canReorder; }, { once: true });
            });
            close.addEventListener('click', (event) => {
                event.stopPropagation();
                onClose?.(id);
            });
            tab.appendChild(close);
        }
        if (canReorder) {
            tab.draggable = true;
            tab.addEventListener('dragstart', (event) => {
                if (!event.dataTransfer) return;
                draggingId = id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-qa-scenario-tab-id', id);
                tab.classList.add('is-dragging');
            });
            tab.addEventListener('dragend', finishDrag);
            tab.addEventListener('dragover', (event) => {
                if (!draggingId || draggingId === id) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = tab.getBoundingClientRect();
                const after = event.clientX > rect.left + rect.width / 2;
                clearDropMarks();
                tab.classList.add(after ? 'drop-after' : 'drop-before');
            });
            tab.addEventListener('dragleave', () => tab.classList.remove('drop-before', 'drop-after'));
            tab.addEventListener('drop', (event) => {
                if (!draggingId || draggingId === id) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = tab.getBoundingClientRect();
                commitReorder(id, event.clientX > rect.left + rect.width / 2);
            });
        }
        tab.addEventListener('click', () => { if (!isActive) onSelect?.(id); });
        tab.addEventListener('auxclick', (event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            onClose?.(id);
        });
        tab.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            onContextMenu?.(id, event.clientX, event.clientY);
        });
        container.appendChild(tab);
        if (isActive) tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
}
