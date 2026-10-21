// Pure helpers for moving a folder (and its subtree) under another folder.

export function getDescendantFolderIds(workspace, rootFolderId) {
    const ids = new Set();
    const queue = [rootFolderId];
    while (queue.length) {
        const parentId = queue.shift();
        (workspace.folders || []).forEach((folder) => {
            if (folder.parentId === parentId && !ids.has(folder.id)) {
                ids.add(folder.id);
                queue.push(folder.id);
            }
        });
    }
    return ids;
}

/** { ok: true } or { ok: false, reason } - reasons: invalid | root | self | descendant | same-parent | name-conflict */
export function canMoveFolder(workspace, folderId, targetFolderId) {
    const folders = workspace?.folders || [];
    const folder = folders.find((item) => item.id === folderId);
    const target = folders.find((item) => item.id === targetFolderId);
    if (!folder || !target) return { ok: false, reason: 'invalid' };
    if (!folder.parentId || !folders.some((item) => item.id === folder.parentId)) return { ok: false, reason: 'root' };
    if (folderId === targetFolderId) return { ok: false, reason: 'self' };
    if (getDescendantFolderIds(workspace, folderId).has(targetFolderId)) return { ok: false, reason: 'descendant' };
    if (folder.parentId === targetFolderId) return { ok: false, reason: 'same-parent' };
    if (folders.some((item) => item.parentId === targetFolderId && item.name === folder.name)) {
        return { ok: false, reason: 'name-conflict' };
    }
    return { ok: true };
}

export function joinFolderPath(parentPath, name) {
    return parentPath ? `${parentPath}/${name}` : name;
}

/** "a/b/c.json" with a/b -> x/b becomes "x/b/c.json"; unrelated paths are returned unchanged. */
export function remapPathPrefix(path, oldPrefix, newPrefix) {
    if (typeof path !== 'string' || !oldPrefix) return path;
    if (path === oldPrefix) return newPrefix;
    if (path.startsWith(`${oldPrefix}/`)) return newPrefix + path.slice(oldPrefix.length);
    return path;
}

/** Re-parents the folder and rewrites path for it and every descendant. Call canMoveFolder first. */
export function applyFolderMove(workspace, folderId, targetFolderId, now = () => Date.now()) {
    const folders = workspace.folders;
    const folder = folders.find((item) => item.id === folderId);
    const target = folders.find((item) => item.id === targetFolderId);
    folder.parentId = targetFolderId;
    folder.path = joinFolderPath(target.path, folder.name);
    folder.updatedAt = now();
    const queue = [folder];
    while (queue.length) {
        const parent = queue.shift();
        folders.filter((item) => item.parentId === parent.id).forEach((child) => {
            child.path = joinFolderPath(parent.path, child.name);
            queue.push(child);
        });
    }
}
