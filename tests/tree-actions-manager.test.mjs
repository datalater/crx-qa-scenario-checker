import { buildTreeRenderOptions } from '../modules/tree-actions-manager.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createDeps(overrides = {}) {
    const workspace = {
        folders: [{ id: 'folder-1', name: 'A' }],
        files: [
            { id: 'file-1', folderId: 'folder-1', name: 'a.json', content: '{}' },
            { id: 'file-2', folderId: 'folder-1', name: 'b.json', content: '{}' }
        ],
        uiState: {
            selectedFileId: 'file-2',
            selectedFolderId: 'folder-1',
            lastSelectionType: 'file'
        }
    };

    const base = {
        getWorkspace: () => workspace,
        getActiveFileDirty: () => false,
        setLastTreeSelectionType: () => {},
        persist: () => {},
        loadActiveFile: () => {},
        workspaceApi: {
            getFileById: (ws, id) => ws.files.find(file => file.id === id),
            getFolderById: (ws, id) => ws.folders.find(folder => folder.id === id),
            getNextAvailableFolderName: (_ws, name) => name,
            getNextAvailableFileName: (_ws, _folderId, name) => name
        },
        prompt: () => null,
        ...overrides
    };

    return { workspace, deps: base };
}

test('onDeleteFile callback receives deleted file and index', () => {
    let callbackArgs = null;
    const { workspace, deps } = createDeps({
        onDeleteFile: (file, index) => {
            callbackArgs = { fileId: file.id, index };
        }
    });

    const options = buildTreeRenderOptions(deps);
    options.onDeleteFile('file-2');

    assertEqual(callbackArgs.fileId, 'file-2');
    assertEqual(callbackArgs.index, 1);
    assertEqual(workspace.files.length, 1);
    assertEqual(workspace.files[0].id, 'file-1');
});

test('onMoveFile callback is exposed in tree render options', () => {
    let moved = null;
    const { deps } = createDeps({
        onMoveFile: (fileId, folderId) => {
            moved = { fileId, folderId };
        }
    });

    const options = buildTreeRenderOptions(deps);
    options.onMoveFile('file-1', 'folder-1');

    assertEqual(moved.fileId, 'file-1');
    assertEqual(moved.folderId, 'folder-1');
});
