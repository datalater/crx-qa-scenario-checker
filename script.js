import {
    WORKSPACE_STORAGE_KEY,
    CHECKLIST_DENSITY_STORAGE_KEY,
    CHECKLIST_FILTER_STORAGE_KEY,
    PANEL_VISIBILITY_STORAGE_KEY,
    SCROLL_POSITIONS_STORAGE_KEY,
    CHECKLIST_STICKY_STORAGE_KEY,
    ROOT_PATHS_STORAGE_KEY
} from './constants/storage.js';
import { AUTOSAVE_DELAY_MS, WORKSPACE_VERSION, DEFAULT_FILE_NAME } from './configs/workspace.js';
import { EDITOR_CONFIG } from './configs/editor-config.js';
import { tryParseJson } from './utils/json.js';
import { nowTs, nowIso } from './utils/date.js';
import * as Workspace from './modules/workspace-manager.js';
import * as UI from './modules/ui-renderer.js';
import { DIVIDER_TYPE_IDS, DIVIDER_TYPES, parseDivider, serializeDivider } from './modules/divider-model.js';
import * as Editor from './modules/editor-manager.js';
import { captureEditorSelectionSnapshot, restoreEditorSelectionSnapshot } from './modules/editor-caret-manager.js';
import { createResizerLayoutManager } from './modules/resizer-layout-manager.js';
import { buildExportPayload, buildRequiredScenarioWithDefaults, formatExportFilenameDate } from './modules/export-data-manager.js';
import { createExportMenuManager } from './modules/export-menu-manager.js';
import { toWorkspaceFromImportedPayload as convertImportedPayloadToWorkspace } from './modules/import-workspace-converter.js';
import { createTreeMenuManager } from './modules/tree-menu-manager.js';
import { getLineColumn, getPositionFromLineColumn, findTrailingCommaPosition, normalizeErrorPosition } from './modules/text-position-utils.js';
import { createEditorSelectionManager } from './modules/editor-selection-manager.js';
import { resolveParseErrorPosition, formatParseErrorMessage, formatRuntimeErrorMessage, getSafeErrorMessage } from './modules/json-error-manager.js';
import {
    updateSaveIndicatorView,
    applyLineNumberVisibilityView,
    applyLineNumberPreferenceFromWorkspace,
    updateLineNumbersView,
    setJsonValidationValidView,
    setJsonValidationErrorView,
    updateJsonErrorMessageView,
    formatSavedTime
} from './modules/editor-view-state-manager.js';
import { setupMainEventListeners } from './modules/event-listener-manager.js';
import { updateFolderToggleButtonStateView, toggleAllFoldersState } from './modules/tree-folder-state-manager.js';
import { buildTreeRenderOptions } from './modules/tree-actions-manager.js';
import { createEditorHighlightManager } from './modules/editor-highlight-manager.js';
import { runNativeEditCommand } from './modules/editor-shortcut-manager.js';
import { matchShortcut, renderShortcutRows } from './modules/shortcut-registry.js';
import { createCommandPalette } from './modules/command-palette.js';
import { createNewFileCommand } from './modules/new-file-command.js';
import { createOpenFileCommand } from './modules/open-file-command.js';
import { canMoveFolder, applyFolderMove, joinFolderPath, remapPathPrefix } from './modules/folder-move.js';
import { directoriesMatch, directoryHasEntry } from './modules/directory-verify.js';
import { createContextMenu } from './modules/tab-context-menu.js';
import { createEditorCursorHistoryManager } from './modules/editor-cursor-history-manager.js';
import { createEditorFindReplaceManager } from './modules/editor-find-replace-manager.js';
import { createDeletedFileHistoryManager } from './modules/deleted-file-history-manager.js';
import {
    countChecklistReplacements,
    replaceInChecklist,
    searchChecklist,
    tokenizeChecklistSearchQuery
} from './modules/checklist-search-manager.js';
import { collectNoteAssetNames } from './modules/note-inline.js';
import { toStepLines } from './modules/step-lines.js';
import { createNoteAssetStore } from './modules/note-assets.js';
import { createNoteCellController } from './modules/note-cell-controller.js';
import { createNoteImageManager } from './modules/note-image-manager.js';
import { setupSurroundSelection } from './modules/surround-selection.js';
import {
    buildReferenceFilePath,
    buildRowReference,
    ensureRowIds,
    expandRowSelection,
    nextRowSelection
} from './modules/row-reference.js';
import { renderOpenFileTabs, closeOpenFileTab, closeTabsWhere, syncOpenFileIds } from './modules/open-file-tabs.js';

// --- Global State Mirroring the original ---
const EL = {
    editing: document.getElementById('editing'),
    highlighting: document.getElementById('highlighting'),
    highlightContent: document.getElementById('highlighting-content'),
    checklistBody: document.getElementById('checklist-body'),
    checklistView: document.getElementById('checklist-view'),
    highlightOverlay: document.getElementById('highlight-overlay'),
    jsonStatus: document.getElementById('json-status'),
    jsonErrorPosition: document.getElementById('json-error-position'),
    jsonErrorMessage: document.getElementById('json-error-message'),
    lineNumbers: document.getElementById('line-numbers'),
    toggleLineNumbers: document.getElementById('toggle-line-numbers'),
    editorWrapper: document.getElementById('editor-wrapper'),
    editorScrollMarkers: document.getElementById('editor-scroll-markers'),
    editorFindWidget: document.getElementById('editor-find-widget'),
    editorFindInput: document.getElementById('editor-find-input'),
    editorFindCount: document.getElementById('editor-find-count'),
    btnEditorFindPrev: document.getElementById('btn-editor-find-prev'),
    btnEditorFindNext: document.getElementById('btn-editor-find-next'),
    btnEditorFindClose: document.getElementById('btn-editor-find-close'),
    editorReplaceRow: document.getElementById('editor-replace-row'),
    editorReplaceInput: document.getElementById('editor-replace-input'),
    btnEditorReplaceOne: document.getElementById('btn-editor-replace-one'),
    btnEditorReplaceAll: document.getElementById('btn-editor-replace-all'),
    scenarioTitle: document.getElementById('scenario-title'),
    checklistProgress: document.getElementById('checklist-progress'),
    checklistDensityToggle: document.getElementById('checklist-density-toggle'),
    checklistStickyToggle: document.getElementById('checklist-sticky-toggle'),
    checklistSearchToggle: document.getElementById('checklist-search-toggle'),
    checklistSearchPanel: document.getElementById('checklist-search-panel'),
    checklistSearchInput: document.getElementById('checklist-search-input'),
    checklistSearchCount: document.getElementById('checklist-search-count'),
    checklistSearchResults: document.getElementById('checklist-search-results'),
    checklistSearchPrev: document.getElementById('checklist-search-prev'),
    checklistSearchNext: document.getElementById('checklist-search-next'),
    checklistSearchClose: document.getElementById('checklist-search-close'),
    checklistReplaceToggle: document.getElementById('checklist-replace-toggle'),
    checklistReplaceRow: document.getElementById('checklist-replace-row'),
    checklistReplaceInput: document.getElementById('checklist-replace-input'),
    checklistReplaceCount: document.getElementById('checklist-replace-count'),
    checklistReplaceOne: document.getElementById('checklist-replace-one'),
    checklistReplaceAll: document.getElementById('checklist-replace-all'),
    checklistFilterToggle: document.getElementById('checklist-filter-toggle'),
    checklistFilterLabel: document.getElementById('checklist-filter-label'),
    checklistFilterMenu: document.getElementById('checklist-filter-menu'),
    btnFormat: document.getElementById('btn-format'),
    saveIndicator: document.getElementById('save-indicator'),
    saveIndicatorTime: document.getElementById('save-indicator-time'),
    saveIndicatorLabel: document.getElementById('save-indicator-label'),
    topSaveStatus: document.getElementById('top-save-status'),
    paneResizer: document.getElementById('pane-resizer'),
    passHeaderToggle: document.getElementById('col-pass-toggle'),
    btnNewFolder: document.getElementById('btn-new-folder'),
    btnNewFile: document.getElementById('btn-new-file'),
    btnToggleFolders: document.getElementById('btn-toggle-folders'),
    btnToggleTree: document.getElementById('btn-toggle-tree'),
    btnTreeMenu: document.getElementById('btn-tree-menu'),
    btnShowTree: document.getElementById('btn-show-tree'),
    btnPanelFileTree: document.getElementById('btn-panel-file-tree'),
    btnPanelJsonEditor: document.getElementById('btn-panel-json-editor'),
    btnPanelTableEditor: document.getElementById('btn-panel-table-editor'),
    treeMenu: document.getElementById('tree-menu'),
    treeSearchInput: document.getElementById('tree-search-input'),
    treeSearchMeta: document.getElementById('tree-search-meta'),
    btnTreeSearchClear: document.getElementById('btn-tree-search-clear'),
    fileTree: document.getElementById('file-tree'),
    openFileTabs: document.getElementById('open-file-tabs'),
    treeContextMenu: document.getElementById('tree-context-menu'),
    treeContextNewFolder: document.getElementById('tree-context-new-folder'),
    treeContextNewFile: document.getElementById('tree-context-new-file'),
    treeContextCopy: document.getElementById('tree-context-copy'),
    treeContextRename: document.getElementById('tree-context-rename'),
    treeContextDelete: document.getElementById('tree-context-delete'),
    treeContextReadonly: document.getElementById('tree-context-readonly'),
    checklistContextMenu: document.getElementById('checklist-context-menu'),
    checklistContextDelete: document.getElementById('checklist-context-delete'),
    checklistContextPin: document.getElementById('checklist-context-pin'),
    checklistPinnedBody: document.getElementById('checklist-pinned-body'),
    btnKeyboardShortcuts: document.getElementById('btn-keyboard-shortcuts'),
    shortcutsModal: document.getElementById('keyboard-shortcuts-modal'),
    shortcutsBackdrop: document.getElementById('keyboard-shortcuts-backdrop'),
    btnShortcutsClose: document.getElementById('btn-shortcuts-close'),
    loadingOverlay: document.getElementById('loading-overlay'),
    appContainer: document.querySelector('.app-container'),
    checklistContextColor: document.getElementById('checklist-context-color'),
    checklistContextType: document.getElementById('checklist-context-type'),
    fileTreePanel: document.querySelector('.file-tree-panel'),
    fileTreeResizer: document.getElementById('file-tree-resizer'),
    appContent: document.querySelector('.app-content'),
    editorPane: document.getElementById('editor-pane'),
    editorContainer: document.querySelector('.editor-container'),
    checklistPane: document.querySelector('.checklist-pane'),
    panelEmptyState: document.getElementById('panel-empty-state'),
    loadingLabel: document.getElementById('loading-label'),
    loadingSteps: document.getElementById('loading-steps'),
    btnImport: document.getElementById('btn-import'),
    btnRequestWrite: document.getElementById('btn-request-write'),
    boundFilePathInput: document.getElementById('bound-file-path'),
    boundFileStatus: document.getElementById('bound-file-status'),
    btnExport: document.getElementById('btn-export'),
    exportSplit: document.getElementById('export-split'),
    btnExportMenu: document.getElementById('btn-export-menu'),
    exportOptionsMenu: document.getElementById('export-options-menu'),
    exportModeAll: document.getElementById('export-mode-all'),
    exportModeCustom: document.getElementById('export-mode-custom'),
    exportCustomOptions: document.getElementById('export-custom-options'),
    exportFieldSearch: document.getElementById('export-field-search'),
    btnExportSelectAll: document.getElementById('btn-export-select-all'),
    btnExportClearAll: document.getElementById('btn-export-clear-all'),
    exportFieldList: document.getElementById('export-field-list'),
    exportFieldCount: document.getElementById('export-field-count'),
    exportFieldEmpty: document.getElementById('export-field-empty'),
    fileInput: document.getElementById('file-input')
};

let currentData = null;
let workspace = null;
let checklistShowNote = false;
let checklistFilter = 'all';
let checklistSearchResults = [];
let checklistSearchResultIndex = -1;
let checklistSearchScopeActive = false;
let autosaveTimer = null;
let activeFileDirty = false;
let topSaveStatusActivated = false;
let topSaveStatusHideTimer = null;
let lastTreeSelectionType = 'file';
const MIN_EDITOR_WIDTH = 0;
const DEFAULT_FILE_TREE_WIDTH = 260;
const MIN_FILE_TREE_WIDTH = 180;
const MIN_JSON_EDITOR_WIDTH = 280;
let resizerLayout = null;
let exportMenuManager = null;
let treeMenuManager = null;
let editorSelectionManager = null;
let editorHighlightManager = null;
let editorCursorHistoryManager = null;
let editorFindReplaceManager = null;
let deletedFileHistoryManager = null;
let boundFileHandle = null;
let boundDirectoryHandle = null;
let boundDirectoryWriteEnabled = false;
let boundDirectoryJsonFileCount = 0;
let directoryFileHandleById = new Map();
let directoryFileFingerprintById = new Map();
let directoryHandleByFolderId = new Map();
let boundFileName = '';
let boundFileReadonly = false;
let treeMutationsEnabled = true;
let commandPalette = null;
let checklistStickyEnabled = true;
let stickyUpdateFrame = 0;
let pinnedRowsResizeObserver = null;
// Scroll positions per file path (paths survive reloads and folder re-reads, ids do not).
// Kept in memory for tab switches and mirrored to localStorage for reloads.
const MAX_SAVED_SCROLL_POSITIONS = 200;
const fileScrollPositions = new Map();
let scrollOwnerKey = null;
let scrollPersistTimer = null;
let tabContextMenu = null;
let directDiskSyncAvailable = false;
let lastSaveIndicatorState = 'saved';
let diskFlushInFlight = false;
let diskFlushQueued = false;
let directoryFlushInFlight = false;
let directoryFlushQueued = false;
let folderWritePermissionRequestInFlight = false;
let treeContextTarget = null;
let checklistContextTarget = null;
let lastRenderedChecklistFileId = null;
const pendingCopyFileIds = new Set();
let fileTreeSearchQuery = '';
let currentFileTreeSearchState = null;
let editorSearchHighlightQuery = '';
let currentJsonErrorPosition = -1;

const BOUND_FILE_PATH_DEFAULT_LABEL = '';
const BOUND_FILE_PATH_DEFAULT_TOOLTIP = 'No file bound';
const LOCAL_SAVE_ONLY_TOOLTIP = '로컬 저장소(localStorage)에 저장되었습니다. 현재 디스크 파일에 직접 저장할 수 없어 이 상태를 표시합니다.';
const DIRECTORY_LOCAL_SAVE_TOOLTIP = '폴더 기반 모드에서는 현재 로컬 저장 후 필요 시 디스크 동기화를 확장할 예정입니다. 지금은 로컬 저장을 기준으로 동작합니다.';
const STARTUP_LOADING_MIN_VISIBLE_MS = 900;
const HANDLE_DB_NAME = 'qa-scenario-handles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE_NAME = 'handles';
const BOUND_DIRECTORY_HANDLE_KEY = 'bound-directory-handle';

const EXPORT_MODE_ALL = 'all';
const EXPORT_MODE_CUSTOM = 'custom';
const EXPORT_MODE_REQUIRED_LEGACY = 'required';
const EXPORT_MODES = new Set([EXPORT_MODE_ALL, EXPORT_MODE_CUSTOM]);
const EXPORT_FORMAT = 'qa-scenario-export';
const REQUIRED_EXPORT_FIELDS = [
    'scenario',
    'steps',
    'steps.divider',
    'steps.given',
    'steps.when',
    'steps.then',
    'steps.pass',
    'steps.note'
];
const DEFAULT_PANEL_VISIBILITY = {
    fileTree: true,
    jsonEditor: true,
    tableEditor: true
};
let loadingStepState = [];
let loadingOverlayShownAt = 0;

// --- Initialization ---

function init() {
    setupResizerLayout();
    setupExportMenuManager();
    setupTreeMenuManager();
    setupEditorSelectionManager();
    setupEditorHighlightManager();
    setupEditorCursorHistoryManager();
    setupEditorFindReplaceManager();
    setupDeletedFileHistoryManager();
    setupNoteImages();
    setupSurroundSelection();
    setupChecklistRowSelection();
    setupChecklistDensityToggle();
    setupChecklistStickyHeadings();
    setupChecklistFilter();
    setupChecklistSearch();
    setupTableEditorSaveShortcut();
    setupOpenFileTabShortcuts();
    setupScrollPersistence();
    setupCommandPalette();
    loadScrollPositions();
    loadWorkspace();
    setupEventListeners();
    resizerLayout.setupResizing();
    setupWindowListeners();
    applyLineNumberVisibility();
    applyFileTreePreference();
    setupTreeMenu();
    setupExportMenu();
}

function openHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
                db.createObjectStore(HANDLE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open handle DB'));
    });
}

async function setBoundDirectoryHandleInDb(handle, name) {
    if (!handle || typeof indexedDB === 'undefined') return;
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(HANDLE_STORE_NAME);
        store.put({ handle, name, updatedAt: nowIso() }, BOUND_DIRECTORY_HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to store directory handle'));
        tx.onabort = () => reject(tx.error || new Error('Aborted while storing directory handle'));
    });
    db.close();
}

async function getBoundDirectoryHandleFromDb() {
    if (typeof indexedDB === 'undefined') return null;
    const db = await openHandleDb();
    const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
        const store = tx.objectStore(HANDLE_STORE_NAME);
        const request = store.get(BOUND_DIRECTORY_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Failed to load directory handle'));
    });
    db.close();
    return value;
}

async function clearBoundDirectoryHandleInDb() {
    if (typeof indexedDB === 'undefined') return;
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(HANDLE_STORE_NAME);
        store.delete(BOUND_DIRECTORY_HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to clear directory handle'));
        tx.onabort = () => reject(tx.error || new Error('Aborted while clearing directory handle'));
    });
    db.close();
}

function setupEditorSelectionManager() {
    editorSelectionManager = createEditorSelectionManager(EL.editing);
}

function setupEditorHighlightManager() {
    editorHighlightManager = createEditorHighlightManager({
        editing: EL.editing,
        highlightOverlay: EL.highlightOverlay,
        jsonErrorPosition: EL.jsonErrorPosition,
        getLineColumn,
        getEditorMetrics
    });
}

function setupEditorCursorHistoryManager() {
    editorCursorHistoryManager = createEditorCursorHistoryManager({
        editing: EL.editing,
        maxEntries: EDITOR_CONFIG.cursorHistory.maxEntries
    });
    editorCursorHistoryManager.reset();
}

function setupEditorFindReplaceManager() {
    editorFindReplaceManager = createEditorFindReplaceManager({
        editing: EL.editing,
        onStateChange: renderEditorFindWidget,
        onTextMutated: () => {
            validateAndRender();
            updateActiveFileFromEditor();
        }
    });
    renderEditorFindWidget(editorFindReplaceManager.getState());
}

function setupDeletedFileHistoryManager() {
    deletedFileHistoryManager = createDeletedFileHistoryManager({
        getWorkspace: () => workspace,
        persist,
        loadActiveFile,
        maxEntries: 30
    });
}

function setupResizerLayout() {
    resizerLayout = createResizerLayoutManager({
        el: {
            appContent: EL.appContent,
            paneResizer: EL.paneResizer,
            fileTreeResizer: EL.fileTreeResizer,
            fileTreePanel: EL.fileTreePanel,
            editorPane: EL.editorPane
        },
        isFileTreeVisible,
        persistFileTreeWidthPreference,
        minEditorWidth: MIN_EDITOR_WIDTH,
        minFileTreeWidth: MIN_FILE_TREE_WIDTH,
        minJsonEditorWidth: MIN_JSON_EDITOR_WIDTH
    });
}

function setupExportMenuManager() {
    exportMenuManager = createExportMenuManager({
        el: {
            btnExport: EL.btnExport,
            exportSplit: EL.exportSplit,
            btnExportMenu: EL.btnExportMenu,
            exportOptionsMenu: EL.exportOptionsMenu,
            exportModeAll: EL.exportModeAll,
            exportModeCustom: EL.exportModeCustom,
            exportCustomOptions: EL.exportCustomOptions,
            exportFieldSearch: EL.exportFieldSearch,
            btnExportSelectAll: EL.btnExportSelectAll,
            btnExportClearAll: EL.btnExportClearAll,
            exportFieldList: EL.exportFieldList,
            exportFieldCount: EL.exportFieldCount,
            exportFieldEmpty: EL.exportFieldEmpty
        },
        getWorkspace: () => workspace,
        persistWorkspace: () => Workspace.persistWorkspace(workspace),
        parseJson: tryParseJson,
        closeTreeMenu,
        requiredExportFields: REQUIRED_EXPORT_FIELDS,
        exportModeAll: EXPORT_MODE_ALL,
        exportModeCustom: EXPORT_MODE_CUSTOM,
        exportModeRequiredLegacy: EXPORT_MODE_REQUIRED_LEGACY,
        exportModes: EXPORT_MODES
    });
}

function setupTreeMenuManager() {
    treeMenuManager = createTreeMenuManager({
        btnTreeMenu: EL.btnTreeMenu,
        treeMenu: EL.treeMenu,
        closeExportMenu
    });
}

function loadWorkspace() {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const stored = raw ? tryParseJson(raw) : null;
    workspace = Workspace.normalizeWorkspace(stored);
    applyLineNumberPreference();
    applyFileTreePreference();
    applyFileTreeWidthPreference();
    updateStorageTargetFromWorkspaceMeta();
    loadActiveFile();
    void attemptRestoreBoundDirectoryConnection();
}

async function attemptRestoreBoundDirectoryConnection() {
    const boundMeta = workspace?.uiState?.boundFile;
    // Nothing to restore: close the startup overlay. This runs in the same
    // task as init(), so the UI never paints between the two.
    if (!boundMeta || boundMeta.kind !== 'directory' || boundDirectoryHandle) {
        hideLoadingOverlay();
        return;
    }

    showLoadingOverlay('Restoring folder connection…');
    setLoadingSteps([
        { id: 'workspace', label: 'Load saved workspace', status: 'done' },
        { id: 'handle', label: 'Find saved folder access', status: 'active' },
        { id: 'permission', label: 'Check folder permission', status: 'pending' },
        { id: 'read', label: 'Read folder contents', status: 'pending' },
        { id: 'apply', label: 'Open workspace', status: 'pending' }
    ]);

    let persisted = null;
    try {
        persisted = await getBoundDirectoryHandleFromDb();
    } catch (error) {
        updateLoadingStep('handle', 'warning');
        console.warn('[qa-scenario] failed to restore bound directory handle', error);
        await hideLoadingOverlayAfterMinimum();
        return;
    }

    const handle = persisted?.handle;
    if (!handle) {
        updateLoadingStep('handle', 'warning');
        await hideLoadingOverlayAfterMinimum();
        return;
    }

    updateLoadingStep('handle', 'done');
    updateLoadingStep('permission', 'active');
    try {
        const restored = await bindAndLoadFromDirectoryHandle(handle, {
            isRestore: true,
            onProgress: updateLoadingStep
        });
        if (!restored) {
            updateLoadingStep('permission', 'warning');
        }
    } catch (error) {
        updateLoadingStep('apply', 'warning');
        console.warn('[qa-scenario] auto-reconnect for directory failed', error);
    } finally {
        await hideLoadingOverlayAfterMinimum();
    }
}

function showLoadingOverlay(label = 'Loading…') {
    loadingOverlayShownAt = Date.now();
    if (EL.loadingLabel) EL.loadingLabel.textContent = label;
    if (EL.loadingOverlay) {
        EL.loadingOverlay.classList.remove('is-hidden');
        EL.loadingOverlay.setAttribute('aria-hidden', 'false');
    }
    // The overlay blocks the mouse; inert also keeps keyboard focus out.
    if (EL.appContainer) EL.appContainer.inert = true;
}

async function hideLoadingOverlayAfterMinimum() {
    const elapsed = Date.now() - loadingOverlayShownAt;
    const remaining = STARTUP_LOADING_MIN_VISIBLE_MS - elapsed;
    if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    hideLoadingOverlay();
}

function hideLoadingOverlay() {
    if (EL.loadingOverlay) {
        EL.loadingOverlay.classList.add('is-hidden');
        EL.loadingOverlay.setAttribute('aria-hidden', 'true');
    }
    if (EL.appContainer) EL.appContainer.inert = false;
    loadingStepState = [];
    renderLoadingSteps();
}

function setLoadingSteps(steps) {
    loadingStepState = Array.isArray(steps) ? steps.map((step) => ({ ...step })) : [];
    renderLoadingSteps();
}

function updateLoadingStep(id, status) {
    loadingStepState = loadingStepState.map((step) => {
        if (step.id !== id) return step;
        return { ...step, status };
    });
    renderLoadingSteps();
}

function renderLoadingSteps() {
    if (!EL.loadingSteps) return;
    EL.loadingSteps.replaceChildren(...loadingStepState.map((step) => {
        const item = document.createElement('li');
        const status = step.status || 'pending';
        item.className = `loading-step is-${status}`;
        item.textContent = step.label || '';
        return item;
    }));
}

function persist() {
    updateLastActiveFileLocation();
    updateOpenFilePaths();
    Workspace.persistWorkspace(workspace);
    activeFileDirty = false;
    updateSaveIndicator('saved');
    scheduleBoundFileFlush();
    scheduleDirectoryFileFlush();
    renderTree();
}

function getChecklistScroller() {
    return EL.checklistBody?.closest('.checklist-container') || null;
}

function getScrollKey(file) {
    return buildFileLocation(file)?.path || null;
}

function loadScrollPositions() {
    try {
        const stored = tryParseJson(localStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY) || '');
        Object.entries(stored && typeof stored === 'object' ? stored : {}).forEach(([key, value]) => {
            if (value && typeof value === 'object') fileScrollPositions.set(key, value);
        });
    } catch (_) { /* storage unavailable */ }
}

function persistScrollPositions() {
    clearTimeout(scrollPersistTimer);
    scrollPersistTimer = null;
    saveScrollPositionForCurrentFile();
    try {
        localStorage.setItem(SCROLL_POSITIONS_STORAGE_KEY, JSON.stringify(Object.fromEntries(fileScrollPositions)));
    } catch (_) { /* storage unavailable or full */ }
}

function schedulePersistScrollPositions() {
    clearTimeout(scrollPersistTimer);
    scrollPersistTimer = setTimeout(persistScrollPositions, 300);
}

function setupScrollPersistence() {
    EL.editing?.addEventListener('scroll', schedulePersistScrollPositions, { passive: true });
    getChecklistScroller()?.addEventListener('scroll', schedulePersistScrollPositions, { passive: true });
    window.addEventListener('pagehide', persistScrollPositions);
}

function saveScrollPositionForCurrentFile() {
    if (!scrollOwnerKey) return;
    const previous = fileScrollPositions.get(scrollOwnerKey) || {};
    const checklistScroller = getChecklistScroller();
    // A hidden pane reports scrollTop 0; keep the last known value instead.
    const editorVisible = EL.editing.clientHeight > 0;
    const checklistVisible = Boolean(checklistScroller) && checklistScroller.clientHeight > 0;
    // Re-insert so the Map stays ordered by recency; trim the oldest entries.
    fileScrollPositions.delete(scrollOwnerKey);
    fileScrollPositions.set(scrollOwnerKey, {
        editorTop: editorVisible ? EL.editing.scrollTop : (previous.editorTop ?? 0),
        editorLeft: editorVisible ? EL.editing.scrollLeft : (previous.editorLeft ?? 0),
        checklistTop: checklistVisible ? checklistScroller.scrollTop : (previous.checklistTop ?? 0),
        checklistLeft: checklistVisible ? checklistScroller.scrollLeft : (previous.checklistLeft ?? 0)
    });
    while (fileScrollPositions.size > MAX_SAVED_SCROLL_POSITIONS) {
        fileScrollPositions.delete(fileScrollPositions.keys().next().value);
    }
}

function restoreScrollPositionForFile(key, { restoreEditor = true } = {}) {
    const saved = key ? fileScrollPositions.get(key) : null;
    const checklistScroller = getChecklistScroller();
    if (checklistScroller) {
        checklistScroller.scrollTop = saved?.checklistTop ?? 0;
        checklistScroller.scrollLeft = saved?.checklistLeft ?? 0;
    }
    if (restoreEditor) {
        EL.editing.scrollTop = saved?.editorTop ?? 0;
        EL.editing.scrollLeft = saved?.editorLeft ?? 0;
        syncScroll();
    }
}

function loadActiveFile() {
    // The DOM still shows the previous file here; remember where it was scrolled.
    saveScrollPositionForCurrentFile();
    clearStepHighlight();
    const activeFile = resolveActiveFileOrFallback();
    updateLastActiveFileLocation();
    if (!activeFile) {
        editorSearchHighlightQuery = '';
        renderNoFileSelectedState();
    } else {
        const searchMatch = applyEditorSearchHighlightForFile(activeFile.id);
        EL.editing.value = activeFile.content;
        validateAndRender();
        const hasSearchJump = Boolean(searchMatch)
            && Number.isFinite(searchMatch.firstMatchIndex) && searchMatch.firstMatchIndex >= 0;
        const scrollKey = getScrollKey(activeFile);
        const isFirstLoad = scrollOwnerKey === null;
        restoreScrollPositionForFile(scrollKey, { restoreEditor: !hasSearchJump });
        // On startup the first layout may not be final yet; apply once more after it settles.
        if (isFirstLoad) {
            requestAnimationFrame(() => {
                if (scrollOwnerKey === scrollKey) restoreScrollPositionForFile(scrollKey, { restoreEditor: !hasSearchJump });
            });
        }
        if (hasSearchJump) {
            scrollToLine(searchMatch.firstMatchIndex);
            syncScroll();
        }
    }
    scrollOwnerKey = activeFile ? getScrollKey(activeFile) : null;
    renderTree();
    updateSaveIndicator('saved');
    activeFileDirty = false;
    editorCursorHistoryManager.reset();
    editorFindReplaceManager.syncFromEditorInput();
}

function buildFileLocation(file) {
    if (!file) return null;
    const folder = Workspace.getFolderById(workspace, file.folderId);
    const folderPath = String(folder?.path || '').trim();
    const fileName = String(file.name || '').trim();
    if (!fileName) return null;
    return {
        folderPath,
        fileName,
        path: folderPath ? `${folderPath}/${fileName}` : fileName
    };
}

function updateLastActiveFileLocation() {
    if (!workspace?.uiState) return;
    const activeFile = Workspace.getActiveFile(workspace);
    const location = buildFileLocation(activeFile);
    if (!location) return;
    workspace.uiState.lastActiveFileLocation = location;
}

/** Mirrors the open tabs as paths: ids change when a folder is re-read, paths do not. */
function updateOpenFilePaths() {
    if (!workspace?.uiState) return;
    const ids = syncOpenFileIds(workspace);
    workspace.uiState.openFilePaths = ids
        .map((id) => getScrollKey(Workspace.getFileById(workspace, id)))
        .filter(Boolean);
}

function restoreOpenFilesFromPaths(targetWorkspace, paths) {
    if (!targetWorkspace?.uiState || !Array.isArray(paths) || !paths.length) return;
    const folderById = new Map((targetWorkspace.folders || []).map((folder) => [folder.id, folder]));
    const idByPath = new Map();
    (targetWorkspace.files || []).forEach((file) => {
        const folderPath = String(folderById.get(file.folderId)?.path || '').trim();
        idByPath.set(folderPath ? `${folderPath}/${file.name}` : file.name, file.id);
    });
    targetWorkspace.uiState.openFileIds = paths.map((path) => idByPath.get(path)).filter(Boolean);
    syncOpenFileIds(targetWorkspace);
}

function getLastActiveFileLocation() {
    return workspace?.uiState?.lastActiveFileLocation || null;
}

function restoreActiveFileFromLocation(targetWorkspace, location) {
    if (!targetWorkspace?.uiState || !location) return false;
    const targetPath = String(location.path || '').trim();
    const targetFolderPath = String(location.folderPath || '').trim();
    const targetFileName = String(location.fileName || '').trim();
    if (!targetPath && !targetFileName) return false;

    const folderById = new Map((targetWorkspace.folders || []).map((folder) => [folder.id, folder]));
    const matchedFile = (targetWorkspace.files || []).find((file) => {
        const folder = folderById.get(file.folderId);
        const folderPath = String(folder?.path || '').trim();
        const fileName = String(file.name || '').trim();
        const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
        if (targetPath) return fullPath === targetPath;
        return folderPath === targetFolderPath && fileName === targetFileName;
    });

    if (!matchedFile) return false;
    targetWorkspace.uiState.activeFileId = matchedFile.id;
    targetWorkspace.uiState.selectedFileId = matchedFile.id;
    targetWorkspace.uiState.selectedFolderId = matchedFile.folderId;
    targetWorkspace.uiState.lastSelectionType = 'file';
    targetWorkspace.uiState.lastActiveFileLocation = {
        folderPath: targetFolderPath,
        fileName: targetFileName,
        path: targetPath || targetFileName
    };
    return true;
}

function resolveActiveFileOrFallback() {
    const active = Workspace.getActiveFile(workspace);
    if (active) return active;
    if (!workspace?.files?.length) return null;

    const fallback = workspace.files[0];
    workspace.uiState.activeFileId = fallback.id;
    workspace.uiState.selectedFileId = fallback.id;
    workspace.uiState.selectedFolderId = fallback.folderId;
    workspace.uiState.lastSelectionType = 'file';
    lastTreeSelectionType = 'file';
    return fallback;
}

function renderNoFileSelectedState() {
    currentData = null;
    EL.editing.value = '';
    updateLineNumbers();
    updateHighlighting();
    updateErrorPosition(-1);
    updateErrorMessage('');
    setJsonValidationIdleState('No file');

    if (EL.checklistBody) {
        EL.checklistBody.innerHTML = '<tr class="empty-state"><td colspan="6">Select a file or create a new file.</td></tr>';
    }

    if (EL.scenarioTitle) {
        const title = 'No file selected';
        EL.scenarioTitle.textContent = title;
        EL.scenarioTitle.title = title;
        EL.scenarioTitle.classList.remove('is-primary');
    }
}

// --- Logic ---

function validateAndRender() {
    updateLineNumbers();
    const text = EL.editing.value;
    updateHighlighting();

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        currentData = null;
        setJsonValidationErrorState('Invalid JSON');
        updateErrorMessage(formatParseErrorMessage(e));
        parseErrorPosition(getSafeErrorMessage(e));
        return;
    }

    currentData = parsed;
    try {
        renderChecklist();
        setJsonValidationValidState();
    } catch (e) {
        setJsonValidationErrorState('Runtime Error');
        updateErrorPosition(-1);
        updateErrorMessage(formatRuntimeErrorMessage(e));
        console.error('[qa-scenario] checklist render failed', e);
    }
}

function handleEditorInput() {
    validateAndRender();
    updateActiveFileFromEditor();
    editorFindReplaceManager.syncFromEditorInput();
}

function handleEditorPaste() {
    setTimeout(handleEditorInput, 0);
}

function handleEditorSelectionChange() {
    editorCursorHistoryManager.recordSelectionChange();
    editorFindReplaceManager.syncFromEditorSelection();
}

function handleEditorKeydown(event) {
    if (matchShortcut(event, 'findOpen')) {
        event.preventDefault();
        openFindWidget(false);
        return;
    }

    if (matchShortcut(event, 'replaceOpen')) {
        event.preventDefault();
        openFindWidget(true);
        return;
    }

    const findState = editorFindReplaceManager.getState();
    if (findState.isOpen && matchShortcut(event, 'findClose')) {
        event.preventDefault();
        closeFindWidget();
        return;
    }

    const isCursorHistoryBack = matchShortcut(event, 'cursorHistoryBack');
    const isCursorHistoryForward = matchShortcut(event, 'cursorHistoryForward');
    if (isCursorHistoryBack || isCursorHistoryForward) {
        event.preventDefault();
        const handled = isCursorHistoryForward
            ? editorCursorHistoryManager.moveForward()
            : editorCursorHistoryManager.moveBack();
        if (handled) syncScroll();
        return;
    }

    if (matchShortcut(event, 'save')) {
        event.preventDefault();
        runFormatAndSave();
        return;
    }

    if (matchShortcut(event, 'undo') || matchShortcut(event, 'redo')) {
        event.preventDefault();
        const command = matchShortcut(event, 'redo') ? 'redo' : 'undo';
        const handled = runNativeEditCommand(document, command);
        if (handled) {
            setTimeout(handleEditorInput, 0);
        }
        return;
    }

    const isIndent = matchShortcut(event, 'indent');
    const isOutdent = !isIndent && matchShortcut(event, 'outdent');
    if (!isIndent && !isOutdent) return;
    event.preventDefault();
    if (isOutdent) {
        editorSelectionManager.unindentSelection();
    } else {
        editorSelectionManager.indentSelection();
    }
    handleEditorInput();
}

function openFindWidget(showReplace) {
    const selectedText = getEditorSelectedText();
    editorFindReplaceManager.open({ showReplace, seedQuery: selectedText });
    if (EL.editorFindInput) {
        EL.editorFindInput.focus();
        EL.editorFindInput.select();
    }
}

function closeFindWidget() {
    editorFindReplaceManager.close();
    EL.editing.focus();
}

function getEditorSelectedText() {
    const start = EL.editing.selectionStart;
    const end = EL.editing.selectionEnd;
    if (start === end) return '';
    return EL.editing.value.slice(start, end);
}

function handleFindInput() {
    editorFindReplaceManager.setQuery(EL.editorFindInput.value);
    editorFindReplaceManager.revealActiveMatch({ focusEditor: false });
    syncScrollToActiveMatch();
}

function handleFindInputKeydown(event) {
    if (matchShortcut(event, 'findClose')) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (matchShortcut(event, 'findPrevious')) {
        event.preventDefault();
        editorFindReplaceManager.findPrevious({ focusEditor: false });
        syncScrollToActiveMatch();
        return;
    }
    if (matchShortcut(event, 'findNext')) {
        event.preventDefault();
        editorFindReplaceManager.findNext({ focusEditor: false });
        syncScrollToActiveMatch();
    }
}

function handleReplaceInput() {
    editorFindReplaceManager.setReplaceText(EL.editorReplaceInput.value);
}

function handleReplaceInputKeydown(event) {
    if (matchShortcut(event, 'findClose')) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (!matchShortcut(event, 'findNext')) return;
    event.preventDefault();
    editorFindReplaceManager.replaceCurrent();
    syncScrollToActiveMatch();
}

function handleFindNext() {
    editorFindReplaceManager.findNext();
    syncScrollToActiveMatch();
}

function handleFindPrev() {
    editorFindReplaceManager.findPrevious();
    syncScrollToActiveMatch();
}

function handleReplaceOne() {
    editorFindReplaceManager.replaceCurrent();
    syncScrollToActiveMatch();
}

function handleReplaceAll() {
    editorFindReplaceManager.replaceAll();
    syncScrollToActiveMatch();
}

function syncScrollToActiveMatch() {
    const activeMatch = editorFindReplaceManager.getActiveMatch();
    if (!activeMatch) {
        syncScroll();
        return;
    }
    scrollToLine(activeMatch.start);
    syncScroll();
}

function renderEditorFindWidget(state) {
    if (!EL.editorFindWidget || !EL.editorReplaceRow) return;
    EL.editorFindWidget.classList.toggle('is-hidden', !state.isOpen);
    EL.editorReplaceRow.classList.toggle('is-hidden', !state.showReplace);

    if (EL.editorFindInput && EL.editorFindInput.value !== state.query) {
        EL.editorFindInput.value = state.query;
    }
    if (EL.editorReplaceInput && EL.editorReplaceInput.value !== state.replaceText) {
        EL.editorReplaceInput.value = state.replaceText;
    }

    if (EL.editorFindCount) {
        const current = state.matchCount > 0 && state.activeMatchIndex >= 0
            ? state.activeMatchIndex + 1
            : 0;
        EL.editorFindCount.textContent = `${current} / ${state.matchCount}`;
    }
}

function runFormatAndSave() {
    if (!Workspace.getActiveFile(workspace)) {
        setJsonValidationIdleState('No file');
        return;
    }
    try {
        const selectionSnapshot = captureEditorSelectionSnapshot(EL.editing);
        EL.editing.value = JSON.stringify(JSON.parse(EL.editing.value), null, 2);
        restoreEditorSelectionSnapshot(EL.editing, selectionSnapshot);
        handleEditorInput();
        flushAutosaveAndPersist();
    } catch (e) {
        alert("Invalid JSON");
    }
}

function updateActiveFileFromEditor() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return;
    if (activeFile.content === EL.editing.value) return;
    activeFile.content = EL.editing.value;
    activeFile.updatedAt = nowTs();
    activeFileDirty = true;
    updateSaveIndicator('dirty');
    scheduleSave();
}

function updateHighlighting(errorPos = -1) {
    EL.highlightContent.innerHTML = Editor.syntaxHighlight(EL.editing.value, errorPos, editorSearchHighlightQuery);
    syncScroll();
}

function syncScroll() {
    EL.highlighting.scrollTop = EL.editing.scrollTop;
    EL.highlighting.scrollLeft = EL.editing.scrollLeft;
    EL.lineNumbers.scrollTop = EL.editing.scrollTop;
    updateStepHighlightPosition();
}

function parseErrorPosition(msg) {
    const position = resolveParseErrorPosition(
        msg,
        EL.editing.value,
        getPositionFromLineColumn,
        findTrailingCommaPosition
    );
    if (position === null) {
        updateErrorPosition(-1);
        return;
    }
    applyErrorPosition(position);
}

function applyErrorPosition(position) {
    const normalized = normalizeErrorPosition(EL.editing.value, position);
    if (normalized < 0) return updateErrorPosition(-1);
    updateHighlighting(normalized);
    updateErrorPosition(normalized);
}

function normalizeFileTreeSearchQuery(value) {
    return String(value || '').trim();
}

function buildSearchSnippet(source, startIndex, queryLength) {
    if (!source) return '';
    const raw = String(source);
    const context = 26;
    const start = Math.max(0, startIndex - context);
    const end = Math.min(raw.length, startIndex + queryLength + context);
    const sliced = raw.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!sliced) return '';
    const prefix = start > 0 ? '...' : '';
    const suffix = end < raw.length ? '...' : '';
    return `${prefix}${sliced}${suffix}`;
}

function buildFileTreeSearchState(query) {
    const normalizedQuery = normalizeFileTreeSearchQuery(query);
    const state = {
        query: normalizedQuery,
        matchesByFileId: new Map(),
        matchedFileCount: 0,
        totalMatchCount: 0
    };

    if (!normalizedQuery) return state;
    const queryLower = normalizedQuery.toLowerCase();

    workspace.files.forEach((file) => {
        const fileName = String(file.name || '');
        const content = String(file.content || '');
        const nameMatched = fileName.toLowerCase().includes(queryLower);

        const contentLower = content.toLowerCase();
        let contentMatchCount = 0;
        let firstMatchIndex = -1;
        let cursor = 0;
        while (cursor <= contentLower.length) {
            const foundIndex = contentLower.indexOf(queryLower, cursor);
            if (foundIndex < 0) break;
            if (firstMatchIndex < 0) firstMatchIndex = foundIndex;
            contentMatchCount += 1;
            cursor = foundIndex + Math.max(1, queryLower.length);
        }

        if (!nameMatched && contentMatchCount === 0) return;

        const snippet = firstMatchIndex >= 0
            ? buildSearchSnippet(content, firstMatchIndex, queryLower.length)
            : '';

        state.matchesByFileId.set(file.id, {
            nameMatched,
            contentMatchCount,
            snippet,
            firstMatchIndex
        });
        state.matchedFileCount += 1;
        state.totalMatchCount += (nameMatched ? 1 : 0) + contentMatchCount;
    });

    return state;
}

function getCurrentFileTreeSearchState() {
    const normalizedQuery = normalizeFileTreeSearchQuery(fileTreeSearchQuery);
    if (!normalizedQuery) {
        currentFileTreeSearchState = {
            query: '',
            matchesByFileId: new Map(),
            matchedFileCount: 0,
            totalMatchCount: 0
        };
        return currentFileTreeSearchState;
    }
    currentFileTreeSearchState = buildFileTreeSearchState(normalizedQuery);
    return currentFileTreeSearchState;
}

function applyEditorSearchHighlightForFile(fileId) {
    if (!fileId) {
        editorSearchHighlightQuery = '';
        return null;
    }

    const searchState = getCurrentFileTreeSearchState();
    const match = searchState.matchesByFileId.get(fileId) || null;
    editorSearchHighlightQuery = match ? searchState.query : '';
    return match;
}

function getEditorSearchMatchLineNumbers() {
    const query = String(editorSearchHighlightQuery || '').trim();
    if (!query) return new Set();

    const queryLower = query.toLowerCase();
    const lines = String(EL.editing?.value || '').split('\n');
    const matchedLineNumbers = new Set();
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes(queryLower)) {
            matchedLineNumbers.add(index + 1);
        }
    });
    return matchedLineNumbers;
}

function getCurrentJsonErrorLineNumber() {
    if (!Number.isFinite(currentJsonErrorPosition) || currentJsonErrorPosition < 0) return null;
    return getLineColumn(String(EL.editing?.value || ''), currentJsonErrorPosition).line;
}

function renderEditorScrollMarkers(matchLineNumbers = getEditorSearchMatchLineNumbers()) {
    if (!EL.editorScrollMarkers || !EL.editing) return;

    const lineCount = Math.max(1, String(EL.editing.value || '').split('\n').length);
    const matchLines = [...matchLineNumbers]
        .filter((lineNumber) => Number.isFinite(lineNumber) && lineNumber >= 1 && lineNumber <= lineCount)
        .sort((left, right) => left - right);
    const errorLineNumber = getCurrentJsonErrorLineNumber();

    const createMarker = (lineNumber, className, title) => {
        const marker = document.createElement('span');
        marker.className = `editor-scroll-marker ${className}`;
        const topPercent = lineCount <= 1 ? 0 : ((lineNumber - 1) / (lineCount - 1)) * 100;
        marker.style.top = `calc(${topPercent}% - 1px)`;
        marker.title = title;
        return marker;
    };

    const markers = matchLines.map((lineNumber) => (
        createMarker(lineNumber, 'is-search-match', `Search match on line ${lineNumber}`)
    ));

    if (Number.isFinite(errorLineNumber) && errorLineNumber >= 1 && errorLineNumber <= lineCount) {
        markers.push(createMarker(errorLineNumber, 'is-json-error', `JSON error on line ${errorLineNumber}`));
    }

    EL.editorScrollMarkers.replaceChildren(...markers);
}

function updateTreeSearchMeta(searchState) {
    if (!EL.treeSearchMeta || !EL.btnTreeSearchClear) return;
    const query = searchState?.query || '';
    const hasQuery = query.length > 0;

    EL.btnTreeSearchClear.hidden = !hasQuery;

    if (!hasQuery) {
        EL.treeSearchMeta.textContent = '';
        return;
    }

    if (searchState.matchedFileCount === 0) {
        EL.treeSearchMeta.textContent = `No matches for "${query}"`;
        return;
    }

    EL.treeSearchMeta.textContent = `${searchState.matchedFileCount} files / ${searchState.totalMatchCount} matches`;
}

function refreshEditorSearchHighlightForActiveFile() {
    const activeFile = Workspace.getActiveFile(workspace);
    const activeFileId = activeFile?.id || null;
    applyEditorSearchHighlightForFile(activeFileId);
    if (activeFileId) {
        validateAndRender();
    }
}

function handleTreeSearchInput(event) {
    fileTreeSearchQuery = normalizeFileTreeSearchQuery(event?.target?.value);
    renderTree();
    refreshEditorSearchHighlightForActiveFile();
}

function clearTreeSearch() {
    if (!fileTreeSearchQuery) return;
    fileTreeSearchQuery = '';
    if (EL.treeSearchInput) {
        EL.treeSearchInput.value = '';
        EL.treeSearchInput.focus();
    }
    renderTree();
    refreshEditorSearchHighlightForActiveFile();
}

function handleTreeSearchKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    clearTreeSearch();
}

function renderTree() {
    const fileSearchState = getCurrentFileTreeSearchState();
    const treeOptions = buildTreeRenderOptions({
        getWorkspace: () => workspace,
        getActiveFileDirty: () => activeFileDirty,
        canMutateTree: () => treeMutationsEnabled,
        showInlineActions: false,
        onOpenContextMenu: openTreeContextMenu,
        setLastTreeSelectionType: (nextType) => { lastTreeSelectionType = nextType; },
        persist,
        loadActiveFile,
        workspaceApi: Workspace,
        prompt: (message, defaultValue) => window.prompt(message, defaultValue),
        onDeleteFile: (deletedFile, deletedIndex) => {
            deletedFileHistoryManager.recordDeletedFile(deletedFile, deletedIndex);
        },
        onMoveFile: (fileId, targetFolderId) => moveFileById(fileId, targetFolderId),
        onMoveFolder: (folderId, targetFolderId) => moveFolderById(folderId, targetFolderId),
        canDropFolder: (folderId, targetFolderId) => canMoveFolder(workspace, folderId, targetFolderId).ok
    });
    treeOptions.pendingCopyFileIds = pendingCopyFileIds;
    treeOptions.fileSearchState = fileSearchState;
    UI.renderFileTree(EL.fileTree, workspace, treeOptions);
    renderOpenFileTabs(EL.openFileTabs, workspace, {
        isDirty: () => activeFileDirty,
        onSelect: activateFileFromTab,
        onClose: closeFileTab,
        onContextMenu: openTabContextMenu,
        onReorder: persist
    });
    updateTreeSearchMeta(fileSearchState);
    updateFolderToggleButtonState();
}

function activateFileFromTab(id) {
    const file = Workspace.getFileById(workspace, id);
    if (!file) return;
    workspace.uiState.activeFileId = id;
    workspace.uiState.selectedFolderId = file.folderId;
    workspace.uiState.selectedFileId = id;
    workspace.uiState.lastSelectionType = 'file';
    lastTreeSelectionType = 'file';
    persist();
    loadActiveFile();
}

function closeFileTab(id) {
    const nextActiveId = closeOpenFileTab(workspace, id);
    if (!nextActiveId) return;
    if (nextActiveId === workspace.uiState.activeFileId) {
        persist();
    } else {
        activateFileFromTab(nextActiveId);
    }
}

function applyTabClosure(shouldClose, keepActiveId) {
    const nextActiveId = closeTabsWhere(workspace, shouldClose, keepActiveId);
    if (!nextActiveId) return;
    if (nextActiveId === workspace.uiState.activeFileId) {
        persist();
    } else {
        activateFileFromTab(nextActiveId);
    }
}

function openTabContextMenu(fileId, x, y) {
    const file = Workspace.getFileById(workspace, fileId);
    if (!file) return;
    if (!tabContextMenu) tabContextMenu = createContextMenu();
    const ids = syncOpenFileIds(workspace);
    const index = ids.indexOf(fileId);
    const canMutate = treeMutationsEnabled;
    tabContextMenu.open([
        {
            label: '새 파일',
            disabled: !canMutate,
            onSelect: () => {
                // The palette creates files relative to the selected folder.
                workspace.uiState.selectedFolderId = file.folderId;
                commandPalette?.open({ commandId: 'newFile' });
            }
        },
        { separator: true },
        { label: '탭 닫기', disabled: ids.length < 2, onSelect: () => closeFileTab(fileId) },
        {
            label: '다른 탭 모두 닫기',
            disabled: ids.length < 2,
            onSelect: () => applyTabClosure((id) => id !== fileId, fileId)
        },
        {
            label: '오른쪽 탭 모두 닫기',
            disabled: index < 0 || index >= ids.length - 1,
            onSelect: () => applyTabClosure((id, i) => i > index, fileId)
        },
        { separator: true },
        { label: '이름 변경', disabled: !canMutate, onSelect: () => renameFileById(fileId) },
        { label: '파일 복사', disabled: !canMutate, onSelect: () => duplicateFileById(fileId) },
        { label: '경로 복사', onSelect: () => copyFilePath(file) },
        { separator: true },
        { label: '삭제', danger: true, disabled: !canMutate, onSelect: () => deleteFileById(fileId) }
    ], x, y);
}

async function copyFilePath(file) {
    const path = buildFileLocation(file)?.path || file.name;
    try {
        await navigator.clipboard.writeText(path);
    } catch (error) {
        console.error('[qa-scenario] failed to copy file path', error);
        alert('경로 복사에 실패했습니다.');
    }
}

function updateFolderToggleButtonState() {
    updateFolderToggleButtonStateView(
        {
            btnToggleFolders: EL.btnToggleFolders,
            fileTreePanel: EL.fileTreePanel
        },
        workspace,
        Workspace.getActiveFile
    );
}

function toggleAllFolders() {
    const changed = toggleAllFoldersState(workspace, Workspace.getActiveFile);
    if (!changed) return;
    persist();
}

function setupTreeMenu() {
    if (!treeMenuManager) return;
    treeMenuManager.setup();
}

function closeTreeMenu() {
    if (!treeMenuManager) return;
    treeMenuManager.close();
}

function openTreeContextMenu(target) {
    if (!EL.treeContextMenu || !target) return;

    treeContextTarget = target;
    const canMutate = treeMutationsEnabled;
    const isEmptyTarget = target.type === 'empty';

    if (EL.treeContextNewFolder) {
        EL.treeContextNewFolder.hidden = false;
        EL.treeContextNewFolder.disabled = !canMutate;
    }
    if (EL.treeContextNewFile) {
        EL.treeContextNewFile.hidden = false;
        EL.treeContextNewFile.disabled = !canMutate;
    }
    if (EL.treeContextRename) {
        EL.treeContextRename.hidden = isEmptyTarget;
        EL.treeContextRename.disabled = !canMutate;
        EL.treeContextRename.textContent = target.type === 'folder' ? '폴더 이름 변경' : '파일 이름 변경';
    }
    if (EL.treeContextCopy) {
        const isFileTarget = target.type === 'file';
        EL.treeContextCopy.hidden = !isFileTarget;
        EL.treeContextCopy.disabled = !canMutate;
        EL.treeContextCopy.textContent = '파일 복사';
    }
    if (EL.treeContextDelete) {
        EL.treeContextDelete.hidden = isEmptyTarget;
        EL.treeContextDelete.disabled = !canMutate;
        EL.treeContextDelete.textContent = target.type === 'folder' ? '폴더 삭제' : '파일 삭제';
    }
    if (EL.treeContextReadonly) {
        EL.treeContextReadonly.hidden = canMutate;
    }

    const menuWidth = 180;
    const menuHeight = 220;
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
    const left = Math.min(Math.max(8, target.x), maxLeft);
    const top = Math.min(Math.max(8, target.y), maxTop);

    EL.treeContextMenu.style.left = `${left}px`;
    EL.treeContextMenu.style.top = `${top}px`;
    EL.treeContextMenu.hidden = false;

    const actualMenuHeight = EL.treeContextMenu.offsetHeight || menuHeight;
    const adjustedTop = Math.min(Math.max(8, target.y), Math.max(8, window.innerHeight - actualMenuHeight - 8));
    EL.treeContextMenu.style.top = `${adjustedTop}px`;
}

function isDirectoryWritableMode() {
    return Boolean(boundDirectoryHandle && boundDirectoryWriteEnabled);
}

function getDescendantFolderIds(rootFolderId) {
    const descendants = new Set([rootFolderId]);
    let changed = true;
    while (changed) {
        changed = false;
        workspace.folders.forEach((folder) => {
            if (!descendants.has(folder.id) && descendants.has(folder.parentId)) {
                descendants.add(folder.id);
                changed = true;
            }
        });
    }
    return descendants;
}

function compareFileNameForSelection(a, b) {
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
}

function pickFallbackFileAfterDelete(deletedFile, remainingFiles) {
    if (!deletedFile || !Array.isArray(remainingFiles) || remainingFiles.length === 0) {
        return null;
    }

    const inSameFolder = remainingFiles
        .filter((file) => file.folderId === deletedFile.folderId)
        .sort(compareFileNameForSelection);

    const nextInFolder = inSameFolder.find((file) => compareFileNameForSelection(file, deletedFile) > 0);
    if (nextInFolder) return nextInFolder;

    for (let index = inSameFolder.length - 1; index >= 0; index -= 1) {
        const candidate = inSameFolder[index];
        if (compareFileNameForSelection(candidate, deletedFile) < 0) {
            return candidate;
        }
    }

    const sortedAll = [...remainingFiles].sort((a, b) => {
        const folderA = Workspace.getFolderById(workspace, a.folderId);
        const folderB = Workspace.getFolderById(workspace, b.folderId);
        const pathA = folderA?.path || folderA?.name || '';
        const pathB = folderB?.path || folderB?.name || '';

        const folderCompare = pathA.localeCompare(pathB, 'en', { sensitivity: 'base', numeric: true });
        if (folderCompare !== 0) return folderCompare;

        const nameCompare = compareFileNameForSelection(a, b);
        if (nameCompare !== 0) return nameCompare;

        return a.id.localeCompare(b.id, 'en', { sensitivity: 'base', numeric: true });
    });

    return sortedAll[0] || null;
}

function closeTreeContextMenu() {
    if (!EL.treeContextMenu) return;
    EL.treeContextMenu.hidden = true;
    treeContextTarget = null;
}

function getRootFolderId() {
    return workspace?.folders?.[0]?.id || null;
}

function getContextTargetFolderId() {
    if (!treeContextTarget) return getRootFolderId();
    if (treeContextTarget.type === 'folder') return treeContextTarget.id;
    if (treeContextTarget.type === 'file') {
        return Workspace.getFileById(workspace, treeContextTarget.id)?.folderId || getRootFolderId();
    }
    return getRootFolderId();
}

function openChecklistContextMenu(target) {
    if (!EL.checklistContextMenu || target == null) return;
    checklistContextTarget = target;
    // The menu acts on the selection; a row outside it becomes the selection.
    if (!getSelectedStepIndexes().has(target.index)) setChecklistRowSelection([target.index], target.index);
    const referenceItem = document.getElementById('checklist-context-copy-reference');
    if (referenceItem) {
        const count = expandRowSelection(currentData?.steps, getSelectedStepIndexes()).length;
        referenceItem.textContent = count > 0 ? `행 ${count}개 참조 복사` : '행 참조 복사';
        referenceItem.disabled = count === 0;
    }
    EL.checklistContextPin.textContent = currentData?.steps?.[target.index]?.pinned === true
        ? '행 고정 해제' : '행 고정';

    if (EL.checklistContextColor) {
        EL.checklistContextColor.hidden = !target.isDivider;
    }
    if (EL.checklistContextType) {
        EL.checklistContextType.hidden = !target.isDivider;
    }
    if (target.isDivider) markChecklistContextDividerSelection(target.index);

    const menuWidth = 160;
    const menuHeight = 40;
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
    const left = Math.min(Math.max(8, target.x), maxLeft);
    const top = Math.min(Math.max(8, target.y), maxTop);

    EL.checklistContextMenu.style.left = `${left}px`;
    EL.checklistContextMenu.style.top = `${top}px`;
    EL.checklistContextMenu.hidden = false;
    EL.checklistContextMenu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - EL.checklistContextMenu.offsetHeight - 8))}px`;
}

function closeChecklistContextMenu() {
    if (!EL.checklistContextMenu) return;
    EL.checklistContextMenu.hidden = true;
    checklistContextTarget = null;
}

function openShortcutsModal() {
    const tbody = EL.shortcutsModal?.querySelector('tbody');
    if (tbody) renderShortcutRows(tbody);
    if (EL.shortcutsModal) EL.shortcutsModal.classList.remove('is-hidden');
    if (EL.shortcutsBackdrop) EL.shortcutsBackdrop.classList.remove('is-hidden');
}

function closeShortcutsModal() {
    if (EL.shortcutsModal) EL.shortcutsModal.classList.add('is-hidden');
    if (EL.shortcutsBackdrop) EL.shortcutsBackdrop.classList.add('is-hidden');
}

function handleChecklistContextPin() {
    const step = currentData?.steps?.[checklistContextTarget?.index];
    if (!step) return;
    if (step.pinned === true) delete step.pinned;
    else step.pinned = true;
    closeChecklistContextMenu();
    syncToEditor();
    renderChecklist();
}

function handleChecklistContextDelete() {
    if (checklistContextTarget == null) return;
    const idx = checklistContextTarget.index;
    if (!currentData || !Array.isArray(currentData.steps)) return;
    if (idx < 0 || idx >= currentData.steps.length) return;
    currentData.steps.splice(idx, 1);
    syncToEditor();
    renderChecklist();
    closeChecklistContextMenu();
}

/** Rewrites one divider attribute, keeping the rest via parse/serialize. */
function patchChecklistDivider(index, patch) {
    if (!currentData || !Array.isArray(currentData.steps)) return;
    const step = currentData.steps[index];
    const divider = parseDivider(step?.divider);
    if (!divider) return;
    step.divider = serializeDivider({ ...divider, ...patch });
    syncToEditor();
    renderChecklist();
}

function handleChecklistContextColorClick(event) {
    const btn = event.target.closest('[data-color]');
    if (!btn || checklistContextTarget == null) return;
    patchChecklistDivider(checklistContextTarget.index, { color: btn.dataset.color || '' });
    closeChecklistContextMenu();
}

function handleChecklistContextTypeClick(event) {
    const btn = event.target.closest('[data-divider-type]');
    if (!btn || checklistContextTarget == null) return;
    patchChecklistDivider(checklistContextTarget.index, { type: btn.dataset.dividerType });
    closeChecklistContextMenu();
}

/** The type submenu is built from the registry, so new types show up here. */
function renderChecklistContextTypeMenu() {
    const menu = EL.checklistContextType?.querySelector('.context-submenu');
    if (!menu) return;
    menu.replaceChildren(...DIVIDER_TYPE_IDS.map((type) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-color-item';
        btn.setAttribute('role', 'menuitemradio');
        btn.dataset.dividerType = type;
        btn.textContent = DIVIDER_TYPES[type].label;
        return btn;
    }));
}

function markChecklistContextDividerSelection(index) {
    const divider = parseDivider(currentData?.steps?.[index]?.divider);
    if (!divider) return;
    const mark = (items, selectedValue, readValue) => items.forEach((item) => {
        const selected = readValue(item) === selectedValue;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-checked', String(selected));
    });
    mark(EL.checklistContextColor?.querySelectorAll('[data-color]') || [],
        divider.color.toLowerCase(), item => (item.dataset.color || '').toLowerCase());
    mark(EL.checklistContextType?.querySelectorAll('[data-divider-type]') || [],
        divider.type, item => item.dataset.dividerType);
}

async function handleTreeContextRename() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
    if (treeContextTarget.type === 'empty') return;
    if (treeContextTarget.type === 'folder') {
        await renameFolderById(treeContextTarget.id);
    } else {
        await renameFileById(treeContextTarget.id);
    }
    closeTreeContextMenu();
}

async function handleTreeContextDelete() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
    if (treeContextTarget.type === 'empty') return;
    if (treeContextTarget.type === 'folder') {
        await deleteFolderById(treeContextTarget.id);
    } else {
        await deleteFileById(treeContextTarget.id);
    }
    closeTreeContextMenu();
}

function handleTreeContextCopy() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
    if (treeContextTarget.type !== 'file') return;

    const targetFileId = treeContextTarget.id;
    closeTreeContextMenu();
    void duplicateFileById(targetFileId);
}

function handleTreeContextNewFolder() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
    const parentFolderId = getContextTargetFolderId();
    closeTreeContextMenu();
    void createFolderFromUi({ parentFolderId });
}

function handleTreeContextNewFile() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
    const parentFolderId = getContextTargetFolderId();
    closeTreeContextMenu();
    void createFileFromUi({ folderId: parentFolderId });
}

async function renameFolderById(id) {
    const folder = Workspace.getFolderById(workspace, id);
    if (!folder) return;
    const nextName = window.prompt('Rename folder', folder.name);
    if (!nextName) return;
    const normalizedName = Workspace.getNextAvailableFolderName(workspace, nextName, id);
    if (normalizedName === folder.name) return;

    if (isDirectoryWritableMode()) {
        if (!folder.parentId) {
            alert('루트 폴더는 이름 변경할 수 없습니다.');
            return;
        }

        const sourceHandle = directoryHandleByFolderId.get(folder.id);
        const parentHandle = directoryHandleByFolderId.get(folder.parentId);
        if (!sourceHandle || !parentHandle) {
            alert('디스크 폴더 이름 변경에 필요한 핸들을 찾지 못했습니다.');
            return;
        }

        const parentPath = folder.path ? folder.path.split('/').slice(0, -1).join('/') : '';
        const renamedPath = parentPath ? `${parentPath}/${normalizedName}` : normalizedName;

        try {
            try {
                await parentHandle.getDirectoryHandle(normalizedName, { create: false });
                alert(`동일한 이름의 폴더가 이미 존재합니다: ${normalizedName}`);
                return;
            } catch {}

            const targetHandle = await parentHandle.getDirectoryHandle(normalizedName, { create: true });
            await copyDirectoryEntries(sourceHandle, targetHandle);
            await parentHandle.removeEntry(folder.name, { recursive: true });

            await bindAndLoadFromDirectoryHandle(boundDirectoryHandle, { isRestore: true });
            const renamedFolder = workspace.folders.find((item) => item.path === renamedPath);
            if (renamedFolder) {
                workspace.uiState.selectedFolderId = renamedFolder.id;
                workspace.uiState.lastSelectionType = 'folder';
                persist();
            }
            updateBoundFilePathInput('', 'bound');
            return;
        } catch (error) {
            console.error('[qa-scenario] failed to rename folder on disk', error);
            alert('디스크 폴더 이름 변경에 실패했습니다.');
            return;
        }
    }

    folder.name = normalizedName;
    persist();
}

async function copyDirectoryEntries(sourceHandle, targetHandle) {
    for await (const [entryName, entryHandle] of sourceHandle.entries()) {
        if (entryHandle.kind === 'directory') {
            const childTarget = await targetHandle.getDirectoryHandle(entryName, { create: true });
            await copyDirectoryEntries(entryHandle, childTarget);
            continue;
        }
        if (entryHandle.kind !== 'file') continue;
        const sourceFile = await entryHandle.getFile();
        const targetFileHandle = await targetHandle.getFileHandle(entryName, { create: true });
        const writable = await targetFileHandle.createWritable();
        await writable.write(await sourceFile.arrayBuffer());
        await writable.close();
    }
}

async function deleteFolderById(id) {
    const folder = Workspace.getFolderById(workspace, id);
    if (!folder) return;
    const descendantIds = getDescendantFolderIds(id);
    const childCount = workspace.files.filter((file) => descendantIds.has(file.folderId)).length;
    const ok = window.confirm(`Delete folder "${folder.name}" and ${childCount} file(s)?`);
    if (!ok) return;

    if (isDirectoryWritableMode()) {
        if (!folder.parentId) {
            alert('루트 폴더는 삭제할 수 없습니다.');
            return;
        }
        const parentFolder = Workspace.getFolderById(workspace, folder.parentId);
        const parentHandle = directoryHandleByFolderId.get(folder.parentId);
        if (!parentFolder || !parentHandle || typeof parentHandle.removeEntry !== 'function') {
            alert('디스크 폴더 삭제에 필요한 핸들을 찾지 못했습니다.');
            return;
        }
        try {
            await parentHandle.removeEntry(folder.name, { recursive: true });
        } catch (error) {
            console.error('[qa-scenario] failed to delete folder on disk', error);
            alert('디스크 폴더 삭제에 실패했습니다.');
            return;
        }
    }

    const removedFileIds = workspace.files.filter((file) => descendantIds.has(file.folderId)).map((file) => file.id);
    removedFileIds.forEach((fileId) => {
        directoryFileHandleById.delete(fileId);
        directoryFileFingerprintById.delete(fileId);
    });
    descendantIds.forEach((folderId) => {
        directoryHandleByFolderId.delete(folderId);
    });

    workspace.folders = workspace.folders.filter((item) => !descendantIds.has(item.id));
    workspace.files = workspace.files.filter((file) => !descendantIds.has(file.folderId));
    if (workspace.uiState.selectedFolderId && descendantIds.has(workspace.uiState.selectedFolderId)) {
        workspace.uiState.selectedFolderId = null;
    }
    if (workspace.uiState.selectedFileId) {
        const selected = Workspace.getFileById(workspace, workspace.uiState.selectedFileId);
        if (!selected || descendantIds.has(selected.folderId)) workspace.uiState.selectedFileId = null;
    }
    if (workspace.uiState.activeFileId) {
        const active = Workspace.getFileById(workspace, workspace.uiState.activeFileId);
        if (!active || descendantIds.has(active.folderId)) workspace.uiState.activeFileId = null;
    }
    persist();
    loadActiveFile();
}

async function renameFileById(id) {
    const file = Workspace.getFileById(workspace, id);
    if (!file) return;
    const nextName = window.prompt('Rename file', file.name);
    if (!nextName) return;
    const normalizedName = Workspace.getNextAvailableFileName(workspace, file.folderId, nextName, id);
    if (normalizedName === file.name) return;

    if (isDirectoryWritableMode()) {
        const folderHandle = directoryHandleByFolderId.get(file.folderId);
        if (!folderHandle) {
            alert('디스크 파일 이름 변경에 필요한 폴더 핸들을 찾지 못했습니다.');
            return;
        }

        const oldName = file.name;
        const oldHandle = directoryFileHandleById.get(file.id);
        if (!oldHandle) {
            alert('디스크 파일 이름 변경에 필요한 파일 핸들을 찾지 못했습니다.');
            return;
        }

        try {
            const newHandle = await folderHandle.getFileHandle(normalizedName, { create: true });
            const writable = await newHandle.createWritable();
            await writable.write(file.content || '');
            await writable.close();
            await folderHandle.removeEntry(oldName);

            const syncedFile = await newHandle.getFile();
            directoryFileHandleById.set(file.id, newHandle);
            directoryFileFingerprintById.set(file.id, buildFileFingerprint(syncedFile));
        } catch (error) {
            console.error('[qa-scenario] failed to rename file on disk', error);
            alert('디스크 파일 이름 변경에 실패했습니다.');
            return;
        }
    }

    file.name = normalizedName;
    file.updatedAt = nowTs();
    persist();
}

async function deleteFileById(id) {
    const file = Workspace.getFileById(workspace, id);
    if (!file) return;
    const ok = window.confirm(`Delete file "${file.name}"?`);
    if (!ok) return;

    if (isDirectoryWritableMode()) {
        const folderHandle = directoryHandleByFolderId.get(file.folderId);
        if (!folderHandle || typeof folderHandle.removeEntry !== 'function') {
            alert('디스크 파일 삭제에 필요한 폴더 핸들을 찾지 못했습니다.');
            return;
        }
        try {
            await folderHandle.removeEntry(file.name);
        } catch (error) {
            console.error('[qa-scenario] failed to delete file on disk', error);
            alert('디스크 파일 삭제에 실패했습니다.');
            return;
        }
    }

    const deletedIndex = workspace.files.findIndex((item) => item.id === id);
    const deletedFile = deletedIndex >= 0 ? workspace.files[deletedIndex] : null;
    if (deletedFile) {
        deletedFileHistoryManager.recordDeletedFile(deletedFile, deletedIndex);
    }
    workspace.files = workspace.files.filter((item) => item.id !== id);
    const fallbackFile = pickFallbackFileAfterDelete(deletedFile, workspace.files);

    directoryFileHandleById.delete(id);
    directoryFileFingerprintById.delete(id);

    if (workspace.uiState.activeFileId === id) {
        workspace.uiState.activeFileId = fallbackFile ? fallbackFile.id : null;
    }

    if (workspace.uiState.selectedFileId === id) {
        workspace.uiState.selectedFileId = fallbackFile ? fallbackFile.id : null;
    }

    if (fallbackFile) {
        workspace.uiState.selectedFolderId = fallbackFile.folderId;
        workspace.uiState.lastSelectionType = 'file';
        lastTreeSelectionType = 'file';
    }

    persist();
    loadActiveFile();
}

/** Moves saved scroll state (and the live owner key) when a path changes. */
function remapScrollKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    if (fileScrollPositions.has(oldKey)) {
        fileScrollPositions.set(newKey, fileScrollPositions.get(oldKey));
        fileScrollPositions.delete(oldKey);
    }
    if (scrollOwnerKey === oldKey) scrollOwnerKey = newKey;
}

function remapScrollKeysByPrefix(oldPrefix, newPrefix) {
    [...fileScrollPositions.keys(), scrollOwnerKey].forEach((key) => {
        if (key) remapScrollKey(key, remapPathPrefix(key, oldPrefix, newPrefix));
    });
}

/** Lets the pending edit reach the disk so a folder copy never uses stale content. */
async function settlePendingDiskWrites() {
    if (autosaveTimer || activeFileDirty) {
        if (autosaveTimer) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
        }
        persist();
    }
    for (let attempt = 0; attempt < 100 && (directoryFlushQueued || directoryFlushInFlight); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return directDiskSyncAvailable;
}

async function moveFolderOnDisk(folder, target) {
    const sourceHandle = directoryHandleByFolderId.get(folder.id);
    const oldParentHandle = directoryHandleByFolderId.get(folder.parentId);
    const targetHandle = directoryHandleByFolderId.get(target.id);
    if (!sourceHandle || !oldParentHandle || !targetHandle) {
        alert('디스크 폴더 이동에 필요한 핸들을 찾지 못했습니다.');
        return false;
    }

    if (!(await settlePendingDiskWrites())) {
        alert('저장되지 않은 변경 사항을 디스크에 쓰지 못해 폴더 이동을 취소했습니다.');
        return false;
    }

    try {
        if (await directoryHasEntry(targetHandle, folder.name)) {
            alert(`이동할 위치에 같은 이름이 이미 있습니다: ${folder.name}`);
            return false;
        }
    } catch (error) {
        console.error('[qa-scenario] failed to inspect target folder', error);
        alert('이동할 폴더를 확인하지 못했습니다.');
        return false;
    }

    let copiedHandle = null;
    try {
        copiedHandle = await targetHandle.getDirectoryHandle(folder.name, { create: true });
        await copyDirectoryEntries(sourceHandle, copiedHandle);
        // Delete the original only after the copy is confirmed to match it.
        if (!(await directoriesMatch(sourceHandle, copiedHandle))) {
            throw new Error('copied folder does not match the original');
        }
        await oldParentHandle.removeEntry(folder.name, { recursive: true });
    } catch (error) {
        console.error('[qa-scenario] failed to move folder on disk', error);
        if (copiedHandle) {
            try {
                await targetHandle.removeEntry(folder.name, { recursive: true });
            } catch (rollbackError) {
                console.warn('[qa-scenario] failed to roll back copied folder', rollbackError);
            }
        }
        alert('디스크 폴더 이동에 실패했습니다. 원본 폴더는 그대로 남아 있습니다.');
        return false;
    }
    return true;
}

async function moveFolderById(id, targetFolderId) {
    if (!treeMutationsEnabled) return;
    const check = canMoveFolder(workspace, id, targetFolderId);
    if (!check.ok) {
        if (check.reason === 'name-conflict') alert('이동할 위치에 같은 이름의 폴더가 이미 있습니다.');
        return;
    }

    const folder = Workspace.getFolderById(workspace, id);
    const target = Workspace.getFolderById(workspace, targetFolderId);
    const oldPath = folder.path;
    const newPath = joinFolderPath(target.path, folder.name);

    if (isDirectoryWritableMode()) {
        if (!(await moveFolderOnDisk(folder, target))) return;

        // Folder ids are regenerated when the directory is re-read, so carry the
        // path-based state (active file, open tabs, scroll) over to the new paths.
        const uiState = workspace.uiState;
        const location = uiState.lastActiveFileLocation;
        if (location) {
            const movedPath = remapPathPrefix(location.path, oldPath, newPath);
            if (movedPath !== location.path) {
                const fileName = location.fileName || movedPath.split('/').pop();
                uiState.lastActiveFileLocation = {
                    folderPath: movedPath.includes('/') ? movedPath.slice(0, movedPath.lastIndexOf('/')) : '',
                    fileName,
                    path: movedPath
                };
            }
        }
        if (Array.isArray(uiState.openFilePaths)) {
            uiState.openFilePaths = uiState.openFilePaths.map((path) => remapPathPrefix(path, oldPath, newPath));
        }
        remapScrollKeysByPrefix(oldPath, newPath);

        try {
            await bindAndLoadFromDirectoryHandle(boundDirectoryHandle, { isRestore: true });
        } catch (error) {
            console.error('[qa-scenario] failed to reload folder after move', error);
            alert('폴더는 이동했지만 목록을 다시 읽지 못했습니다. 폴더를 다시 열어 주세요.');
            return;
        }
        const movedFolder = workspace.folders.find((item) => item.path === newPath);
        if (movedFolder) {
            workspace.uiState.selectedFolderId = movedFolder.id;
            workspace.uiState.lastSelectionType = 'folder';
            lastTreeSelectionType = 'folder';
            persist();
        }
        updateBoundFilePathInput('', 'bound');
        return;
    }

    applyFolderMove(workspace, id, targetFolderId, nowTs);
    remapScrollKeysByPrefix(oldPath, newPath);
    const expanded = new Set(workspace.uiState.expandedFolderIds || []);
    expanded.add(targetFolderId);
    expanded.add(id);
    workspace.uiState.expandedFolderIds = Array.from(expanded);
    workspace.uiState.selectedFolderId = id;
    workspace.uiState.selectedFileId = null;
    workspace.uiState.lastSelectionType = 'folder';
    lastTreeSelectionType = 'folder';
    persist();
}

async function moveFileById(id, targetFolderId) {
    if (!treeMutationsEnabled) return;

    const file = Workspace.getFileById(workspace, id);
    const targetFolder = Workspace.getFolderById(workspace, targetFolderId);
    if (!file || !targetFolder) return;
    if (file.folderId === targetFolderId) return;

    const sourceFolderId = file.folderId;
    const sourceName = file.name;
    const nextName = Workspace.getNextAvailableFileName(workspace, targetFolderId, sourceName, file.id);

    if (isDirectoryWritableMode()) {
        const sourceFolderHandle = directoryHandleByFolderId.get(sourceFolderId);
        const targetFolderHandle = directoryHandleByFolderId.get(targetFolderId);
        if (!sourceFolderHandle || !targetFolderHandle) {
            alert('디스크 파일 이동에 필요한 폴더 핸들을 찾지 못했습니다.');
            return;
        }

        let targetFileHandle = null;
        try {
            targetFileHandle = await targetFolderHandle.getFileHandle(nextName, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(file.content || '');
            await writable.close();

            await sourceFolderHandle.removeEntry(sourceName);

            const syncedFile = await targetFileHandle.getFile();
            directoryFileHandleById.set(file.id, targetFileHandle);
            directoryFileFingerprintById.set(file.id, buildFileFingerprint(syncedFile));
        } catch (error) {
            if (targetFileHandle && typeof targetFolderHandle.removeEntry === 'function') {
                try {
                    await targetFolderHandle.removeEntry(nextName);
                } catch (rollbackError) {
                    console.warn('[qa-scenario] failed to rollback moved file on disk', rollbackError);
                }
            }
            console.error('[qa-scenario] failed to move file on disk', error);
            alert('디스크 파일 이동에 실패했습니다.');
            return;
        }
    }

    const previousScrollKey = getScrollKey(file);
    file.folderId = targetFolderId;
    file.name = nextName;
    file.updatedAt = nowTs();
    remapScrollKey(previousScrollKey, getScrollKey(file));

    workspace.uiState.selectedFolderId = targetFolderId;
    workspace.uiState.selectedFileId = file.id;
    workspace.uiState.lastSelectionType = 'file';
    lastTreeSelectionType = 'file';

    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    expandedSet.add(targetFolderId);
    workspace.uiState.expandedFolderIds = Array.from(expandedSet);

    persist();
    if (workspace.uiState.activeFileId === file.id) {
        loadActiveFile();
    }
}

function createCopiedFileName(originalName) {
    const name = String(originalName || '').trim();
    if (!name) return 'untitled-copy.json';

    const dotIndex = name.lastIndexOf('.');
    if (dotIndex <= 0) {
        return `${name}-copy`;
    }

    const base = name.slice(0, dotIndex);
    const ext = name.slice(dotIndex);
    return `${base}-copy${ext}`;
}

async function duplicateFileById(id) {
    const sourceFile = Workspace.getFileById(workspace, id);
    if (!sourceFile) return;

    const duplicatedBaseName = createCopiedFileName(sourceFile.name);
    const nextName = Workspace.getNextAvailableFileName(workspace, sourceFile.folderId, duplicatedBaseName);
    const duplicatedFile = Workspace.createFileRecord(sourceFile.folderId, nextName, sourceFile.content || '');
    const directoryMode = isDirectoryWritableMode();

    workspace.files.push(duplicatedFile);
    workspace.uiState.activeFileId = duplicatedFile.id;
    workspace.uiState.selectedFolderId = sourceFile.folderId;
    workspace.uiState.selectedFileId = duplicatedFile.id;
    workspace.uiState.lastSelectionType = 'file';
    lastTreeSelectionType = 'file';

    if (!directoryMode) {
        persist();
        loadActiveFile();
        return;
    }

    pendingCopyFileIds.add(duplicatedFile.id);
    renderTree();
    loadActiveFile();

    const folderHandle = directoryHandleByFolderId.get(sourceFile.folderId);
    if (!folderHandle) {
        pendingCopyFileIds.delete(duplicatedFile.id);
        workspace.files = workspace.files.filter((file) => file.id !== duplicatedFile.id);
        if (workspace.uiState.activeFileId === duplicatedFile.id) {
            workspace.uiState.activeFileId = sourceFile.id;
        }
        if (workspace.uiState.selectedFileId === duplicatedFile.id) {
            workspace.uiState.selectedFileId = sourceFile.id;
        }
        workspace.uiState.selectedFolderId = sourceFile.folderId;
        workspace.uiState.lastSelectionType = 'file';
        lastTreeSelectionType = 'file';
        persist();
        loadActiveFile();
        alert('디스크 파일 복사에 필요한 폴더 핸들을 찾지 못했습니다.');
        return;
    }

    try {
        const fileHandle = await folderHandle.getFileHandle(nextName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(duplicatedFile.content || '');
        await writable.close();
        const diskFile = await fileHandle.getFile();
        directoryFileHandleById.set(duplicatedFile.id, fileHandle);
        directoryFileFingerprintById.set(duplicatedFile.id, buildFileFingerprint(diskFile));
        pendingCopyFileIds.delete(duplicatedFile.id);
        persist();
        loadActiveFile();
    } catch (error) {
        pendingCopyFileIds.delete(duplicatedFile.id);
        workspace.files = workspace.files.filter((file) => file.id !== duplicatedFile.id);
        directoryFileHandleById.delete(duplicatedFile.id);
        directoryFileFingerprintById.delete(duplicatedFile.id);
        if (workspace.uiState.activeFileId === duplicatedFile.id) {
            workspace.uiState.activeFileId = sourceFile.id;
        }
        if (workspace.uiState.selectedFileId === duplicatedFile.id) {
            workspace.uiState.selectedFileId = sourceFile.id;
        }
        workspace.uiState.selectedFolderId = sourceFile.folderId;
        workspace.uiState.lastSelectionType = 'file';
        lastTreeSelectionType = 'file';
        persist();
        loadActiveFile();
        console.error('[qa-scenario] failed to duplicate file on disk', error);
        alert('디스크 파일 복사에 실패했습니다.');
    }
}

async function createFolderFromUi(options = {}) {
    if (!treeMutationsEnabled) {
        alert('Folder mode is read-only in this version.');
        return;
    }

    const selectedFolderId = options.parentFolderId || workspace.uiState.selectedFolderId || getRootFolderId();
    const name = window.prompt('Folder name', 'new-folder');
    if (!name) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (isDirectoryWritableMode()) {
        const parentId = selectedFolderId;
        const parentHandle = directoryHandleByFolderId.get(parentId);
        const parentFolder = Workspace.getFolderById(workspace, parentId);
        if (!parentHandle || !parentFolder) {
            alert('디스크 폴더 생성에 필요한 부모 핸들을 찾지 못했습니다.');
            return;
        }

        const nextName = Workspace.getNextAvailableFolderName(workspace, trimmedName);
        try {
            const childHandle = await parentHandle.getDirectoryHandle(nextName, { create: true });
            const nextPath = parentFolder.path ? `${parentFolder.path}/${nextName}` : nextName;
            const folder = Workspace.createFolderRecord(nextName, parentId, nextPath);
            workspace.folders.push(folder);
            directoryHandleByFolderId.set(folder.id, childHandle);
            workspace.uiState.selectedFolderId = folder.id;
            workspace.uiState.lastSelectionType = 'folder';
            if (!workspace.uiState.expandedFolderIds.includes(parentId)) {
                workspace.uiState.expandedFolderIds.push(parentId);
            }
            persist();
            return;
        } catch (error) {
            console.error('[qa-scenario] failed to create folder on disk', error);
            alert('디스크 폴더 생성에 실패했습니다.');
            return;
        }
    }

    const parentFolder = Workspace.getFolderById(workspace, selectedFolderId);
    const nextName = Workspace.getNextAvailableFolderName(workspace, trimmedName);
    const nextPath = parentFolder?.path ? `${parentFolder.path}/${nextName}` : nextName;
    const folder = Workspace.createFolderRecord(nextName, selectedFolderId || null, nextPath);
    workspace.folders.push(folder);
    workspace.uiState.selectedFolderId = folder.id;
    workspace.uiState.lastSelectionType = 'folder';
    if (selectedFolderId && !workspace.uiState.expandedFolderIds.includes(selectedFolderId)) {
        workspace.uiState.expandedFolderIds.push(selectedFolderId);
    }
    persist();
}

async function createFileFromUi(options = {}) {
    if (!treeMutationsEnabled) {
        alert('Folder mode is read-only in this version.');
        return;
    }

    const folderId = options.folderId || workspace.uiState.selectedFolderId || getRootFolderId();
    if (!folderId) return;
    const defaultName = Workspace.getNextAvailableFileName(workspace, folderId, 'scenario.json');
    const name = window.prompt('File name', defaultName);
    const trimmedName = name ? name.trim() : '';
    if (!trimmedName) return;
    await createFileInFolder(folderId, trimmedName);
}

/** Creates a file (on disk too when a writable folder is bound) and opens it. */
async function createFileInFolder(folderId, fileName) {
    const nextName = Workspace.getNextAvailableFileName(workspace, folderId, fileName);
    const file = Workspace.createFileRecord(folderId, nextName);

    if (isDirectoryWritableMode()) {
        const folderHandle = directoryHandleByFolderId.get(folderId);
        if (!folderHandle) {
            alert('디스크 파일 생성에 필요한 폴더 핸들을 찾지 못했습니다.');
            return;
        }
        try {
            const fileHandle = await folderHandle.getFileHandle(nextName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file.content || '');
            await writable.close();
            const diskFile = await fileHandle.getFile();
            directoryFileHandleById.set(file.id, fileHandle);
            directoryFileFingerprintById.set(file.id, buildFileFingerprint(diskFile));
        } catch (error) {
            console.error('[qa-scenario] failed to create file on disk', error);
            alert('디스크 파일 생성에 실패했습니다.');
            return;
        }
    }

    workspace.files.push(file);
    workspace.uiState.activeFileId = file.id;
    workspace.uiState.selectedFolderId = folderId;
    workspace.uiState.selectedFileId = file.id;
    workspace.uiState.lastSelectionType = 'file';
    lastTreeSelectionType = 'file';
    persist();
    loadActiveFile();
}

function getPaletteBaseFolderId() {
    const selected = workspace.uiState.selectedFolderId;
    if (selected && Workspace.getFolderById(workspace, selected)) return selected;
    const activeFile = Workspace.getActiveFile(workspace);
    if (activeFile && Workspace.getFolderById(workspace, activeFile.folderId)) return activeFile.folderId;
    return getRootFolderId();
}

/** Finds a child folder by name under parentId, creating it (and on disk) if missing. */
async function ensureChildFolder(parentId, name) {
    const existing = workspace.folders.find((folder) => folder.parentId === parentId && folder.name === name);
    if (existing) return existing;

    const parentFolder = Workspace.getFolderById(workspace, parentId);
    const nextPath = parentFolder?.path ? `${parentFolder.path}/${name}` : name;
    let childHandle = null;
    if (isDirectoryWritableMode()) {
        const parentHandle = directoryHandleByFolderId.get(parentId);
        if (!parentHandle) throw new Error('missing parent directory handle');
        childHandle = await parentHandle.getDirectoryHandle(name, { create: true });
    }
    const folder = Workspace.createFolderRecord(name, parentId, nextPath);
    workspace.folders.push(folder);
    if (childHandle) directoryHandleByFolderId.set(folder.id, childHandle);
    return folder;
}

async function createEntryFromPalette({ folders, file, absolute }) {
    if (!treeMutationsEnabled) {
        alert('Folder mode is read-only in this version.');
        return;
    }
    let parentId = absolute ? getRootFolderId() : getPaletteBaseFolderId();
    if (!parentId) return;

    const expanded = new Set(workspace.uiState.expandedFolderIds);
    expanded.add(parentId);
    try {
        for (const name of folders) {
            const folder = await ensureChildFolder(parentId, name);
            parentId = folder.id;
            expanded.add(parentId);
        }
    } catch (error) {
        console.error('[qa-scenario] failed to create folder from palette', error);
        alert('폴더 생성에 실패했습니다.');
        workspace.uiState.expandedFolderIds = Array.from(expanded);
        persist();
        return;
    }
    workspace.uiState.expandedFolderIds = Array.from(expanded);

    if (file) {
        await createFileInFolder(parentId, file);
        return;
    }
    workspace.uiState.selectedFolderId = parentId;
    workspace.uiState.selectedFileId = null;
    workspace.uiState.lastSelectionType = 'folder';
    lastTreeSelectionType = 'folder';
    persist();
}

function setupCommandPalette() {
    const input = document.getElementById('command-palette-input');
    if (!input) return;
    // Catalog of palette commands: add an entry here to list a new command.
    const commands = [
        createOpenFileCommand({
            getFiles: () => {
                const openIds = new Set(syncOpenFileIds(workspace));
                return workspace.files.map((file) => ({
                    id: file.id,
                    name: file.name,
                    path: buildFileLocation(file)?.path || file.name,
                    isOpen: openIds.has(file.id),
                    isActive: file.id === workspace.uiState.activeFileId
                }));
            },
            open: (fileId) => {
                if (fileId !== workspace.uiState.activeFileId) activateFileFromTab(fileId);
            }
        }),
        createNewFileCommand({
            getBaseFolderLabel: () => Workspace.getFolderById(workspace, getPaletteBaseFolderId())?.name || '',
            getRootFolderLabel: () => Workspace.getFolderById(workspace, getRootFolderId())?.name || '',
            create: createEntryFromPalette
        }),
        {
            id: 'toggleStickyHeadings',
            label: 'Sticky 제목 토글',
            run: () => setChecklistStickyEnabled(!checklistStickyEnabled)
        },
        {
            id: 'toggleFileTree',
            label: '파일 트리 토글',
            shortcutId: 'toggleFileTree',
            run: () => togglePanelVisibility('fileTree')
        }
    ];
    commandPalette = createCommandPalette({
        root: document.getElementById('command-palette'),
        backdrop: document.getElementById('command-palette-backdrop'),
        input,
        list: document.getElementById('command-palette-list'),
        preview: document.getElementById('command-palette-preview'),
        commands
    });
    commandPalette.setup();
    document.addEventListener('keydown', (event) => {
        if (matchShortcut(event, 'commandPalette')) {
            event.preventDefault();
            commandPalette.open();
        } else if (matchShortcut(event, 'newFile')) {
            event.preventDefault();
            commandPalette.open({ commandId: 'newFile' });
        } else if (matchShortcut(event, 'openFile')) {
            event.preventDefault();
            commandPalette.open({ commandId: 'openFile' });
        } else if (matchShortcut(event, 'toggleFileTree')) {
            event.preventDefault();
            togglePanelVisibility('fileTree');
        }
    });
}

function setupExportMenu() {
    exportMenuManager.setup();
}

function closeExportMenu() {
    if (!exportMenuManager) return;
    exportMenuManager.closeMenu();
}

function syncExportOptionUiFromWorkspace() {
    if (!exportMenuManager) return;
    exportMenuManager.syncUiFromWorkspace();
}

function getExportPreferences() {
    return exportMenuManager.getExportPreferences();
}

function normalizeExportMode(value) {
    return exportMenuManager.normalizeExportMode(value);
}

function canonicalizeExportFieldPath(value) {
    return exportMenuManager.canonicalizeFieldPath(value);
}

function handleExportClick() {
    const preferences = getExportPreferences();
    const payload = buildExportPayload({
        workspace,
        preferences,
        exportFormat: EXPORT_FORMAT,
        workspaceVersion: WORKSPACE_VERSION,
        requiredExportFields: REQUIRED_EXPORT_FIELDS,
        exportModeCustom: EXPORT_MODE_CUSTOM,
        nowIso,
        parseJson: tryParseJson,
        canonicalizeFieldPath: canonicalizeExportFieldPath
    });
    downloadExportPayload(payload);
}

function downloadExportPayload(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-scenarios-${formatExportFilenameDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderChecklist() {
    refreshChecklistSearch({ renderTable: false });
    const insertChecklistEntry = (insertIndex, entry) => {
        if (!currentData || !Array.isArray(currentData.steps)) return;
        const safeInsertIndex = Math.max(0, Math.min(Number(insertIndex) || 0, currentData.steps.length));
        currentData.steps.splice(safeInsertIndex, 0, entry);
        syncToEditor();
        renderChecklist();
    };

    // Rebuilding the table empties it for a moment, which lets the browser
    // clamp the pane's scroll to the top. Keep the reader where they were, so
    // adding a row or recoloring a divider at the bottom does not jump.
    // Another file starts from its own top instead.
    const renderedFileId = Workspace.getActiveFile(workspace)?.id ?? null;
    const checklistScroller = renderedFileId !== null && renderedFileId === lastRenderedChecklistFileId
        ? EL.checklistBody?.closest('.checklist-container')
        : null;
    const scrollTop = checklistScroller?.scrollTop ?? 0;
    const scrollLeft = checklistScroller?.scrollLeft ?? 0;
    lastRenderedChecklistFileId = renderedFileId;

    const refreshPeer = (pinnedOnly) => {
        const scroller = getChecklistScroller();
        const top = scroller?.scrollTop || 0;
        renderRows(pinnedOnly ? EL.checklistBody : EL.checklistPinnedBody, !pinnedOnly);
        if (scroller) scroller.scrollTop = top;
        scheduleStickyHeadingUpdate();
    };
    const renderRows = (container, pinnedOnly) => {
        UI.renderChecklist(container, currentData, {
            pinnedOnly,
            onUpdatePass: (idx, val) => {
                currentData.steps[idx].pass = val;
                syncToEditor();
                refreshPeer(pinnedOnly);
            },
            onUpdateStep: (idx, field, val) => {
                if (field === 'divider') {
                    currentData.steps[idx].divider = val;
                    syncToEditor();
                    refreshPeer(pinnedOnly);
                    return;
                }
                if (field === 'note') {
                    // An empty note leaves no key behind in the JSON.
                    const lines = toStepLines(val);
                    if (lines.length) currentData.steps[idx].note = lines;
                    else delete currentData.steps[idx].note;
                    scheduleNoteImageStatusRefresh();
                } else if (isStepArrayField(field)) {
                    currentData.steps[idx][field] = toStepLines(val);
                } else {
                    currentData.steps[idx][field] = val;
                }
                syncToEditor();
                refreshPeer(pinnedOnly);
            },
            onHighlightStep: (idx) => {
                const bounds = Editor.findStepBounds(EL.editing.value, idx);
                if (!bounds) return clearStepHighlight();
                renderStepHighlight(bounds);
                scrollToLine(bounds.start);
            },
            onScenarioTitleUpdate: (title, isPrimary) => {
                EL.scenarioTitle.textContent = title;
                EL.scenarioTitle.title = title;
                EL.scenarioTitle.classList.toggle('is-primary', isPrimary);
            },
            onAddStep: pinnedOnly ? undefined : (insertIndex) => {
                insertChecklistEntry(insertIndex, JSON.parse('{"given":[],"when":[],"then":[],"pass":false}'));
            },
            onAddDivider: pinnedOnly ? undefined : (insertIndex) => {
                insertChecklistEntry(insertIndex, { divider: true });
            },
            onOpenChecklistContextMenu: openChecklistContextMenu,
            onNoteCellMount: noteCells?.mountCell,
            onSelectRow: handleChecklistRowClick,
            selectedStepIndexes: getSelectedStepIndexes(),
            activeFilter: checklistFilter,
            searchResults: checklistSearchResults,
            activeSearchResult: checklistSearchResults[checklistSearchResultIndex] || null
        });
        if (pinnedOnly) observePinnedChecklistRows();
    };
    renderRows(EL.checklistPinnedBody, true);
    renderRows(EL.checklistBody, false);
    updateStickyHeadings();
    if (checklistScroller) {
        checklistScroller.scrollTop = scrollTop;
        checklistScroller.scrollLeft = scrollLeft;
    }
    refreshPassSummary();
    clearHighlightIfNoSelection();
    scheduleStickyHeadingUpdate();
}

/**
 * Note images live in `assets/` of the opened folder. The store reads the
 * folder state on every call, so opening, closing, or granting access to a
 * folder needs no re-wiring here.
 */
let noteAssets = null;
let noteCells = null;
let noteImageManager = null;
let statusMessageTimer = null;
let noteImageStatusTimer = null;

function showStatusMessage(message, kind = 'info') {
    const el = document.getElementById('statusbar-message');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', kind === 'error');
    if (statusMessageTimer) clearTimeout(statusMessageTimer);
    statusMessageTimer = setTimeout(() => { el.textContent = ''; }, kind === 'error' ? 8000 : 4000);
}

/** Which loaded scenarios use each image: Map<image name, scenario names[]>. */
function collectNoteImageReferences() {
    const references = new Map();
    const activeFile = Workspace.getActiveFile(workspace);
    (workspace?.files || []).forEach((file) => {
        // The editor holds the newest text of the file being edited.
        const content = file === activeFile ? EL.editing.value : file.content;
        collectNoteAssetNames(content).forEach((name) => {
            if (!references.has(name)) references.set(name, []);
            references.get(name).push(file.name);
        });
    });
    return references;
}

function scheduleNoteImageStatusRefresh() {
    if (!noteImageManager) return;
    if (noteImageStatusTimer) clearTimeout(noteImageStatusTimer);
    noteImageStatusTimer = setTimeout(() => { void noteImageManager.refresh(); }, 400);
}

function setupNoteImages() {
    noteAssets = createNoteAssetStore({
        getRoot: () => (boundDirectoryHandle
            ? { handle: boundDirectoryHandle, writable: boundDirectoryWriteEnabled }
            : null)
    });
    noteCells = createNoteCellController({ assets: noteAssets, notify: showStatusMessage });
    noteCells.setupTable(document.getElementById('checklist-table'));
    UI.setupChecklistCellFocus(document.getElementById('checklist-table'));
    UI.setupChecklistCellNavigation(document.getElementById('checklist-table'));
    noteImageManager = createNoteImageManager({
        assets: noteAssets,
        getReferences: collectNoteImageReferences,
        openLightbox: noteCells.openLightbox,
        notify: showStatusMessage,
        statusButton: document.getElementById('statusbar-images'),
        statusLabel: document.getElementById('statusbar-images-label')
    });
    void noteImageManager.refresh();
}

// ---------- row selection and row references ----------

/**
 * Selected rows are remembered as the step objects themselves, not as
 * positions: inserting or deleting a row moves positions, and a scenario
 * re-read from the JSON editor makes new objects, which empties the selection
 * instead of leaving it pointing at the wrong rows.
 */
const selectedSteps = new Set();
let selectionAnchorStep = null;

function getSelectedStepIndexes() {
    const indexes = new Set();
    (currentData?.steps || []).forEach((step, index) => {
        if (selectedSteps.has(step)) indexes.add(index);
    });
    return indexes;
}

function setChecklistRowSelection(indexes, anchorIndex = null) {
    const steps = currentData?.steps || [];
    selectedSteps.clear();
    [...indexes].forEach((index) => { if (steps[index]) selectedSteps.add(steps[index]); });
    selectionAnchorStep = anchorIndex === null ? null : steps[anchorIndex] || null;
    const selected = getSelectedStepIndexes();
    [EL.checklistPinnedBody, EL.checklistBody].forEach((body) => {
        body?.querySelectorAll('tr[data-step-index]').forEach((row) => {
            row.classList.toggle('selected-row', selected.has(Number(row.dataset.stepIndex)));
        });
    });
}

function handleChecklistRowClick(index, event) {
    const steps = currentData?.steps || [];
    const order = [...(EL.checklistBody?.querySelectorAll('tr[data-step-index]') || [])]
        .map(row => Number(row.dataset.stepIndex));
    const anchorIndex = steps.indexOf(selectionAnchorStep);
    const next = nextRowSelection(
        { selected: getSelectedStepIndexes(), anchor: anchorIndex < 0 ? null : anchorIndex },
        index,
        { toggle: event?.metaKey === true || event?.ctrlKey === true, range: event?.shiftKey === true },
        order
    );
    setChecklistRowSelection(next.selected, next.anchor);
    // Picking rows ends the editing of a cell elsewhere, so that copy means
    // the rows and not that cell's (empty) text selection.
    if ((event?.metaKey || event?.ctrlKey || event?.shiftKey) && document.activeElement?.classList?.contains('cell-content')) {
        document.activeElement.blur();
    }

    // The JSON editor marks the row that was clicked while it is selected.
    const bounds = next.selected.has(index) ? Editor.findStepBounds(EL.editing.value, index) : null;
    if (!bounds) {
        clearStepHighlight();
        return;
    }
    renderStepHighlight(bounds);
    scrollToLine(bounds.start);
}

/** The real path of the opened folder, which a browser never reveals. */
function readRootPaths() {
    try {
        const stored = JSON.parse(localStorage.getItem(ROOT_PATHS_STORAGE_KEY) || '{}');
        return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (_) {
        return {};
    }
}

function getRootPath() {
    const rootName = boundDirectoryHandle?.name || '';
    const path = rootName ? readRootPaths()[rootName] : '';
    return typeof path === 'string' ? path : '';
}

function updateRootPathStatus() {
    const button = document.getElementById('statusbar-root');
    if (!button) return;
    const rootName = boundDirectoryHandle?.name || '';
    button.hidden = !rootName;
    if (!rootName) return;
    const path = getRootPath();
    document.getElementById('statusbar-root-label').textContent = path || `${rootName} · 경로 미설정`;
    button.title = path
        ? '행 참조에 쓰는 폴더의 실제 경로입니다. 클릭해서 바꿉니다.'
        : '폴더의 실제 경로를 적어 두면 행 참조의 file이 절대 경로가 됩니다. 클릭해서 설정합니다.';
}

function editRootPath() {
    const rootName = boundDirectoryHandle?.name || '';
    if (!rootName) return;
    const answer = prompt(
        `"${rootName}" 폴더의 실제 경로를 입력하세요.\n예: /Users/me/work/${rootName}\n비우면 설정을 지웁니다.`,
        getRootPath()
    );
    if (answer === null) return;
    const paths = readRootPaths();
    const path = answer.trim().replace(/\/+$/, '');
    if (path) paths[rootName] = path;
    else delete paths[rootName];
    try {
        localStorage.setItem(ROOT_PATHS_STORAGE_KEY, JSON.stringify(paths));
    } catch (_) { /* storage unavailable */ }
    updateRootPathStatus();
}

/** The selected rows as a reference (see modules/row-reference.js), or null. */
function buildSelectedRowReference() {
    if (!currentData || !Array.isArray(currentData.steps)) return null;
    const indexes = expandRowSelection(currentData.steps, getSelectedStepIndexes());
    if (indexes.length === 0) return null;
    // An id written now is what finds the row again after the file changes.
    if (ensureRowIds(currentData.steps, indexes)) syncToEditor();
    const activeFile = Workspace.getActiveFile(workspace);
    return buildRowReference({
        data: currentData,
        indexes,
        file: buildReferenceFilePath({
            rootPath: getRootPath(),
            rootName: boundDirectoryHandle?.name || '',
            path: buildFileLocation(activeFile)?.path || activeFile?.name || ''
        })
    });
}

async function copySelectedRowReference() {
    const reference = buildSelectedRowReference();
    if (!reference) {
        showStatusMessage('복사할 행이 없습니다. 행을 먼저 선택하세요.', 'error');
        return;
    }
    try {
        await navigator.clipboard.writeText(JSON.stringify(reference, null, 2));
        showStatusMessage(`${reference.rows.length}개 행의 참조를 복사했습니다.`);
    } catch (error) {
        console.error('[qa-scenario] failed to copy row reference', error);
        showStatusMessage('클립보드에 복사하지 못했습니다.', 'error');
    }
}

function setupChecklistRowSelection() {
    const table = document.getElementById('checklist-table');
    // A click with a modifier selects rows; it must not also move the caret
    // into a cell or start a text selection across rows. Inside the cell
    // being edited the modifiers keep their text meaning.
    table?.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || !(event.metaKey || event.ctrlKey || event.shiftKey)) return;
        if (!event.target.closest?.('tr[data-step-index]')) return;
        const cell = event.target.closest('.cell-content');
        if (cell ? cell === document.activeElement : event.target.closest('.cm-editor, input, select, button, textarea, label')) return;
        event.preventDefault();
    });

    // Copy with rows selected and no text in hand copies the rows.
    document.addEventListener('copy', (event) => {
        if (selectedSteps.size === 0 || isTextEditingElement(document.activeElement)) return;
        if (!document.getSelection()?.isCollapsed) return;
        if (!checklistSearchScopeActive && !EL.checklistPane?.contains(document.activeElement)) return;
        const reference = buildSelectedRowReference();
        if (!reference) return;
        event.clipboardData.setData('text/plain', JSON.stringify(reference, null, 2));
        event.preventDefault();
        showStatusMessage(`${reference.rows.length}개 행의 참조를 복사했습니다.`);
    });

    document.getElementById('statusbar-root')?.addEventListener('click', editRootPath);
    document.getElementById('checklist-context-copy-reference')?.addEventListener('click', () => {
        closeChecklistContextMenu();
        void copySelectedRowReference();
    });
}

function isStepArrayField(field) {
    return field === 'given' || field === 'when' || field === 'then';
}

function setChecklistDensity(showRef, options = {}) {
    const { persist = true } = options;
    checklistShowNote = showRef === true;

    if (EL.checklistView) {
        EL.checklistView.classList.toggle('is-note-visible', checklistShowNote);
    }
    if (EL.checklistDensityToggle) {
        EL.checklistDensityToggle.setAttribute('aria-pressed', checklistShowNote ? 'true' : 'false');
        EL.checklistDensityToggle.classList.toggle('is-active', checklistShowNote);
        const label = checklistShowNote ? 'Hide note column' : 'Show note column';
        EL.checklistDensityToggle.title = label;
        EL.checklistDensityToggle.setAttribute('aria-label', label);
    }
    if (persist) {
        try {
            localStorage.setItem(CHECKLIST_DENSITY_STORAGE_KEY, checklistShowNote ? 'trace' : 'check');
        } catch (_) { /* storage unavailable */ }
    }
}

function applyChecklistFilterToControl() {
    const items = EL.checklistFilterMenu?.querySelectorAll('[data-filter]');
    const selected = [...(items || [])].find(item => item.dataset.filter === checklistFilter);

    if (EL.checklistFilterLabel && selected) {
        EL.checklistFilterLabel.textContent = selected.textContent.trim();
    }

    items?.forEach((item) => {
        const isSelected = item.dataset.filter === checklistFilter;
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    if (!EL.checklistFilterToggle) return;
    // The trigger takes the tone of the selection, so the colour is visible
    // without opening the list.
    UI.NOTE_ALERT_FILTERS.forEach((tone) => {
        EL.checklistFilterToggle.classList.toggle(`is-tone-${tone}`, checklistFilter === tone);
    });
    EL.checklistFilterToggle.classList.toggle('is-filtered', checklistFilter !== 'all');
}

function openChecklistFilterMenu() {
    if (!EL.checklistFilterMenu) return;
    applyChecklistFilterToControl();
    EL.checklistFilterMenu.hidden = false;
    EL.checklistFilterToggle?.setAttribute('aria-expanded', 'true');
    const selected = EL.checklistFilterMenu.querySelector('.is-selected');
    (selected || EL.checklistFilterMenu.querySelector('[data-filter]'))?.focus();
}

function closeChecklistFilterMenu(options = {}) {
    const { restoreFocus = false } = options;
    if (!EL.checklistFilterMenu || EL.checklistFilterMenu.hidden) return;
    EL.checklistFilterMenu.hidden = true;
    EL.checklistFilterToggle?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) EL.checklistFilterToggle?.focus();
}

function setChecklistFilter(filter, options = {}) {
    const { persist = true } = options;
    checklistFilter = UI.normalizeChecklistFilter(filter);
    applyChecklistFilterToControl();

    if (persist) {
        try {
            localStorage.setItem(CHECKLIST_FILTER_STORAGE_KEY, checklistFilter);
        } catch (_) { /* storage unavailable */ }
    }
    renderChecklist();
}

function moveChecklistFilterFocus(current, offset) {
    const items = [...(EL.checklistFilterMenu?.querySelectorAll('[data-filter]') || [])];
    if (items.length === 0) return;
    const index = items.indexOf(current);
    const next = index === -1 ? 0 : (index + offset + items.length) % items.length;
    items[next].focus();
}

function setupChecklistFilter() {
    let stored = null;
    try {
        stored = localStorage.getItem(CHECKLIST_FILTER_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }

    checklistFilter = UI.normalizeChecklistFilter(stored);
    applyChecklistFilterToControl();

    EL.checklistFilterToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (EL.checklistFilterMenu?.hidden) openChecklistFilterMenu();
        else closeChecklistFilterMenu();
    });

    EL.checklistFilterMenu?.querySelectorAll('[data-filter]').forEach((item) => {
        item.addEventListener('click', () => {
            setChecklistFilter(item.dataset.filter);
            closeChecklistFilterMenu({ restoreFocus: true });
        });
        item.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveChecklistFilterFocus(item, 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveChecklistFilterFocus(item, -1);
            }
        });
    });

    document.addEventListener('click', (event) => {
        if (EL.checklistFilterMenu?.hidden) return;
        if (EL.checklistFilterMenu.contains(event.target)) return;
        if (EL.checklistFilterToggle?.contains(event.target)) return;
        closeChecklistFilterMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (EL.checklistFilterMenu?.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        closeChecklistFilterMenu({ restoreFocus: true });
    });
}

/**
 * Pinned rows stack below the header; section titles share the slot below them.
 * CSS keeps each row sticky while layout supplies offsets and the same 1px overlap
 * at every boundary, including after editor height changes.
 */
function setChecklistStickyEnabled(enabled, { persist = true } = {}) {
    checklistStickyEnabled = enabled === true;
    getChecklistScroller()?.classList.toggle('is-sticky-headings', checklistStickyEnabled);
    if (EL.checklistStickyToggle) {
        EL.checklistStickyToggle.setAttribute('aria-pressed', String(checklistStickyEnabled));
        EL.checklistStickyToggle.classList.toggle('is-active', checklistStickyEnabled);
    }
    if (persist) {
        try {
            localStorage.setItem(CHECKLIST_STICKY_STORAGE_KEY, checklistStickyEnabled ? 'on' : 'off');
        } catch (_) { /* storage unavailable */ }
    }
    scheduleStickyHeadingUpdate();
}

function scheduleStickyHeadingUpdate() {
    if (stickyUpdateFrame) return;
    stickyUpdateFrame = requestAnimationFrame(() => {
        stickyUpdateFrame = 0;
        updateStickyHeadings();
    });
}

function updateStickyHeadings() {
    const scroller = getChecklistScroller();
    if (!scroller) return;
    // At the very top nothing has scrolled under the header yet, so the first insert
    // zone may draw above it (CSS); once scrolled, the header covers it again.
    scroller.classList.toggle('is-at-top', scroller.scrollTop <= 0);
    const headCell = scroller.querySelector('thead th');
    const pinnedHeight = layoutChecklistStickyRows(scroller);
    const rows = scroller.querySelectorAll('tr.is-sticky-heading');
    let lastStuck = null;
    if (checklistStickyEnabled && headCell) {
        const headBottom = headCell.getBoundingClientRect().bottom + pinnedHeight;
        rows.forEach((row) => {
            if (row.getBoundingClientRect().top <= headBottom + 0.5) lastStuck = row;
        });
    }
    rows.forEach((row) => row.classList.toggle('is-stuck', row === lastStuck));
}

function layoutChecklistStickyRows(scroller) {
    const headHeight = scroller.querySelector('thead')?.getBoundingClientRect().height || 0;
    const pinnedRows = [...(EL.checklistPinnedBody?.querySelectorAll('tr.is-pinned-row') || [])];
    const heights = pinnedRows.map(row => row.getBoundingClientRect().height);
    let edge = headHeight;
    pinnedRows.forEach((row, index) => {
        const top = edge - 1;
        row.style.setProperty('--checklist-sticky-top', `${top}px`);
        edge = top + heights[index];
    });
    // Section headings share the final slot; each pinned row has its own slot.
    scroller.style.setProperty('--checklist-sticky-top', `${edge - 1}px`);
    return edge - headHeight;
}

/** Scrolls the original row just below the occupied sticky stack. */
function scrollStickyHeadingToOrigin(row) {
    const scroller = getChecklistScroller();
    const headCell = scroller?.querySelector('thead th');
    if (!scroller || !headCell) return;
    const index = row.dataset.stepIndex;
    let origin = EL.checklistBody.querySelector(`tr[data-step-index="${index}"]`);
    if (!origin) {
        setChecklistFilter('all');
        origin = EL.checklistBody.querySelector(`tr[data-step-index="${index}"]`);
    }
    if (!origin) return;
    const pinnedHeight = layoutChecklistStickyRows(scroller);
    // Temporarily release sticky positioning to measure the actual document position.
    const position = origin.style.position;
    origin.style.position = 'static';
    const naturalTop = origin.getBoundingClientRect().top;
    origin.style.position = position;
    scroller.scrollTop += naturalTop - headCell.getBoundingClientRect().bottom - pinnedHeight;
}

function setupChecklistStickyHeadings() {
    let stored = null;
    try {
        stored = localStorage.getItem(CHECKLIST_STICKY_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }
    setChecklistStickyEnabled(stored !== 'off', { persist: false });

    EL.checklistStickyToggle?.addEventListener('click', () => setChecklistStickyEnabled(!checklistStickyEnabled));

    const scroller = getChecklistScroller();
    if (!scroller) return;
    scroller.addEventListener('scroll', scheduleStickyHeadingUpdate, { passive: true });
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(scheduleStickyHeadingUpdate);
        observer.observe(scroller);
        if (EL.checklistPinnedBody) observer.observe(EL.checklistPinnedBody);
        const head = scroller.querySelector('thead');
        if (head) observer.observe(head);
    }
    scroller.addEventListener('click', (event) => {
        const button = event.target.closest?.('.checklist-sticky-jump');
        if (!button) return;
        event.stopPropagation();
        const row = button.closest('tr.is-sticky-heading, tr.is-pinned-row');
        if (row) scrollStickyHeadingToOrigin(row);
    }, true);
}

function observePinnedChecklistRows() {
    if (typeof ResizeObserver !== 'function') return;
    pinnedRowsResizeObserver ??= new ResizeObserver(scheduleStickyHeadingUpdate);
    pinnedRowsResizeObserver.disconnect();
    EL.checklistPinnedBody?.querySelectorAll('tr.is-pinned-row').forEach(row => {
        pinnedRowsResizeObserver.observe(row);
    });
}

function setupChecklistDensityToggle() {
    let stored = null;
    try {
        stored = localStorage.getItem(CHECKLIST_DENSITY_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }

    setChecklistDensity(stored === 'trace', { persist: false });

    if (EL.checklistDensityToggle) {
        EL.checklistDensityToggle.addEventListener('click', () => {
            setChecklistDensity(!checklistShowNote);
        });
    }
}

function isChecklistSearchOpen() {
    return Boolean(EL.checklistSearchPanel && !EL.checklistSearchPanel.hidden);
}

function openChecklistSearch(options = {}) {
    if (!EL.checklistSearchPanel) return;
    EL.checklistSearchPanel.hidden = false;
    EL.checklistSearchToggle?.classList.add('is-active');
    EL.checklistSearchToggle?.setAttribute('aria-expanded', 'true');
    if (options.replace === true) setChecklistReplaceOpen(true);
    refreshChecklistSearch({ renderTable: true });
    EL.checklistSearchInput?.focus();
    EL.checklistSearchInput?.select();
}

function setChecklistReplaceOpen(open) {
    if (!EL.checklistReplaceRow) return;
    EL.checklistReplaceRow.hidden = !open;
    EL.checklistReplaceToggle?.classList.toggle('is-active', open);
    EL.checklistReplaceToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateChecklistReplaceControls();
}

/** The cell of the current search result, as a replace target. */
function getChecklistReplaceTarget() {
    const result = checklistSearchResults[checklistSearchResultIndex];
    return result ? { stepIndex: result.stepIndex, field: result.field } : null;
}

/**
 * Replace takes the query as one phrase, while search matches its keywords
 * in any order, so the counts here can be lower than the result count.
 */
function updateChecklistReplaceControls() {
    if (!EL.checklistReplaceRow || EL.checklistReplaceRow.hidden) return;
    const query = EL.checklistSearchInput?.value || '';
    const target = getChecklistReplaceTarget();
    const total = countChecklistReplacements(currentData, query);
    const inCell = target ? countChecklistReplacements(currentData, query, target) : 0;
    if (EL.checklistReplaceCount) {
        EL.checklistReplaceCount.textContent = query.trim() ? `바꿀 곳 ${total}` : '';
    }
    if (EL.checklistReplaceOne) EL.checklistReplaceOne.disabled = inCell === 0;
    if (EL.checklistReplaceAll) EL.checklistReplaceAll.disabled = total === 0;
}

function runChecklistReplace(scope) {
    if (!currentData) return;
    const query = EL.checklistSearchInput?.value || '';
    const replacement = EL.checklistReplaceInput?.value ?? '';
    const target = scope === 'cell' ? getChecklistReplaceTarget() : null;
    if (scope === 'cell' && !target) return;
    const count = countChecklistReplacements(currentData, query, target);
    if (count === 0) return;
    // Table edits have no undo of their own, so the wide change asks first.
    if (scope === 'all' && !confirm(`"${query.trim()}" ${count}곳을 "${replacement}"(으)로 바꿀까요?\n되돌리기가 없으니 필요하면 먼저 저장해 두세요.`)) return;

    replaceInChecklist(currentData, query, replacement, target);
    syncToEditor();
    scheduleNoteImageStatusRefresh();
    // The replaced cell usually drops out of the results, so the same index
    // now points at the next one.
    refreshChecklistSearch({ renderTable: true });
    showStatusMessage(`${count}곳을 바꿨습니다.`);
}

function closeChecklistSearch() {
    if (!EL.checklistSearchPanel) return;
    EL.checklistSearchPanel.hidden = true;
    EL.checklistSearchToggle?.classList.remove('is-active');
    EL.checklistSearchToggle?.setAttribute('aria-expanded', 'false');
    setChecklistReplaceOpen(false);
    if (EL.checklistSearchInput) EL.checklistSearchInput.value = '';
    checklistSearchResults = [];
    checklistSearchResultIndex = -1;
    renderChecklistSearchResults();
    renderChecklist();
    EL.checklistSearchToggle?.focus();
}

function appendHighlightedSearchText(container, value, tokens) {
    const text = String(value || '');
    if (!text || tokens.length === 0) {
        container.textContent = text;
        return;
    }
    const escaped = tokens
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
        container.append(document.createTextNode(text.slice(cursor, match.index)));
        const mark = document.createElement('mark');
        mark.textContent = match[0];
        container.append(mark);
        cursor = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(cursor)));
}

function renderChecklistSearchResults() {
    if (!EL.checklistSearchResults) return;
    EL.checklistSearchResults.innerHTML = '';
    const tokens = tokenizeChecklistSearchQuery(EL.checklistSearchInput?.value || '');
    const total = checklistSearchResults.length;
    if (EL.checklistSearchCount) {
        EL.checklistSearchCount.textContent = total
            ? `${Math.max(1, checklistSearchResultIndex + 1)} / ${total}`
            : '0 results';
    }
    if (EL.checklistSearchPrev) EL.checklistSearchPrev.disabled = total === 0;
    if (EL.checklistSearchNext) EL.checklistSearchNext.disabled = total === 0;
    updateChecklistReplaceControls();
    if (tokens.length > 0 && total === 0) {
        const empty = document.createElement('p');
        empty.className = 'checklist-search-empty';
        empty.textContent = 'No matches in this scenario.';
        EL.checklistSearchResults.append(empty);
    }

    checklistSearchResults.forEach((result, resultIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'checklist-search-result';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(resultIndex === checklistSearchResultIndex));
        if (resultIndex === checklistSearchResultIndex) button.classList.add('is-current');

        const location = document.createElement('span');
        location.className = 'checklist-search-result__location';
        const stepLabel = result.visibleStepNumber == null ? 'Section' : `Step ${result.visibleStepNumber}`;
        location.textContent = `${stepLabel} · ${result.fieldLabel}`;

        const snippet = document.createElement('span');
        snippet.className = 'checklist-search-result__snippet';
        appendHighlightedSearchText(snippet, result.snippet, tokens);
        button.append(location, snippet);
        button.addEventListener('click', () => navigateChecklistSearchResult(resultIndex));
        EL.checklistSearchResults.append(button);
    });
}

function refreshChecklistSearch(options = {}) {
    const { renderTable = false } = options;
    const previous = checklistSearchResults[checklistSearchResultIndex];
    const query = isChecklistSearchOpen() ? EL.checklistSearchInput?.value || '' : '';
    checklistSearchResults = searchChecklist(currentData, query);
    if (checklistSearchResults.length === 0) {
        checklistSearchResultIndex = -1;
    } else if (previous) {
        const preserved = checklistSearchResults.findIndex(result => (
            result.stepIndex === previous.stepIndex
            && result.field === previous.field
        ));
        checklistSearchResultIndex = preserved >= 0
            ? preserved : Math.min(checklistSearchResultIndex, checklistSearchResults.length - 1);
    } else {
        checklistSearchResultIndex = 0;
    }
    renderChecklistSearchResults();
    if (renderTable) renderChecklist();
}

function navigateChecklistSearchResult(index) {
    if (checklistSearchResults.length === 0) return;
    checklistSearchResultIndex = (index + checklistSearchResults.length) % checklistSearchResults.length;
    const result = checklistSearchResults[checklistSearchResultIndex];

    if (!UI.buildChecklistVisibility(currentData?.steps, checklistFilter, currentData)[result.stepIndex]) {
        checklistFilter = 'all';
        applyChecklistFilterToControl();
        try {
            localStorage.setItem(CHECKLIST_FILTER_STORAGE_KEY, checklistFilter);
        } catch (_) { /* storage unavailable */ }
    }

    // A match in the note column is only visible with that column shown.
    if (result.field === 'note' && !checklistShowNote) setChecklistDensity(true);
    renderChecklist();

    requestAnimationFrame(() => {
        renderChecklistSearchResults();
        EL.checklistSearchResults?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
        const row = EL.checklistBody?.querySelector(`[data-step-index="${result.stepIndex}"]`);
        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setChecklistRowSelection([result.stepIndex], result.stepIndex);
        const bounds = Editor.findStepBounds(EL.editing.value, result.stepIndex);
        if (bounds) renderStepHighlight(bounds);
    });
}

/**
 * Switch open-file tabs: Cmd+Shift+[ / ] (macOS tab convention) or
 * Cmd+Option+Left/Right as a fallback in case the browser swallows the first.
 * event.code is used because Shift turns "[" into "{" in event.key.
 */
function setupOpenFileTabShortcuts() {
    document.addEventListener('keydown', (event) => {
        let step = 0;
        if (matchShortcut(event, 'tabPrevious')) step = -1;
        else if (matchShortcut(event, 'tabNext')) step = 1;
        if (!step) return;
        const ids = syncOpenFileIds(workspace);
        if (ids.length < 2) return;
        event.preventDefault();
        const index = ids.indexOf(workspace.uiState.activeFileId);
        const next = ids[(index + step + ids.length) % ids.length];
        activateFileFromTab(next);
    });
}

/**
 * Cmd/Ctrl+S in the Table Editor saves right away.
 * Every cell edit is already synced to the JSON, so saving only has to skip
 * the autosave delay. The JSON editor handles its own Cmd+S (format + save)
 * and calls preventDefault, which is why that case is skipped here.
 */
function setupTableEditorSaveShortcut() {
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || !matchShortcut(event, 'save')) return;
        const inTableEditor = EL.checklistPane?.contains(event.target)
            || checklistSearchScopeActive;
        if (!inTableEditor) return;
        // Always block the browser "Save page" dialog inside the Table Editor.
        event.preventDefault();
        if (!Workspace.getActiveFile(workspace)) return;
        flushAutosaveAndPersist();
    });
}

function setupChecklistSearch() {
    EL.checklistPane?.addEventListener('pointerdown', () => {
        checklistSearchScopeActive = true;
    });
    EL.editing?.addEventListener('pointerdown', () => {
        checklistSearchScopeActive = false;
    });
    EL.editing?.addEventListener('focus', () => {
        checklistSearchScopeActive = false;
    });
    EL.checklistSearchToggle?.addEventListener('click', () => {
        if (isChecklistSearchOpen()) closeChecklistSearch();
        else openChecklistSearch();
    });
    EL.checklistSearchInput?.addEventListener('input', () => {
        checklistSearchResultIndex = -1;
        refreshChecklistSearch({ renderTable: true });
    });
    EL.checklistSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeChecklistSearch();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            navigateChecklistSearchResult(checklistSearchResultIndex + (event.shiftKey ? -1 : 1));
        }
    });
    EL.checklistSearchPrev?.addEventListener('click', () => navigateChecklistSearchResult(checklistSearchResultIndex - 1));
    EL.checklistSearchNext?.addEventListener('click', () => navigateChecklistSearchResult(checklistSearchResultIndex + 1));
    EL.checklistSearchClose?.addEventListener('click', closeChecklistSearch);
    EL.checklistReplaceToggle?.addEventListener('click', () => {
        const open = EL.checklistReplaceRow?.hidden === true;
        setChecklistReplaceOpen(open);
        if (open) EL.checklistReplaceInput?.focus();
    });
    EL.checklistReplaceInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeChecklistSearch();
        } else if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            runChecklistReplace('cell');
        }
    });
    EL.checklistReplaceOne?.addEventListener('click', () => runChecklistReplace('cell'));
    EL.checklistReplaceAll?.addEventListener('click', () => runChecklistReplace('all'));
    document.addEventListener('keydown', (event) => {
        const replace = matchShortcut(event, 'replaceOpen');
        if (!replace && !matchShortcut(event, 'findOpen')) return;
        // A code divider's CodeMirror already opened its own search panel.
        if (event.defaultPrevented) return;
        if (!checklistSearchScopeActive && !EL.checklistPane?.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        openChecklistSearch({ replace });
    });
}

function clearHighlightIfNoSelection() {
    if (!EL.checklistBody) return;
    const hasSelection = Boolean(EL.checklistBody.querySelector('.selected-row'));
    if (!hasSelection) clearStepHighlight();
}

function toggleAllPass() {
    if (!hasSteps(currentData)) return;
    const nextValue = !areAllStepsPassed(currentData.steps);
    currentData.steps.forEach(step => {
        if (UI.isChecklistDividerStep(step)) return;
        step.pass = nextValue;
    });
    syncToEditor();
    renderChecklist();
}

function syncToEditor() {
    EL.editing.value = JSON.stringify(currentData, null, 2);
    renderEditorFromCurrentData();
    const activeFile = Workspace.getActiveFile(workspace);
    if (activeFile) {
        activeFile.content = EL.editing.value;
        activeFile.updatedAt = nowTs();
        activeFileDirty = true;
        updateSaveIndicator('dirty');
        scheduleSave();
    }
}

function scheduleSave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(persist, AUTOSAVE_DELAY_MS || 800);
}

function scheduleBoundFileFlush() {
    if (!boundFileHandle || boundFileReadonly) return;

    diskFlushQueued = true;
    if (diskFlushInFlight) return;
    queueMicrotask(flushBoundFileIfNeeded);
}

function getBoundFileContentForFlush() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return null;
    return activeFile.content;
}

async function flushBoundFileIfNeeded() {
    if (!diskFlushQueued || diskFlushInFlight || !boundFileHandle || boundFileReadonly) return;
    const content = getBoundFileContentForFlush();
    if (typeof content !== 'string') {
        diskFlushQueued = false;
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('No active file', 'warning');
        return;
    }

    diskFlushQueued = false;
    diskFlushInFlight = true;
    try {
        const writable = await boundFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput('', 'bound');
    } catch (error) {
        console.error('[qa-scenario] bound file flush failed', error);
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Sync failed', 'warning');
    } finally {
        diskFlushInFlight = false;
        if (diskFlushQueued) {
            queueMicrotask(flushBoundFileIfNeeded);
        }
    }
}

function scheduleDirectoryFileFlush() {
    if (!boundDirectoryHandle || !boundDirectoryWriteEnabled) return;

    directoryFlushQueued = true;
    if (directoryFlushInFlight) return;
    queueMicrotask(flushDirectoryFileIfNeeded);
}

function getActiveDirectoryFileFlushTarget() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return null;
    const fileHandle = directoryFileHandleById.get(activeFile.id);
    if (!fileHandle) return null;
    return {
        activeFile,
        fileHandle
    };
}

async function flushDirectoryFileIfNeeded() {
    if (!directoryFlushQueued || directoryFlushInFlight || !boundDirectoryHandle || !boundDirectoryWriteEnabled) return;

    const target = getActiveDirectoryFileFlushTarget();
    if (!target) {
        directoryFlushQueued = false;
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('No active file', 'warning');
        return;
    }

    directoryFlushQueued = false;
    directoryFlushInFlight = true;
    try {
        const diskFile = await target.fileHandle.getFile();
        const currentFingerprint = buildFileFingerprint(diskFile);
        const previousFingerprint = directoryFileFingerprintById.get(target.activeFile.id);
        if (previousFingerprint && !isSameFileFingerprint(previousFingerprint, currentFingerprint)) {
            setDirectDiskSyncAvailable(false);
            updateBoundFilePathInput('Conflict: re-open folder', 'warning');
            return;
        }

        const writable = await target.fileHandle.createWritable();
        await writable.write(target.activeFile.content || '');
        await writable.close();

        const syncedFile = await target.fileHandle.getFile();
        directoryFileFingerprintById.set(target.activeFile.id, buildFileFingerprint(syncedFile));
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput('', 'bound');
    } catch (error) {
        console.error('[qa-scenario] directory file flush failed', error);
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Sync failed', 'warning');
    } finally {
        directoryFlushInFlight = false;
        if (directoryFlushQueued) {
            queueMicrotask(flushDirectoryFileIfNeeded);
        }
    }
}

/**
 * Explicit save (Cmd/Ctrl+S). It always shows the same "Saved!" feedback as
 * autosave, even when autosave already ran and nothing was dirty.
 */
function flushAutosaveAndPersist() {
    topSaveStatusActivated = true;
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    persist();
}

function applyImportedWorkspace(data, options = {}) {
    workspace = Workspace.normalizeWorkspace(data);
    restoreActiveFileFromLocation(workspace, options.lastActiveFileLocation);
    restoreOpenFilesFromPaths(workspace, options.openFilePaths);
    persist();
    loadActiveFile();
    scheduleNoteImageStatusRefresh();
    syncExportOptionUiFromWorkspace();
}

function toImportedWorkspaceFromText(text) {
    const parsed = tryParseJson(text);
    if (!parsed) return null;
    const importedWorkspace = convertImportedPayloadToWorkspace(parsed, {
        exportFormat: EXPORT_FORMAT,
        workspaceVersion: WORKSPACE_VERSION,
        defaultFileName: DEFAULT_FILE_NAME,
        createFolderRecord: Workspace.createFolderRecord,
        createFileRecord: Workspace.createFileRecord,
        normalizeExportMode,
        buildRequiredScenarioWithDefaults
    });
    return importedWorkspace;
}

async function handleImportFile(file) {
    const text = await file.text();
    const importedWorkspace = toImportedWorkspaceFromText(text);
    if (!importedWorkspace) return alert('Unsupported or invalid JSON format');
    clearBoundFile();
    boundDirectoryHandle = null;
    boundDirectoryJsonFileCount = 0;
    setTreeMutationsEnabled(true);
    updateFolderWritePermissionUi();
    applyImportedWorkspace(importedWorkspace);
    updateBoundFilePathInput('Not bound', 'warning');
}

async function handleBindOpenClick(event) {
    const forceFileOpen = Boolean(event?.shiftKey);
    if (!forceFileOpen && typeof window.showDirectoryPicker === 'function') {
        try {
            const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (!directoryHandle) return;
            await bindAndLoadFromDirectoryHandle(directoryHandle);
            return;
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('[qa-scenario] open directory failed', error);
                alert('Open folder failed');
            }
            return;
        }
    }

    await handleBindOpenFileClick();
}

async function handleBindOpenFileClick() {
    if (typeof window.showOpenFilePicker !== 'function') {
        EL.fileInput.value = '';
        EL.fileInput.click();
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }],
            excludeAcceptAllOption: false
        });
        if (!handle) return;
        await bindAndLoadFromFileHandle(handle);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('[qa-scenario] open file failed', error);
        alert('Open failed');
    }
}

async function bindAndLoadFromDirectoryHandle(handle, options = {}) {
    const isRestore = options?.isRestore === true;
    const reportProgress = typeof options?.onProgress === 'function'
        ? options.onProgress
        : () => {};
    let writeGranted = false;
    let readGranted = false;

    if (isRestore) {
        readGranted = await ensureDirectoryReadPermission(handle, {
            interactive: false,
            silent: true
        });
        writeGranted = await ensureDirectoryReadWritePermission(handle, {
            interactive: false,
            silent: true
        });
    } else {
        writeGranted = await ensureDirectoryReadWritePermission(handle, {
            interactive: true,
            silent: false
        });

        if (writeGranted) {
            readGranted = true;
        } else {
            readGranted = await ensureDirectoryReadPermission(handle, {
                interactive: false,
                silent: false
            });
        }
    }

    if (!readGranted) {
        if (isRestore) {
            boundDirectoryHandle = handle;
            boundDirectoryWriteEnabled = false;
            setDirectDiskSyncAvailable(false);
            updateFolderWritePermissionUi();
            updateBoundFilePathInput('Click Grant Access', 'warning');
            return false;
        }
        alert('Open folder failed: read permission denied');
        return false;
    }

    reportProgress('permission', 'done');
    reportProgress('read', 'active');
    let loaded = null;
    try {
        loaded = await loadWorkspaceFromDirectoryHandle(handle, { silentErrors: isRestore });
    } catch (error) {
        reportProgress('read', 'warning');
        console.error('[qa-scenario] load workspace from directory failed', error);
        alert('Open folder failed while reading directory contents');
        return false;
    }

    if (!loaded?.workspace) {
        reportProgress('read', 'warning');
        alert('Unsupported or invalid directory contents');
        return false;
    }

    const lastActiveFileLocation = getLastActiveFileLocation();
    const openFilePaths = workspace?.uiState?.openFilePaths;
    reportProgress('read', 'done');
    reportProgress('apply', 'active');
    clearBoundFile({ clearPersistedDirectoryHandle: false });
    boundDirectoryHandle = handle;
    boundDirectoryWriteEnabled = writeGranted;
    boundDirectoryJsonFileCount = loaded.loadedJsonFileCount;
    directoryFileHandleById = loaded.fileHandleById;
    directoryFileFingerprintById = loaded.fileFingerprintById;
    directoryHandleByFolderId = loaded.folderHandleById;
    setTreeMutationsEnabled(writeGranted);
    setDirectDiskSyncAvailable(writeGranted);
    updateFolderWritePermissionUi();

    applyImportedWorkspace(loaded.workspace, { lastActiveFileLocation, openFilePaths });
    setWorkspaceBoundFileMeta(loaded.rootName, 'directory');
    try {
        await setBoundDirectoryHandleInDb(handle, loaded.rootName);
    } catch (error) {
        console.warn('[qa-scenario] failed to persist bound directory handle', error);
    }
    applyBoundFilePath(loaded.rootName);
    if (writeGranted) {
        updateBoundFilePathInput(buildFolderStatusMessage('direct-save'), 'bound');
        scheduleDirectoryFileFlush();
    } else {
        updateBoundFilePathInput(buildFolderStatusMessage('read-only'), 'warning');
    }

    reportProgress('apply', 'done');
    return true;
}

async function loadWorkspaceFromDirectoryHandle(rootHandle, options = {}) {
    const silentErrors = options?.silentErrors === true;
    const rootName = rootHandle?.name || 'Opened Folder';
    const folders = [];
    const files = [];
    const fileHandleById = new Map();
    const fileFingerprintById = new Map();
    const folderHandleById = new Map();
    const folderIdByPath = new Map();

    const ensureFolder = (relativePath) => {
        const key = relativePath || '';
        if (folderIdByPath.has(key)) return folderIdByPath.get(key);
        const segments = key ? key.split('/') : [];
        const folderName = segments.length > 0 ? segments[segments.length - 1] : rootName;
        const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
        const parentId = segments.length > 0 ? (folderIdByPath.get(parentPath) || null) : null;
        const folder = Workspace.createFolderRecord(folderName, parentId, key);
        folders.push(folder);
        folderIdByPath.set(key, folder.id);
        return folder.id;
    };

    ensureFolder('');
    const rootFolderId = folderIdByPath.get('');
    if (rootFolderId) {
        folderHandleById.set(rootFolderId, rootHandle);
    }
    let loadedJsonFileCount = 0;

    const walkDirectory = async (dirHandle, currentPath) => {
        try {
            for await (const [entryName, entryHandle] of dirHandle.entries()) {
                if (entryHandle.kind === 'directory') {
                    const nextPath = currentPath ? `${currentPath}/${entryName}` : entryName;
                    const childFolderId = ensureFolder(nextPath);
                    folderHandleById.set(childFolderId, entryHandle);
                    await walkDirectory(entryHandle, nextPath);
                    continue;
                }
                if (entryHandle.kind !== 'file') continue;
                if (!entryName.toLowerCase().endsWith('.json')) continue;

                let file = null;
                let content = '';
                try {
                    file = await entryHandle.getFile();
                    content = await file.text();
                } catch (error) {
                    console.warn('[qa-scenario] failed to read file from directory', entryName, error);
                    continue;
                }

                const folderId = ensureFolder(currentPath);
                const record = Workspace.createFileRecord(folderId, entryName, content);
                files.push(record);
                fileHandleById.set(record.id, entryHandle);
                fileFingerprintById.set(record.id, buildFileFingerprint(file));
                loadedJsonFileCount += 1;
            }
        } catch (error) {
            if (!silentErrors) {
                console.warn('[qa-scenario] failed to traverse directory', currentPath || '.', error);
            }
        }
    };

    await walkDirectory(rootHandle, '');

    if (files.length === 0) {
        const fallbackFolderId = ensureFolder('');
        const fallback = Workspace.createFileRecord(
            fallbackFolderId,
            DEFAULT_FILE_NAME,
            JSON.stringify(buildRequiredScenarioWithDefaults({}), null, 2)
        );
        files.push(fallback);
    }

    return {
        rootName,
        loadedJsonFileCount,
        folderHandleById,
        fileHandleById,
        fileFingerprintById,
        workspace: {
            version: WORKSPACE_VERSION,
            folders,
            files,
            uiState: {
                sourceMode: 'directory',
                expandedFolderIds: folders.map((folder) => folder.id)
            }
        }
    };
}

async function ensureDirectoryReadPermission(handle, options = {}) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const interactive = options?.interactive !== false;
    const silent = options?.silent === true;
    const permissionOptions = { mode: 'read' };

    try {
        let permission = await handle.queryPermission(permissionOptions);
        if (permission === 'granted') return true;
        if (!interactive || typeof handle.requestPermission !== 'function') return false;

        permission = await handle.requestPermission(permissionOptions);
        return permission === 'granted';
    } catch (error) {
        if (!silent) {
            console.warn('[qa-scenario] directory read permission request failed', error);
        }
        return false;
    }
}

async function ensureDirectoryReadWritePermission(handle, options = {}) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const interactive = options?.interactive !== false;
    const silent = options?.silent === true;
    const permissionOptions = { mode: 'readwrite' };

    try {
        let permission = await handle.queryPermission(permissionOptions);
        if (permission === 'granted') return true;
        if (!interactive || typeof handle.requestPermission !== 'function') return false;

        permission = await handle.requestPermission(permissionOptions);
        return permission === 'granted';
    } catch (error) {
        if (!silent) {
            console.warn('[qa-scenario] directory write permission request failed', error);
        }
        return false;
    }
}

function buildFolderStatusMessage(mode) {
    if (mode === 'direct-save') {
        return '';
    }
    if (mode === 'read-only') {
        return 'Click Grant Access';
    }
    return '';
}

function updateFolderWritePermissionUi() {
    // Every change of the opened folder or its permission passes through
    // here, and each one changes which images can be read.
    noteAssets?.reset();
    updateRootPathStatus();
    if (!EL.btnRequestWrite) return;
    const shouldShow = Boolean(boundDirectoryHandle && !boundDirectoryWriteEnabled);
    EL.btnRequestWrite.hidden = !shouldShow;
    EL.btnRequestWrite.disabled = Boolean(shouldShow && folderWritePermissionRequestInFlight);
    EL.btnRequestWrite.textContent = folderWritePermissionRequestInFlight ? 'Granting...' : 'Grant Access';
    EL.btnRequestWrite.title = shouldShow
        ? 'Click to grant folder write access.'
        : 'Folder write access granted.';
}

function buildFileFingerprint(file) {
    return {
        lastModified: Number(file?.lastModified) || 0,
        size: Number(file?.size) || 0
    };
}

function isSameFileFingerprint(left, right) {
    if (!left || !right) return false;
    return left.lastModified === right.lastModified && left.size === right.size;
}

async function handleRequestFolderWritePermission() {
    if (folderWritePermissionRequestInFlight) return;

    if (!boundDirectoryHandle) {
        updateBoundFilePathInput('Re-open folder', 'warning');
        return;
    }

    if (boundDirectoryWriteEnabled) {
        updateFolderWritePermissionUi();
        return;
    }

    const handle = boundDirectoryHandle;
    const wasDirectoryLoaded = workspace?.uiState?.sourceMode === 'directory'
        && directoryHandleByFolderId.size > 0;

    folderWritePermissionRequestInFlight = true;
    updateFolderWritePermissionUi();

    try {
        const granted = await ensureDirectoryReadWritePermission(boundDirectoryHandle);
        boundDirectoryWriteEnabled = granted;
        setDirectDiskSyncAvailable(granted);

        if (!granted) {
            setTreeMutationsEnabled(false);
            updateBoundFilePathInput(buildFolderStatusMessage('read-only'), 'warning');
            return;
        }

        updateFolderWritePermissionUi();

        if (!wasDirectoryLoaded) {
            await bindAndLoadFromDirectoryHandle(handle);
            return;
        }

        setTreeMutationsEnabled(true);
        updateBoundFilePathInput(buildFolderStatusMessage('direct-save'), 'bound');
        scheduleDirectoryFileFlush();
    } finally {
        folderWritePermissionRequestInFlight = false;
        updateFolderWritePermissionUi();
    }
}

async function bindAndLoadFromFileHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    const importedWorkspace = toImportedWorkspaceFromText(text);
    if (!importedWorkspace) {
        alert('Unsupported or invalid JSON format');
        return;
    }

    applyImportedWorkspace(importedWorkspace);
    void clearBoundDirectoryHandleInDb();
    boundDirectoryHandle = null;
    boundDirectoryWriteEnabled = false;
    boundDirectoryJsonFileCount = 0;
    directoryFileHandleById = new Map();
    directoryFileFingerprintById = new Map();
    directoryHandleByFolderId = new Map();
    setTreeMutationsEnabled(true);
    updateFolderWritePermissionUi();
    const readWriteGranted = await ensureReadWritePermission(handle);
    boundFileHandle = handle;
    boundFileName = file.name || 'untitled.json';
    boundFileReadonly = !readWriteGranted;
    setWorkspaceBoundFileMeta(boundFileName, 'file');
    applyBoundFilePath(boundFileName);
    if (boundFileReadonly) {
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Write access denied', 'warning');
    } else {
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput('', 'bound');
        scheduleBoundFileFlush();
    }
}

async function ensureReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const options = { mode: 'readwrite' };

    let permission = await handle.queryPermission(options);
    if (permission === 'granted') return true;
    if (typeof handle.requestPermission !== 'function') return false;

    permission = await handle.requestPermission(options);
    return permission === 'granted';
}

function setWorkspaceBoundFileMeta(name, kind = 'file') {
    if (!workspace?.uiState) return;
    workspace.uiState.boundFile = {
        kind,
        name,
        boundAt: nowIso()
    };
    Workspace.persistWorkspace(workspace);
}

function clearWorkspaceBoundFileMeta() {
    if (!workspace?.uiState || !workspace.uiState.boundFile) return;
    delete workspace.uiState.boundFile;
    Workspace.persistWorkspace(workspace);
}

function clearBoundFile(options = {}) {
    const clearMeta = options.clearMeta !== false;
    const clearPersistedDirectoryHandle = options.clearPersistedDirectoryHandle !== false;
    boundFileHandle = null;
    boundDirectoryHandle = null;
    boundDirectoryWriteEnabled = false;
    boundDirectoryJsonFileCount = 0;
    directoryFileHandleById = new Map();
    directoryFileFingerprintById = new Map();
    directoryHandleByFolderId = new Map();
    boundFileName = '';
    applyBoundFilePath(BOUND_FILE_PATH_DEFAULT_LABEL);
    boundFileReadonly = false;
    setDirectDiskSyncAvailable(false);
    diskFlushInFlight = false;
    diskFlushQueued = false;
    directoryFlushInFlight = false;
    directoryFlushQueued = false;
    if (clearMeta) {
        if (clearPersistedDirectoryHandle) {
            void clearBoundDirectoryHandleInDb();
        }
        clearWorkspaceBoundFileMeta();
    }
    updateFolderWritePermissionUi();
    updateStorageTargetFromWorkspaceMeta();
}

function updateStorageTargetFromWorkspaceMeta() {
    const boundMeta = workspace?.uiState?.boundFile;
    const name = boundMeta?.name;
    const kind = boundMeta?.kind || 'file';
    if (!name) {
        setTreeMutationsEnabled(true);
        setDirectDiskSyncAvailable(false);
        updateFolderWritePermissionUi();
        applyBoundFilePath(BOUND_FILE_PATH_DEFAULT_LABEL);
        updateBoundFilePathInput(BOUND_FILE_PATH_DEFAULT_TOOLTIP);
        return;
    }
    setTreeMutationsEnabled(kind !== 'directory');
    setDirectDiskSyncAvailable(false);
    updateFolderWritePermissionUi();
    applyBoundFilePath(name);
    if (kind === 'directory') {
        updateBoundFilePathInput('Re-open folder', 'warning');
        return;
    }
    updateBoundFilePathInput('Re-open file', 'warning');
}

function applyBoundFilePath(path) {
    if (!EL.boundFilePathInput) return;
    const value = path || '';
    EL.boundFilePathInput.value = value;
    EL.boundFilePathInput.title = value || BOUND_FILE_PATH_DEFAULT_TOOLTIP;
}

function updateBoundFilePathInput(label, tone = 'default') {
    if (EL.boundFilePathInput) {
        EL.boundFilePathInput.classList.remove('is-bound', 'is-warning');
    }
    if (EL.boundFileStatus) {
        EL.boundFileStatus.textContent = label;
        EL.boundFileStatus.title = label;
        EL.boundFileStatus.classList.remove('is-bound', 'is-warning');
    }
    if (tone === 'bound') {
        if (EL.boundFilePathInput) EL.boundFilePathInput.classList.add('is-bound');
        if (EL.boundFileStatus) EL.boundFileStatus.classList.add('is-bound');
    } else if (tone === 'warning') {
        if (EL.boundFilePathInput) EL.boundFilePathInput.classList.add('is-warning');
        if (EL.boundFileStatus) EL.boundFileStatus.classList.add('is-warning');
    }
}

function updateSaveIndicator(state) {
    lastSaveIndicatorState = state;
    if (state === 'dirty' || state === 'saving') {
        topSaveStatusActivated = true;
    }
    updateSaveIndicatorView({
        saveIndicator: EL.saveIndicator,
        saveIndicatorTime: EL.saveIndicatorTime,
        saveIndicatorLabel: EL.saveIndicatorLabel
    }, state, workspace?.updatedAt);
    updateTopSaveStatus(state);
    refreshSaveIndicatorPresentation();
}

function updateTopSaveStatus(state) {
    if (!EL.topSaveStatus) return;
    if (topSaveStatusHideTimer) {
        clearTimeout(topSaveStatusHideTimer);
        topSaveStatusHideTimer = null;
    }
    EL.topSaveStatus.classList.remove('is-dirty', 'is-saving', 'is-saved');
    if (!topSaveStatusActivated) {
        EL.topSaveStatus.textContent = '';
        EL.topSaveStatus.title = '';
        EL.topSaveStatus.classList.add('is-hidden');
        return;
    }

    const label = state === 'dirty' ? 'Unsaved' : (state === 'saving' ? 'Saving...' : 'Saved!');
    EL.topSaveStatus.textContent = label;
    EL.topSaveStatus.title = label;
    EL.topSaveStatus.classList.add(`is-${state}`);
    EL.topSaveStatus.classList.toggle('is-hidden', !label);

    if (state === 'saved') {
        topSaveStatusHideTimer = setTimeout(() => {
            topSaveStatusActivated = false;
            EL.topSaveStatus.textContent = '';
            EL.topSaveStatus.title = '';
            EL.topSaveStatus.classList.remove('is-dirty', 'is-saving', 'is-saved');
            EL.topSaveStatus.classList.add('is-hidden');
            topSaveStatusHideTimer = null;
        }, 3000);
    }
}

function setTreeMutationsEnabled(isEnabled) {
    treeMutationsEnabled = Boolean(isEnabled);
    if (EL.btnNewFolder) {
        EL.btnNewFolder.title = treeMutationsEnabled
            ? 'New folder'
            : 'Folder mode is read-only in this version';
    }
    if (EL.btnNewFile) {
        EL.btnNewFile.title = treeMutationsEnabled
            ? 'New file'
            : 'Folder mode is read-only in this version';
    }
}

function setDirectDiskSyncAvailable(isAvailable) {
    directDiskSyncAvailable = Boolean(isAvailable);
    refreshSaveIndicatorPresentation();
}

function refreshSaveIndicatorPresentation() {
    if (!EL.saveIndicator) return;

    EL.saveIndicator.classList.toggle('is-local-only-hidden', directDiskSyncAvailable);

    const shouldShowLocalSaveTooltip = !directDiskSyncAvailable && lastSaveIndicatorState === 'saved';
    const tooltip = shouldShowLocalSaveTooltip
        ? (boundDirectoryHandle ? DIRECTORY_LOCAL_SAVE_TOOLTIP : LOCAL_SAVE_ONLY_TOOLTIP)
        : '';

    EL.saveIndicator.title = tooltip;
    if (EL.saveIndicatorLabel) {
        EL.saveIndicatorLabel.title = tooltip;
    }
}

function applyLineNumberVisibility() {
    applyLineNumberVisibilityView({
        toggleLineNumbers: EL.toggleLineNumbers,
        editorWrapper: EL.editorWrapper,
        editing: EL.editing,
        lineNumbers: EL.lineNumbers
    }, persistLineNumberPreference);
}

function applyLineNumberPreference() {
    applyLineNumberPreferenceFromWorkspace(workspace, EL.toggleLineNumbers);
}

function persistLineNumberPreference(shouldShow) {
    if (!workspace?.uiState) return;
    workspace.uiState.showLineNumbers = shouldShow;
    Workspace.persistWorkspace(workspace);
}

function applyFileTreePreference() {
    // Panel visibility comes from localStorage now, so this no longer waits
    // for a workspace to exist.
    if (!EL.fileTreePanel) return;
    applyPanelVisibility({ persist: false });
}

function applyFileTreeWidthPreference() {
    if (!workspace?.uiState || !EL.fileTreePanel) return;
    const preferred = workspace.uiState.fileTreeWidth;
    if (Number.isFinite(preferred) && preferred > 0) {
        resizerLayout.setManualFileTreeWidth(preferred);
    }
    if (isFileTreeVisible() && isJsonEditorPanelVisible()) {
        const nextWidth = resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
        resizerLayout.setManualFileTreeWidth(resizerLayout.applyFileTreeWidth(nextWidth, { persist: false }));
    }
}

function persistFileTreeWidthPreference(width) {
    if (!workspace?.uiState) return;
    workspace.uiState.fileTreeWidth = width;
    Workspace.persistWorkspace(workspace);
}

/**
 * Which panels are open is a view preference, not workspace data, so it lives
 * in localStorage. Keeping it on the workspace meant an import replaced the
 * object and the panels silently reopened.
 */
function readStoredPanelVisibility() {
    let raw = null;
    try {
        raw = localStorage.getItem(PANEL_VISIBILITY_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }

    if (raw) {
        const parsed = tryParseJson(raw);
        if (parsed && typeof parsed === 'object') return parsed;
    }

    // First run after the move: adopt whatever the workspace still holds.
    const legacy = workspace?.uiState?.panelVisibility;
    if (legacy && typeof legacy === 'object') return legacy;
    if (typeof workspace?.uiState?.showFileTree === 'boolean') {
        return { fileTree: workspace.uiState.showFileTree };
    }
    return {};
}

function getPanelVisibilityState() {
    const saved = readStoredPanelVisibility();
    const pick = key => (
        typeof saved[key] === 'boolean' ? saved[key] : DEFAULT_PANEL_VISIBILITY[key]
    );
    return {
        fileTree: pick('fileTree'),
        jsonEditor: pick('jsonEditor'),
        tableEditor: pick('tableEditor')
    };
}

function persistPanelVisibilityState(state) {
    try {
        localStorage.setItem(PANEL_VISIBILITY_STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* storage unavailable */ }

    // The file tree flag stays mirrored on the workspace for older builds.
    if (workspace?.uiState) {
        workspace.uiState.showFileTree = state.fileTree;
        Workspace.persistWorkspace(workspace);
    }
}

function updatePanelToggleButton(button, isActive) {
    if (!button) return;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function getPreferredFileTreeWidth() {
    return resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
}

function resetFileTreePanelWidthForFill() {
    if (!EL.fileTreePanel) return;
    EL.fileTreePanel.style.flex = '1 1 auto';
    EL.fileTreePanel.style.width = '';
}

function applyPanelVisibility(options = {}) {
    if (!EL.appContent || !EL.editorPane) return;
    const persist = options.persist !== false;
    const state = options.state || getPanelVisibilityState();
    const editorPaneVisible = state.fileTree || state.jsonEditor;
    const allHidden = !state.fileTree && !state.jsonEditor && !state.tableEditor;
    const showPaneResizer = editorPaneVisible && state.tableEditor && !allHidden;
    const showFileTreeResizer = state.fileTree && state.jsonEditor && editorPaneVisible;

    if (!state.fileTree || !state.jsonEditor) {
        resizerLayout.stopFileTreeResizing();
    }
    if (!showPaneResizer) {
        resizerLayout.stopPaneResizing();
    }

    EL.appContent.classList.toggle('is-panel-file-tree-hidden', !state.fileTree);
    EL.appContent.classList.toggle('is-panel-json-editor-hidden', !state.jsonEditor);
    EL.appContent.classList.toggle('is-panel-table-editor-hidden', !state.tableEditor);
    EL.appContent.classList.toggle('is-editor-pane-hidden', !editorPaneVisible);
    EL.appContent.classList.toggle('is-panel-empty', allHidden);
    EL.appContent.classList.toggle('has-pane-resizer', showPaneResizer);
    EL.appContent.classList.toggle('has-file-tree-resizer', showFileTreeResizer);

    updatePanelToggleButton(EL.btnPanelFileTree, state.fileTree);
    updatePanelToggleButton(EL.btnPanelJsonEditor, state.jsonEditor);
    updatePanelToggleButton(EL.btnPanelTableEditor, state.tableEditor);

    if (EL.fileTreePanel) {
        EL.fileTreePanel.classList.toggle('is-collapsed', !state.fileTree);
        EL.fileTreePanel.dataset.treeVisible = state.fileTree ? 'true' : 'false';
    }

    EL.editorPane.style.width = '';
    EL.editorPane.style.flex = '';

    if (editorPaneVisible && !state.tableEditor) {
        EL.editorPane.style.flex = '1 1 auto';
    } else if (state.fileTree && !state.jsonEditor && state.tableEditor) {
        const width = getPreferredFileTreeWidth();
        EL.editorPane.style.flex = `0 0 ${width}px`;
        EL.editorPane.style.width = `${width}px`;
    } else if (editorPaneVisible && state.tableEditor) {
        const manualEditorWidth = resizerLayout.getManualEditorWidth();
        if (Number.isFinite(manualEditorWidth)) {
            resizerLayout.applyEditorWidth(manualEditorWidth, { persist: false });
        }
    }

    if (state.fileTree && state.jsonEditor) {
        resizerLayout.applyFileTreeWidth(getPreferredFileTreeWidth(), { persist: false });
    } else if (state.fileTree) {
        resetFileTreePanelWidthForFill();
    }

    closeTreeMenu();
    if (persist) {
        persistPanelVisibilityState(state);
    }
}

function setPanelVisibility(panelKey, shouldShow, options = {}) {
    const state = getPanelVisibilityState();
    state[panelKey] = Boolean(shouldShow);
    applyPanelVisibility({ ...options, state });
}

function togglePanelVisibility(panelKey) {
    const state = getPanelVisibilityState();
    state[panelKey] = !state[panelKey];
    applyPanelVisibility({ state });
}

function setFileTreeVisibility(shouldShow, options = {}) {
    setPanelVisibility('fileTree', shouldShow, options);
}

function isFileTreeVisible() {
    return getPanelVisibilityState().fileTree;
}

function isJsonEditorPanelVisible() {
    return getPanelVisibilityState().jsonEditor;
}

function updateLineNumbers() {
    const searchMatchLineNumbers = getEditorSearchMatchLineNumbers();
    const errorLineNumber = getCurrentJsonErrorLineNumber();
    updateLineNumbersView(EL.editing, EL.lineNumbers, {
        searchMatchLineNumbers,
        errorLineNumber
    });
    renderEditorScrollMarkers(searchMatchLineNumbers);
}

function renderEditorFromCurrentData() {
    updateLineNumbers();
    updateHighlighting();
    setJsonValidationValidState();
    refreshPassSummary();
}

/**
 * The pass toggle and the progress counter read the same data, so they are
 * refreshed together. Keeping them in one place stops one from going stale
 * when a new code path changes `pass`.
 */
function refreshPassSummary() {
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
    UI.updateChecklistProgressIndicator(EL.checklistProgress, currentData);
}

function setJsonValidationValidState() {
    EL.jsonStatus.classList.remove('idle');
    setJsonValidationValidView(
        EL.jsonStatus,
        () => updateErrorPosition(-1),
        updateErrorMessage
    );
}

function setJsonValidationErrorState(label) {
    EL.jsonStatus.classList.remove('idle');
    setJsonValidationErrorView(EL.jsonStatus, label);
}

function setJsonValidationIdleState(label = 'No file') {
    if (!EL.jsonStatus) return;
    EL.jsonStatus.textContent = label;
    EL.jsonStatus.classList.remove('error');
    EL.jsonStatus.classList.add('idle');
}

function updateErrorMessage(message) {
    updateJsonErrorMessageView(EL.jsonErrorMessage, message);
}

function hasSteps(data) {
    if (!data || !Array.isArray(data.steps)) return false;
    return data.steps.some(step => !UI.isChecklistDividerStep(step));
}

function areAllStepsPassed(steps) {
    const checkableSteps = steps.filter(step => !UI.isChecklistDividerStep(step));
    if (checkableSteps.length === 0) return false;
    return checkableSteps.every(step => step.pass === true);
}

function clearStepHighlight() {
    editorHighlightManager.clearStepHighlight();
}

function renderStepHighlight(bounds) {
    editorHighlightManager.renderStepHighlight(bounds);
}

function updateStepHighlightPosition() {
    editorHighlightManager.updateStepHighlightPosition();
}

function scrollToLine(position) {
    editorHighlightManager.scrollToLine(position);
}

function updateErrorPosition(position) {
    currentJsonErrorPosition = Number.isFinite(position) ? position : -1;
    editorHighlightManager.updateErrorPosition(position);
    updateLineNumbers();
}

function getEditorMetrics() {
    const styles = getComputedStyle(EL.editing);
    const fontSize = parseFloat(styles.fontSize) || 13;
    let lineHeight = parseFloat(styles.lineHeight);
    if (Number.isNaN(lineHeight)) lineHeight = fontSize * 1.5;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    return { lineHeight, paddingTop };
}

function handleWindowResize() {
    resizerLayout.handleWindowResize(false);
    applyPanelVisibility({ persist: false });
}

function setupWindowListeners() {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('resize', handleWindowResize);
    document.addEventListener('click', (event) => {
        if (!EL.treeContextMenu || EL.treeContextMenu.hidden) {
            // skip tree menu
        } else if (!EL.treeContextMenu.contains(event.target)) {
            closeTreeContextMenu();
        }
        if (!EL.checklistContextMenu || EL.checklistContextMenu.hidden) return;
        if (EL.checklistContextMenu.contains(event.target)) return;
        closeChecklistContextMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeTreeContextMenu();
        closeChecklistContextMenu();
        closeShortcutsModal();
    });
    if (EL.treeContextRename) {
        EL.treeContextRename.addEventListener('click', handleTreeContextRename);
    }
    if (EL.treeContextNewFolder) {
        EL.treeContextNewFolder.addEventListener('click', handleTreeContextNewFolder);
    }
    if (EL.treeContextNewFile) {
        EL.treeContextNewFile.addEventListener('click', handleTreeContextNewFile);
    }
    if (EL.treeContextCopy) {
        EL.treeContextCopy.addEventListener('click', handleTreeContextCopy);
    }
    if (EL.treeContextDelete) {
        EL.treeContextDelete.addEventListener('click', handleTreeContextDelete);
    }
    EL.checklistContextPin?.addEventListener('click', handleChecklistContextPin);
    if (EL.checklistContextDelete) {
        EL.checklistContextDelete.addEventListener('click', handleChecklistContextDelete);
    }
    if (EL.checklistContextColor) {
        EL.checklistContextColor.addEventListener('click', handleChecklistContextColorClick);
    }
    if (EL.checklistContextType) {
        renderChecklistContextTypeMenu();
        EL.checklistContextType.addEventListener('click', handleChecklistContextTypeClick);
    }
    if (EL.btnKeyboardShortcuts) {
        EL.btnKeyboardShortcuts.addEventListener('click', openShortcutsModal);
    }
    if (EL.btnShortcutsClose) {
        EL.btnShortcutsClose.addEventListener('click', closeShortcutsModal);
    }
    if (EL.shortcutsBackdrop) {
        EL.shortcutsBackdrop.addEventListener('click', closeShortcutsModal);
    }
}

function handleBeforeUnload() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    if (activeFileDirty) persist();
}

function setupEventListeners() {
    setupMainEventListeners({
        el: EL,
        onDocumentKeydown: handleDocumentKeydown,
        onEditorInput: handleEditorInput,
        onEditorPaste: handleEditorPaste,
        onEditorScroll: syncScroll,
        onEditorKeydown: handleEditorKeydown,
        onEditorKeyup: handleEditorSelectionChange,
        onEditorClick: handleEditorSelectionChange,
        onEditorSelect: handleEditorSelectionChange,
        onFindInput: handleFindInput,
        onFindInputKeydown: handleFindInputKeydown,
        onReplaceInput: handleReplaceInput,
        onReplaceInputKeydown: handleReplaceInputKeydown,
        onFindNext: handleFindNext,
        onFindPrev: handleFindPrev,
        onFindClose: closeFindWidget,
        onReplaceOne: handleReplaceOne,
        onReplaceAll: handleReplaceAll,
        onFormat: runFormatAndSave,
        onToggleLineNumbers: applyLineNumberVisibility,
        onToggleFolders: () => {
            toggleAllFolders();
            closeTreeMenu();
        },
        onToggleTree: () => {
            const isCollapsed = EL.fileTreePanel?.classList.contains('is-collapsed');
            setFileTreeVisibility(Boolean(isCollapsed));
            closeTreeMenu();
        },
        onShowTree: () => {
            setFileTreeVisibility(true);
        },
        onTogglePassHeader: () => {
            if (EL.passHeaderToggle.classList.contains('disabled')) return;
            toggleAllPass();
        },
        onNewFolder: () => { void createFolderFromUi(); },
        onNewFile: () => { void createFileFromUi(); },
        onExport: handleExportClick,
        onImportClick: handleBindOpenClick,
        onRequestFolderWritePermission: handleRequestFolderWritePermission,
        onImportFile: handleImportFile,
        onImportError: () => {
            alert('Open failed');
        }
    });

    if (EL.treeSearchInput) {
        EL.treeSearchInput.addEventListener('input', handleTreeSearchInput);
        EL.treeSearchInput.addEventListener('keydown', handleTreeSearchKeydown);
    }
    if (EL.btnTreeSearchClear) {
        EL.btnTreeSearchClear.addEventListener('click', clearTreeSearch);
    }
    if (EL.btnPanelFileTree) {
        EL.btnPanelFileTree.addEventListener('click', () => togglePanelVisibility('fileTree'));
    }
    if (EL.btnPanelJsonEditor) {
        EL.btnPanelJsonEditor.addEventListener('click', () => togglePanelVisibility('jsonEditor'));
    }
    if (EL.btnPanelTableEditor) {
        EL.btnPanelTableEditor.addEventListener('click', () => togglePanelVisibility('tableEditor'));
    }
}

function handleDocumentKeydown(event) {
    if (!matchShortcut(event, 'undo')) return;
    const activeElement = document.activeElement;
    if (activeElement === EL.editing) return;
    if (isTextEditingElement(activeElement)) return;
    if (!deletedFileHistoryManager.restoreLastDeletedFile()) return;
    event.preventDefault();
}

function isTextEditingElement(element) {
    if (!element) return false;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea') return true;
    return element.isContentEditable === true;
}

try {
    init();
} catch (error) {
    // A startup error must not leave the app locked behind the overlay.
    hideLoadingOverlay();
    throw error;
}
