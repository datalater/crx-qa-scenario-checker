export function buildTreeRenderOptions(deps) {
    const {
        getWorkspace,
        getActiveFileDirty,
        canMutateTree,
        showInlineActions,
        onOpenContextMenu,
        setLastTreeSelectionType,
        persist,
        loadActiveFile,
        workspaceApi,
        prompt,
        onDeleteFile,
        onMoveFile
    } = deps;

    return {
        activeFileDirty: getActiveFileDirty(),
        canMutateTree: typeof canMutateTree === 'function' ? canMutateTree() : true,
        showInlineActions: Boolean(showInlineActions),
        onOpenContextMenu: typeof onOpenContextMenu === 'function' ? onOpenContextMenu : null,
        onMoveFile: typeof onMoveFile === 'function' ? onMoveFile : null,
        onToggleFolder: (id) => {
            const workspace = getWorkspace();
            const expanded = new Set(workspace.uiState.expandedFolderIds);
            if (expanded.has(id)) {
                expanded.delete(id);
            } else {
                expanded.add(id);
            }
            workspace.uiState.expandedFolderIds = Array.from(expanded);
            workspace.uiState.selectedFolderId = id;
            workspace.uiState.selectedFileId = null;
            workspace.uiState.lastSelectionType = 'folder';
            setLastTreeSelectionType('folder');
            persist();
        },
        onSelectFile: (id) => {
            const workspace = getWorkspace();
            workspace.uiState.activeFileId = id;
            workspace.uiState.selectedFolderId = workspaceApi.getFileById(workspace, id).folderId;
            workspace.uiState.selectedFileId = id;
            workspace.uiState.lastSelectionType = 'file';
            setLastTreeSelectionType('file');
            persist();
            loadActiveFile();
        },
        onRenameFolder: (id) => {
            if (typeof canMutateTree === 'function' && !canMutateTree()) return;
            const workspace = getWorkspace();
            const folder = workspaceApi.getFolderById(workspace, id);
            const nextName = prompt('Rename folder', folder.name);
            if (!nextName) return;
            folder.name = workspaceApi.getNextAvailableFolderName(workspace, nextName, id);
            persist();
        },
        onDeleteFolder: (id) => {
            if (typeof canMutateTree === 'function' && !canMutateTree()) return;
            const workspace = getWorkspace();
            workspace.folders = workspace.folders.filter(folder => folder.id !== id);
            workspace.files = workspace.files.filter(file => file.folderId !== id);
            if (workspace.uiState.selectedFolderId === id) {
                workspace.uiState.selectedFolderId = null;
            }
            if (workspace.uiState.selectedFileId) {
                const selectedFile = workspaceApi.getFileById(workspace, workspace.uiState.selectedFileId);
                if (!selectedFile || selectedFile.folderId === id) {
                    workspace.uiState.selectedFileId = null;
                }
            }
            persist();
            loadActiveFile();
        },
        onRenameFile: (id) => {
            if (typeof canMutateTree === 'function' && !canMutateTree()) return;
            const workspace = getWorkspace();
            const file = workspaceApi.getFileById(workspace, id);
            const nextName = prompt('Rename file', file.name);
            if (!nextName) return;
            file.name = workspaceApi.getNextAvailableFileName(workspace, file.folderId, nextName, id);
            persist();
        },
        onDeleteFile: (id) => {
            if (typeof canMutateTree === 'function' && !canMutateTree()) return;
            const workspace = getWorkspace();
            const deletedIndex = workspace.files.findIndex(file => file.id === id);
            const deletedFile = deletedIndex >= 0 ? workspace.files[deletedIndex] : null;
            if (typeof onDeleteFile === 'function' && deletedFile) {
                onDeleteFile(deletedFile, deletedIndex);
            }
            workspace.files = workspace.files.filter(file => file.id !== id);
            if (workspace.uiState.selectedFileId === id) {
                workspace.uiState.selectedFileId = null;
            }
            persist();
            loadActiveFile();
        }
    };
}
