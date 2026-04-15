import { createDeletedFileHistoryManager } from '../modules/deleted-file-history-manager.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createWorkspace() {
    return {
        folders: [{ id: 'folder-a', name: 'A' }],
        files: [],
        uiState: {
            expandedFolderIds: [],
            activeFileId: null,
            selectedFolderId: null,
            selectedFileId: null,
            lastSelectionType: 'file'
        }
    };
}

test('restoreLastDeletedFile reinserts file and updates ui state', () => {
    const workspace = createWorkspace();
    const flags = { persisted: 0, loaded: 0 };
    const manager = createDeletedFileHistoryManager({
        getWorkspace: () => workspace,
        persist: () => { flags.persisted += 1; },
        loadActiveFile: () => { flags.loaded += 1; }
    });

    manager.recordDeletedFile({
        id: 'file-1',
        folderId: 'folder-a',
        name: 'one.json',
        content: '{}'
    }, 0);

    const restored = manager.restoreLastDeletedFile();
    assertEqual(restored, true);
    assertEqual(workspace.files.length, 1);
    assertEqual(workspace.files[0].id, 'file-1');
    assertEqual(workspace.uiState.activeFileId, 'file-1');
    assertEqual(workspace.uiState.selectedFolderId, 'folder-a');
    assertEqual(flags.persisted, 1);
    assertEqual(flags.loaded, 1);
});

test('restoreLastDeletedFile skips entries with removed folder', () => {
    const workspace = createWorkspace();
    const manager = createDeletedFileHistoryManager({
        getWorkspace: () => workspace,
        persist: () => {},
        loadActiveFile: () => {}
    });

    manager.recordDeletedFile({
        id: 'file-2',
        folderId: 'missing-folder',
        name: 'two.json',
        content: '{}'
    }, 0);

    const restored = manager.restoreLastDeletedFile();
    assertEqual(restored, false);
    assertEqual(workspace.files.length, 0);
});
