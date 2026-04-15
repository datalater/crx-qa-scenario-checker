export function toWorkspaceFromImportedPayload(payload, deps) {
    if (isExportPackagePayload(payload, deps.exportFormat)) {
        return buildWorkspaceFromExportPackage(payload, deps);
    }
    if (isWorkspacePayload(payload)) {
        return payload;
    }
    if (isScenarioPayload(payload)) {
        return buildWorkspaceFromSingleScenario(payload, deps);
    }
    return null;
}

function isWorkspacePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    return Array.isArray(payload.files)
        || Array.isArray(payload.rules)
        || Array.isArray(payload.folders)
        || Boolean(payload.uiState);
}

function isScenarioPayload(payload) {
    return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.steps));
}

function isExportPackagePayload(payload, exportFormat) {
    return Boolean(payload
        && typeof payload === 'object'
        && payload.format === exportFormat
        && Array.isArray(payload.files));
}

function buildWorkspaceFromSingleScenario(scenarioData, deps) {
    const folder = deps.createFolderRecord('Imported');
    const file = deps.createFileRecord(
        folder.id,
        `${deps.defaultFileName || 'scenario'}.json`,
        JSON.stringify(scenarioData, null, 2)
    );

    return {
        version: deps.workspaceVersion,
        folders: [folder],
        files: [file],
        uiState: {}
    };
}

function buildWorkspaceFromExportPackage(payload, deps) {
    const folderByName = new Map();
    const folders = [];
    const files = [];
    const entries = Array.isArray(payload.files) ? payload.files : [];

    const getFolderId = (name) => {
        const normalized = normalizeFolderName(name);
        if (folderByName.has(normalized)) return folderByName.get(normalized).id;
        const folder = deps.createFolderRecord(normalized);
        folderByName.set(normalized, folder);
        folders.push(folder);
        return folder.id;
    };

    entries.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const folderId = getFolderId(entry.folder);
        const nextName = normalizeImportedFileName(entry.name, index);
        const content = normalizeImportedFileContent(entry, deps);
        files.push(deps.createFileRecord(folderId, nextName, content));
    });

    return {
        version: deps.workspaceVersion,
        folders,
        files,
        uiState: {
            exportMode: deps.normalizeExportMode(payload.exportMode),
            customExportFields: Array.isArray(payload.customFields) ? payload.customFields : []
        }
    };
}

function normalizeFolderName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    return name || 'Imported';
}

function normalizeImportedFileName(value, index) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name) return name;
    return `scenario-${index + 1}.json`;
}

function normalizeImportedFileContent(entry, deps) {
    if (typeof entry.rawContent === 'string') return entry.rawContent;
    if (Object.prototype.hasOwnProperty.call(entry, 'data')) {
        return JSON.stringify(entry.data, null, 2);
    }
    return JSON.stringify(deps.buildRequiredScenarioWithDefaults({}), null, 2);
}
