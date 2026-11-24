import { parseDivider, serializeDivider } from './divider-model.js';
import { toStepLines } from './step-lines.js';

export function buildExportPayload(options) {
    const {
        workspace,
        preferences,
        exportFormat,
        workspaceVersion,
        requiredExportFields,
        exportModeCustom,
        nowIso,
        parseJson,
        canonicalizeFieldPath
    } = options;

    const context = {
        parseJson,
        canonicalizeFieldPath,
        requiredExportFields,
        exportModeCustom
    };
    const folderMap = new Map((workspace?.folders || []).map(folder => [folder.id, folder.name]));
    const files = (workspace?.files || []).map((file, index) => {
        return buildExportFileRecord(file, index, folderMap, preferences, context);
    });

    return {
        format: exportFormat,
        version: workspaceVersion,
        exportedAt: nowIso(),
        exportMode: preferences.mode,
        requiredFields: [...requiredExportFields],
        customFields: preferences.mode === exportModeCustom ? preferences.customFields : [],
        files
    };
}

export function buildRequiredScenarioWithDefaults(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
    const scenario = typeof source.scenario === 'string' && source.scenario.trim()
        ? source.scenario
        : 'Untitled Scenario';
    const steps = Array.isArray(source.steps)
        ? source.steps.map(step => buildRequiredStepWithDefaults(step))
        : [];
    return {
        ...source,
        scenario,
        steps
    };
}

export function formatExportFilenameDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'unknown-date';
    const yyyy = String(date.getFullYear());
    const mon = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mon}-${dd}_${hh}-${mm}-${ss}`;
}

function buildExportFileRecord(file, index, folderMap, preferences, context) {
    const name = typeof file?.name === 'string' && file.name.trim()
        ? file.name
        : `scenario-${index + 1}.json`;
    const folder = folderMap.get(file?.folderId) || 'Imported';
    const parsed = context.parseJson(file?.content);
    const base = { name, folder };

    if (parsed === null) {
        return {
            ...base,
            rawContent: file?.content || ''
        };
    }

    return {
        ...base,
        data: buildScenarioDataForExport(parsed, preferences, context)
    };
}

function buildScenarioDataForExport(parsed, preferences, context) {
    if (preferences.mode === 'all') {
        return parsed;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return buildRequiredScenarioWithDefaults({});
    }

    const selectedPaths = preferences.mode === context.exportModeCustom
        ? [...context.requiredExportFields, ...preferences.customFields]
        : [...context.requiredExportFields];
    const selectorTree = buildFieldSelectorTree(selectedPaths, context.canonicalizeFieldPath);
    const selected = selectValueByFieldTree(parsed, selectorTree);
    return buildRequiredScenarioWithDefaults(selected);
}

function buildRequiredStepWithDefaults(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
    const divider = normalizeDividerValue(source.divider);
    if (divider !== null) {
        return {
            ...source,
            divider
        };
    }
    const normalized = {
        ...source,
        given: toStepLines(source.given),
        when: toStepLines(source.when)
    };
    normalized['then'] = toStepLines(source['then']);
    // A verdict is kept as written; a row without one is not checked yet and
    // gets no `pass` at all, since `false` would read as a failure.
    if (typeof source.pass !== 'boolean') delete normalized.pass;
    return normalized;
}

function normalizeDividerValue(value) {
    const divider = parseDivider(value);
    return divider ? serializeDivider(divider) : null;
}

function buildFieldSelectorTree(paths, canonicalizeFieldPath) {
    const root = createFieldSelectorNode();
    paths.forEach((path) => {
        const canonical = canonicalizeFieldPath(path);
        if (!canonical) return;
        const tokens = canonical.split('.').filter(Boolean);
        appendFieldSelectorPath(root, tokens);
    });
    return root;
}

function createFieldSelectorNode() {
    return {
        includeSelf: false,
        children: new Map()
    };
}

function appendFieldSelectorPath(root, tokens) {
    let current = root;
    tokens.forEach((token, index) => {
        if (!current.children.has(token)) {
            current.children.set(token, createFieldSelectorNode());
        }
        current = current.children.get(token);
        if (index === tokens.length - 1) {
            current.includeSelf = true;
        }
    });
}

function selectValueByFieldTree(value, node) {
    if (!node) return undefined;
    if (Array.isArray(value)) return selectArrayByFieldTree(value, node);
    if (!value || typeof value !== 'object') {
        return node.includeSelf ? value : undefined;
    }

    if (node.includeSelf && node.children.size === 0) {
        return cloneExportValue(value);
    }

    const output = {};
    node.children.forEach((childNode, key) => {
        const childValue = selectValueByFieldTree(value[key], childNode);
        if (childValue !== undefined) {
            output[key] = childValue;
        }
    });

    if (Object.keys(output).length > 0) {
        return output;
    }

    if (node.includeSelf) {
        return cloneExportValue(value);
    }
    return undefined;
}

function selectArrayByFieldTree(value, node) {
    if (!Array.isArray(value)) return undefined;

    if (node.includeSelf && node.children.size === 0) {
        return cloneExportValue(value);
    }

    const selectedItems = value.map(item => selectValueByFieldTree(item, node));

    if (selectedItems.some(item => item !== undefined)) {
        return selectedItems.map(item => (item === undefined ? {} : item));
    }

    if (node.includeSelf) {
        return cloneExportValue(value);
    }
    return [];
}

function cloneExportValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return value;
    }
}
