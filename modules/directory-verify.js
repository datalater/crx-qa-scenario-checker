/**
 * True when two directory handles hold the same tree: same entry names and kinds,
 * and the same size for every file. Used to confirm a copy before deleting the original.
 */
export async function directoriesMatch(sourceHandle, targetHandle) {
    const readEntries = async (handle) => {
        const entries = new Map();
        for await (const [name, child] of handle.entries()) entries.set(name, child);
        return entries;
    };
    const [sourceEntries, targetEntries] = await Promise.all([readEntries(sourceHandle), readEntries(targetHandle)]);
    if (sourceEntries.size !== targetEntries.size) return false;

    for (const [name, sourceChild] of sourceEntries) {
        const targetChild = targetEntries.get(name);
        if (!targetChild || targetChild.kind !== sourceChild.kind) return false;
        if (sourceChild.kind === 'directory') {
            if (!(await directoriesMatch(sourceChild, targetChild))) return false;
        } else {
            const [sourceFile, targetFile] = await Promise.all([sourceChild.getFile(), targetChild.getFile()]);
            if (sourceFile.size !== targetFile.size) return false;
        }
    }
    return true;
}

export async function directoryHasEntry(parentHandle, name) {
    for await (const [entryName] of parentHandle.entries()) {
        if (entryName === name) return true;
    }
    return false;
}
