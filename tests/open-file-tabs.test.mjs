import { closeOpenFileTab, closeTabsWhere, reorderOpenFileIds, syncOpenFileIds } from '../modules/open-file-tabs.js';
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

test('reorderOpenFileIds moves a tab before/after a target or to the end', () => {
    const workspace = createWorkspace(['a', 'b', 'c', 'd'], 'a');
    assertEqual(reorderOpenFileIds(workspace, 'd', 'b', false), true);
    assertEqual(workspace.uiState.openFileIds.join(), 'a,d,b,c');
    assertEqual(reorderOpenFileIds(workspace, 'a', 'b', true), true);
    assertEqual(workspace.uiState.openFileIds.join(), 'd,b,a,c');
    assertEqual(reorderOpenFileIds(workspace, 'd', null), true);
    assertEqual(workspace.uiState.openFileIds.join(), 'b,a,c,d');
});

test('reorderOpenFileIds ignores no-op and invalid moves', () => {
    const workspace = createWorkspace(['a', 'b', 'c'], 'a');
    assertEqual(reorderOpenFileIds(workspace, 'a', 'a', false), false);
    assertEqual(reorderOpenFileIds(workspace, 'a', 'b', false), false);
    assertEqual(reorderOpenFileIds(workspace, 'b', 'a', true), false);
    assertEqual(reorderOpenFileIds(workspace, 'c', null), false);
    assertEqual(reorderOpenFileIds(workspace, 'x', 'a', false), false);
    assertEqual(reorderOpenFileIds(workspace, 'a', 'x', false), false);
    assertEqual(workspace.uiState.openFileIds.join(), 'a,b,c');
});
