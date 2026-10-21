/**
 * "파일 열기" palette command: search every file and open it as a tab.
 * file: { id, name, path, isOpen, isActive }
 */

/** Filters by all whitespace-separated tokens; filename matches rank first, open tabs break ties. */
export function filterFilesForPicker(files, query) {
    const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    files.forEach((file, index) => {
        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        if (!tokens.every((token) => path.includes(token))) return;
        let rank = 3;
        if (tokens.length && tokens.every((token) => name.startsWith(token))) rank = 0;
        else if (tokens.length && tokens.every((token) => name.includes(token))) rank = 1;
        else if (tokens.length) rank = 2;
        scored.push({ file, rank, index });
    });
    scored.sort((a, b) =>
        a.rank - b.rank
        || Number(b.file.isOpen) - Number(a.file.isOpen)
        || a.index - b.index);
    return scored.map((entry) => entry.file);
}

export function createOpenFileCommand({ getFiles, open }) {
    return {
        id: 'openFile',
        label: '파일 열기',
        shortcutId: 'openFile',
        run: (api) => api.pick({
            placeholder: '파일 이름으로 검색...',
            emptyText: '일치하는 파일이 없습니다.',
            getItems: (query) => filterFilesForPicker(getFiles(), query).map((file) => ({
                label: file.name,
                description: file.path === file.name ? '' : file.path,
                badge: file.isActive ? '현재' : (file.isOpen ? '열림' : ''),
                fileId: file.id
            })),
            onSelect: (item) => open(item.fileId)
        })
    };
}
