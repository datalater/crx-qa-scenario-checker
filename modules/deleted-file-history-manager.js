export function createDeletedFileHistoryManager(options) {
    const getWorkspace = options?.getWorkspace;
    const persist = options?.persist;
    const loadActiveFile = options?.loadActiveFile;
    const maxEntries = Number.isFinite(options?.maxEntries) ? Math.max(1, options.maxEntries) : 20;
    const history = [];

    function recordDeletedFile(file, index) {
        if (!file || typeof file !== 'object') return;
        history.push({
            file: cloneFile(file),
            index: Number.isFinite(index) ? index : 0
        });
        if (history.length > maxEntries) history.shift();
    }

    function restoreLastDeletedFile() {
        const workspace = typeof getWorkspace === 'function' ? getWorkspace() : null;
        if (!workspace || !Array.isArray(workspace.files) || !Array.isArray(workspace.folders)) return false;

        while (history.length > 0) {
            const entry = history.pop();
            if (!entry || !entry.file) continue;
            const folderExists = workspace.folders.some(folder => folder.id === entry.file.folderId);
            if (!folderExists) continue;

            const insertIndex = Math.max(0, Math.min(entry.index, workspace.files.length));
            workspace.files.splice(insertIndex, 0, entry.file);
            ensureUiState(workspace, entry.file.folderId, entry.file.id);
            if (typeof persist === 'function') persist();
            if (typeof loadActiveFile === 'function') loadActiveFile();
            return true;
        }

        return false;
    }

    return {
        recordDeletedFile,
        restoreLastDeletedFile
    };
}

function ensureUiState(workspace, folderId, fileId) {
    if (!workspace.uiState || typeof workspace.uiState !== 'object') {
        workspace.uiState = {};
    }
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    expandedSet.add(folderId);
    workspace.uiState.expandedFolderIds = Array.from(expandedSet);
    workspace.uiState.activeFileId = fileId;
    workspace.uiState.selectedFolderId = folderId;
    workspace.uiState.selectedFileId = fileId;
    workspace.uiState.lastSelectionType = 'file';
}

function cloneFile(file) {
    return {
        id: file.id,
        folderId: file.folderId,
        name: file.name,
        content: file.content,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
    };
}
