export function updateFolderToggleButtonStateView(elements, workspace, getActiveFile) {
    const { btnToggleFolders, fileTreePanel } = elements;
    if (!btnToggleFolders || !workspace) return;

    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) {
        btnToggleFolders.disabled = true;
        if (fileTreePanel) {
            fileTreePanel.dataset.foldersExpanded = 'false';
        }
        return;
    }

    const expandedSet = new Set(workspace.uiState?.expandedFolderIds || []);

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));
    btnToggleFolders.disabled = false;
    if (fileTreePanel) {
        fileTreePanel.dataset.foldersExpanded = allExpanded ? 'true' : 'false';
    }
}

export function toggleAllFoldersState(workspace, getActiveFile) {
    if (!workspace || !workspace.uiState) return false;

    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) return false;

    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));
    workspace.uiState.expandedFolderIds = allExpanded
        ? []
        : folders.map(folder => folder.id);

    return true;
}
