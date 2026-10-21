import { canMoveFolder, applyFolderMove, remapPathPrefix, joinFolderPath, getDescendantFolderIds } from '../modules/folder-move.js';
import { directoriesMatch, directoryHasEntry } from '../modules/directory-verify.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createWorkspace() {
    return {
        folders: [
            { id: 'root', name: 'root', parentId: null, path: '' },
            { id: 'a', name: 'a', parentId: 'root', path: 'a' },
            { id: 'b', name: 'b', parentId: 'a', path: 'a/b' },
            { id: 'c', name: 'c', parentId: 'b', path: 'a/b/c' },
            { id: 'x', name: 'x', parentId: 'root', path: 'x' },
            { id: 'dup', name: 'b', parentId: 'x', path: 'x/b' }
        ],
        files: []
    };
}

test('canMoveFolder allows nested folder -> root', () => {
    assertEqual(canMoveFolder(createWorkspace(), 'b', 'root').ok, true);
});

test('canMoveFolder rejects root, self, descendants, same parent and name conflicts', () => {
    const workspace = createWorkspace();
    assertEqual(canMoveFolder(workspace, 'root', 'a').reason, 'root');
    assertEqual(canMoveFolder(workspace, 'a', 'a').reason, 'self');
    assertEqual(canMoveFolder(workspace, 'a', 'c').reason, 'descendant');
    assertEqual(canMoveFolder(workspace, 'b', 'a').reason, 'same-parent');
    assertEqual(canMoveFolder(workspace, 'b', 'x').reason, 'name-conflict');
    assertEqual(canMoveFolder(workspace, 'nope', 'a').reason, 'invalid');
});

test('applyFolderMove re-parents and rewrites paths of the whole subtree', () => {
    const workspace = createWorkspace();
    applyFolderMove(workspace, 'b', 'root', () => 123);
    const byId = Object.fromEntries(workspace.folders.map((folder) => [folder.id, folder]));
    assertEqual(byId.b.parentId, 'root');
    assertEqual(byId.b.path, 'b');
    assertEqual(byId.c.path, 'b/c');
    assertEqual(byId.a.path, 'a');
    assertEqual(getDescendantFolderIds(workspace, 'a').size, 0);
});

test('remapPathPrefix only rewrites whole path segments', () => {
    assertEqual(remapPathPrefix('a/b/f.json', 'a/b', 'b'), 'b/f.json');
    assertEqual(remapPathPrefix('a/b', 'a/b', 'b'), 'b');
    assertEqual(remapPathPrefix('a/bc/f.json', 'a/b', 'b'), 'a/bc/f.json');
    assertEqual(remapPathPrefix('z/f.json', 'a/b', 'b'), 'z/f.json');
    assertEqual(joinFolderPath('', 'b'), 'b');
    assertEqual(joinFolderPath('x', 'b'), 'x/b');
});

function fakeDir(entries) {
    return {
        kind: 'directory',
        async *entries() { for (const [name, handle] of Object.entries(entries)) yield [name, handle]; }
    };
}
function fakeFile(size) {
    return { kind: 'file', getFile: async () => ({ size }) };
}

test('directoriesMatch compares names, kinds and file sizes recursively', async () => {
    const source = fakeDir({ 'a.json': fakeFile(10), sub: fakeDir({ 'b.json': fakeFile(5) }) });
    const same = fakeDir({ 'a.json': fakeFile(10), sub: fakeDir({ 'b.json': fakeFile(5) }) });
    const wrongSize = fakeDir({ 'a.json': fakeFile(10), sub: fakeDir({ 'b.json': fakeFile(4) }) });
    const missing = fakeDir({ 'a.json': fakeFile(10) });
    const wrongKind = fakeDir({ 'a.json': fakeFile(10), sub: fakeFile(5) });
    assertEqual(await directoriesMatch(source, same), true);
    assertEqual(await directoriesMatch(source, wrongSize), false);
    assertEqual(await directoriesMatch(source, missing), false);
    assertEqual(await directoriesMatch(source, wrongKind), false);
});

test('directoryHasEntry finds files and folders by name', async () => {
    const dir = fakeDir({ 'a.json': fakeFile(1), sub: fakeDir({}) });
    assertEqual(await directoryHasEntry(dir, 'sub'), true);
    assertEqual(await directoryHasEntry(dir, 'a.json'), true);
    assertEqual(await directoryHasEntry(dir, 'nope'), false);
});
