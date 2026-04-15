import { WORKSPACE_STORAGE_KEY } from '../constants/storage.js';
import { WORKSPACE_VERSION, DEFAULT_FOLDER_NAME, DEFAULT_FILE_NAME } from '../configs/workspace.js';
import { nowIso, nowTs } from '../utils/date.js';
import { tryParseJson } from '../utils/json.js';

export function createFolderRecord(name, parentId = null, path = '') {
    return {
        id: 'folder-' + nowTs() + '-' + Math.floor(Math.random() * 1000),
        name: name,
        parentId: parentId,
        path: path,
        createdAt: nowIso(),
        updatedAt: nowIso()
    };
}

export function createFileRecord(folderId, name, content = '') {
    const safeName = ensureJsonFileName(name);
    return {
        id: 'file-' + nowTs() + '-' + Math.floor(Math.random() * 1000),
        folderId: folderId,
        name: safeName,
        content: content || buildDefaultScenarioContent(safeName),
        createdAt: nowIso(),
        updatedAt: nowIso()
    };
}

function buildDefaultScenarioContent(name) {
    return '{\n'
        + '  "scenario": "' + name + '",\n'
        + '  "steps": [\n'
        + '    {\n'
        + '      "given": [\n'
        + '        "Example: user is on the login page"\n'
        + '      ],\n'
        + '      "when": [\n'
        + '        "Example: user enters valid credentials"\n'
        + '      ],\n'
        + '      "then": [\n'
        + '        "Example: user is redirected to the dashboard"\n'
        + '      ],\n'
        + '      "pass": false\n'
        + '    },\n'
        + '    {\n'
        + '      "divider": "Example divider section"\n'
        + '    }\n'
        + '  ]\n'
        + '}';
}

export function getFolderById(workspace, id) {
    return workspace.folders.find(f => f.id === id);
}

export function getFileById(workspace, id) {
    return workspace.files.find(f => f.id === id);
}

export function getActiveFile(workspace) {
    if (!workspace || !workspace.uiState.activeFileId) return null;
    return getFileById(workspace, workspace.uiState.activeFileId);
}

export function getNextAvailableFolderName(workspace, baseName, excludeId = null) {
    let name = baseName;
    let counter = 1;
    while (workspace.folders.some(f => f.name === name && f.id !== excludeId)) {
        name = `${baseName} (${counter++})`;
    }
    return name;
}

export function getNextAvailableFileName(workspace, folderId, baseName, excludeId = null) {
    const normalizedBase = ensureJsonFileName(baseName);
    let name = normalizedBase;
    let counter = 1;
    const filesInFolder = workspace.files.filter(f => f.folderId === folderId);
    while (filesInFolder.some(f => f.name === name && f.id !== excludeId)) {
        name = buildIndexedFileName(normalizedBase, counter++);
    }
    return name;
}

function ensureJsonFileName(name) {
    const trimmed = (name || '').trim();
    const fallback = DEFAULT_FILE_NAME || 'scenario';
    const safe = trimmed || fallback;
    return safe.toLowerCase().endsWith('.json') ? safe : `${safe}.json`;
}

function buildIndexedFileName(baseName, counter) {
    const dotIndex = baseName.lastIndexOf('.');
    if (dotIndex <= 0) return `${baseName} (${counter})`;
    const base = baseName.slice(0, dotIndex);
    const ext = baseName.slice(dotIndex);
    return `${base} (${counter})${ext}`;
}

export function normalizeWorkspace(workspace) {
    if (!workspace) workspace = {};
    if (!workspace.folders) workspace.folders = [];
    if (!workspace.files) workspace.files = (workspace.rules || []);
    if (!workspace.uiState) workspace.uiState = {};
    if (!workspace.uiState.expandedFolderIds) workspace.uiState.expandedFolderIds = [];
    if (typeof workspace.uiState.showLineNumbers !== 'boolean') {
        workspace.uiState.showLineNumbers = true;
    }
    if (typeof workspace.uiState.showFileTree !== 'boolean') {
        workspace.uiState.showFileTree = true;
    }
    if (!Number.isFinite(workspace.uiState.fileTreeWidth) || workspace.uiState.fileTreeWidth <= 0) {
        workspace.uiState.fileTreeWidth = null;
    }
    if (!workspace.uiState.selectedFileId) workspace.uiState.selectedFileId = null;
    if (!workspace.uiState.lastSelectionType) workspace.uiState.lastSelectionType = 'file';
    if (workspace.uiState.exportMode === 'required') {
        workspace.uiState.exportMode = 'custom';
    }
    if (workspace.uiState.exportMode !== 'all' && workspace.uiState.exportMode !== 'custom') {
        workspace.uiState.exportMode = 'all';
    }
    if (!Array.isArray(workspace.uiState.customExportFields)) {
        workspace.uiState.customExportFields = [];
    }

    if (workspace.folders.length === 0) {
        const defaultFolder = createFolderRecord(DEFAULT_FOLDER_NAME);
        workspace.folders.push(defaultFolder);
        
        if (workspace.files.length === 0) {
            const defaultFile = createFileRecord(defaultFolder.id, DEFAULT_FILE_NAME);
            workspace.files.push(defaultFile);
            workspace.uiState.activeFileId = defaultFile.id;
        } else {
            workspace.files.forEach(file => {
                if (!file.folderId) file.folderId = defaultFolder.id;
            });
        }
    }

    workspace.files.forEach(file => {
        if (!file.content && file.json) {
            file.content = JSON.stringify(file.json, null, 2);
        }
    });

    if (!workspace.uiState.activeFileId && workspace.files.length > 0) {
        workspace.uiState.activeFileId = workspace.files[0].id;
    }

    ensureWorkspaceConsistency(workspace);
    return workspace;
}

export function ensureWorkspaceConsistency(workspace) {
    const folderIds = new Set(workspace.folders.map(f => f.id));
    workspace.files = workspace.files.filter(f => folderIds.has(f.folderId));

    const fileIds = new Set(workspace.files.map(f => f.id));
    if (workspace.uiState.activeFileId && !fileIds.has(workspace.uiState.activeFileId)) {
        workspace.uiState.activeFileId = workspace.files[0]?.id || null;
    }
    if (workspace.uiState.selectedFileId && !fileIds.has(workspace.uiState.selectedFileId)) {
        workspace.uiState.selectedFileId = null;
    }
}

export function persistWorkspace(workspace) {
    if (!workspace) return;
    workspace.updatedAt = nowIso();
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function buildWorkspaceExportPayload(workspace) {
    return {
        version: WORKSPACE_VERSION,
        exportedAt: nowIso(),
        updatedAt: workspace?.updatedAt || nowIso(),
        folders: (workspace?.folders || []).map(folder => ({
            id: folder.id,
            name: folder.name,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt
        })),
        files: (workspace?.files || []).map(file => {
            const entry = {
                id: file.id,
                folderId: file.folderId,
                name: file.name,
                filePath: file.name,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                content: file.content
            };

            const parsed = tryParseJson(file.content);
            if (parsed !== null) {
                entry.json = parsed;
            }

            return entry;
        }),
        uiState: {
            activeFileId: workspace?.uiState?.activeFileId || null,
            expandedFolderIds: [...(workspace?.uiState?.expandedFolderIds || [])],
            selectedFolderId: workspace?.uiState?.selectedFolderId || null,
            selectedFileId: workspace?.uiState?.selectedFileId || null,
            lastSelectionType: workspace?.uiState?.lastSelectionType || null,
            showLineNumbers: workspace?.uiState?.showLineNumbers ?? true,
            showFileTree: workspace?.uiState?.showFileTree ?? true,
            fileTreeWidth: Number.isFinite(workspace?.uiState?.fileTreeWidth) ? workspace.uiState.fileTreeWidth : null
        }
    };
}
