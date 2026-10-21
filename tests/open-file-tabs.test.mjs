import { closeOpenFileTab, closeTabsWhere, syncOpenFileIds } from '../modules/open-file-tabs.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createWorkspace(openFileIds, activeFileId) {
    return {
        files: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })),
        uiState: { openFileIds, activeFileId }
    };
}

test('syncOpenFileIds drops missing/duplicate ids and appends the active file', () => {
    const workspace = createWorkspace(['a', 'x', 'a', 'b'], 'c');
    assertEqual(syncOpenFileIds(workspace).join(), 'a,b,c');
});

test('closeOpenFileTab activates the neighbor and keeps the last tab', () => {
    const workspace = createWorkspace(['a', 'b', 'c'], 'b');
    assertEqual(closeOpenFileTab(workspace, 'b'), 'c');
    assertEqual(workspace.uiState.openFileIds.join(), 'a,c');
    const single = createWorkspace(['a'], 'a');
    assertEqual(closeOpenFileTab(single, 'a'), null);
});

test('closeTabsWhere: close others keeps only the target and activates it', () => {
    const workspace = createWorkspace(['a', 'b', 'c', 'd'], 'a');
    assertEqual(closeTabsWhere(workspace, (id) => id !== 'c', 'c'), 'c');
    assertEqual(workspace.uiState.openFileIds.join(), 'c');
});

test('closeTabsWhere: close right keeps the active tab when it survives', () => {
    const workspace = createWorkspace(['a', 'b', 'c', 'd'], 'a');
    assertEqual(closeTabsWhere(workspace, (id, index) => index > 1, 'b'), 'a');
    assertEqual(workspace.uiState.openFileIds.join(), 'a,b');
    const activeRight = createWorkspace(['a', 'b', 'c', 'd'], 'd');
    assertEqual(closeTabsWhere(activeRight, (id, index) => index > 1, 'b'), 'b');
});
