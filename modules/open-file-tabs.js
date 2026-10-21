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

export function renderOpenFileTabs(container, workspace, { isDirty, onSelect, onClose } = {}) {
    if (!container) return;
    const ids = syncOpenFileIds(workspace);
    container.hidden = ids.length === 0;
    container.replaceChildren();
    const activeId = workspace.uiState.activeFileId;
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
            close.addEventListener('click', (event) => {
                event.stopPropagation();
                onClose?.(id);
            });
            tab.appendChild(close);
        }
        tab.addEventListener('click', () => { if (!isActive) onSelect?.(id); });
        tab.addEventListener('auxclick', (event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            onClose?.(id);
        });
        container.appendChild(tab);
        if (isActive) tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
}
