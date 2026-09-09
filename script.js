import {
    WORKSPACE_STORAGE_KEY,
    CHECKLIST_DENSITY_STORAGE_KEY,
    NOTE_PANEL_WIDTH_STORAGE_KEY,
    NOTE_CODE_LANG_STORAGE_KEY,
    CHECKLIST_FILTER_STORAGE_KEY,
    PANEL_VISIBILITY_STORAGE_KEY
} from './constants/storage.js';
import { AUTOSAVE_DELAY_MS, WORKSPACE_VERSION, DEFAULT_FILE_NAME } from './configs/workspace.js';
import { EDITOR_CONFIG } from './configs/editor-config.js';
import { tryParseJson } from './utils/json.js';
import { nowTs, nowIso } from './utils/date.js';
import * as Workspace from './modules/workspace-manager.js';
import * as UI from './modules/ui-renderer.js';
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
import {
    isEditorSaveShortcut,
    isEditorUndoShortcut,
    isEditorRedoShortcut,
    isEditorCursorHistoryBackShortcut,
    isEditorCursorHistoryForwardShortcut,
    isEditorFindOpenShortcut,
    isEditorReplaceOpenShortcut,
    isEditorFindNextShortcut,
    isEditorFindPreviousShortcut,
    isEditorFindCloseShortcut,
    runNativeEditCommand
} from './modules/editor-shortcut-manager.js';
import { createEditorCursorHistoryManager } from './modules/editor-cursor-history-manager.js';
import { createEditorFindReplaceManager } from './modules/editor-find-replace-manager.js';
import { createDeletedFileHistoryManager } from './modules/deleted-file-history-manager.js';

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
    checklistFilterToggle: document.getElementById('checklist-filter-toggle'),
    checklistFilterLabel: document.getElementById('checklist-filter-label'),
    checklistFilterMenu: document.getElementById('checklist-filter-menu'),
    stepDetailPanel: document.getElementById('step-detail-panel'),
    stepDetailBackdrop: document.getElementById('step-detail-backdrop'),
    stepDetailTitle: document.getElementById('step-detail-title'),
    stepDetailClose: document.getElementById('step-detail-close'),
    stepDetailNotes: document.getElementById('step-detail-notes'),
    stepDetailNotesEmpty: document.getElementById('step-detail-notes-empty'),
    stepDetailAddNote: document.getElementById('step-detail-add-note'),
    stepDetailResizer: document.getElementById('step-detail-resizer'),
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
    treeContextMenu: document.getElementById('tree-context-menu'),
    treeContextNewFolder: document.getElementById('tree-context-new-folder'),
    treeContextNewFile: document.getElementById('tree-context-new-file'),
    treeContextCopy: document.getElementById('tree-context-copy'),
    treeContextRename: document.getElementById('tree-context-rename'),
    treeContextDelete: document.getElementById('tree-context-delete'),
    treeContextReadonly: document.getElementById('tree-context-readonly'),
    checklistContextMenu: document.getElementById('checklist-context-menu'),
    checklistContextDelete: document.getElementById('checklist-context-delete'),
    checklistContextDetail: document.getElementById('checklist-context-detail'),
    btnKeyboardShortcuts: document.getElementById('btn-keyboard-shortcuts'),
    shortcutsModal: document.getElementById('keyboard-shortcuts-modal'),
    shortcutsBackdrop: document.getElementById('keyboard-shortcuts-backdrop'),
    btnShortcutsClose: document.getElementById('btn-shortcuts-close'),
    loadingOverlay: document.getElementById('loading-overlay'),
    checklistContextColor: document.getElementById('checklist-context-color'),
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
let stepDetailIndex = null;
let stepDetailActiveNote = null;
let checklistFilter = 'all';
let stepDetailCodeEditors = [];
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
let directDiskSyncAvailable = false;
let lastSaveIndicatorState = 'saved';
let diskFlushInFlight = false;
let diskFlushQueued = false;
let directoryFlushInFlight = false;
let directoryFlushQueued = false;
let folderWritePermissionRequestInFlight = false;
let treeContextTarget = null;
let checklistContextTarget = null;
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
    'steps.notes'
];
const DEFAULT_NOTE_CODE_LANG = 'javascript';
const NOTE_PANEL_MIN_WIDTH = 320;
const NOTE_PANEL_DEFAULT_WIDTH = 680;
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
    setupChecklistDensityToggle();
    setupChecklistFilter();
    setupStepDetailPanel();
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
    if (!boundMeta || boundMeta.kind !== 'directory') return;
    if (boundDirectoryHandle) return;

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
    Workspace.persistWorkspace(workspace);
    activeFileDirty = false;
    updateSaveIndicator('saved');
    scheduleBoundFileFlush();
    scheduleDirectoryFileFlush();
    renderTree();
}

function loadActiveFile() {
    // Input handlers already save drafts. Never flush old editors into a new file.
    destroyStepDetailCodeEditors();
    sharedNoteTarget = null;
    stepDetailIndex = null;
    EL.stepDetailPanel?.classList.add('is-hidden');
    EL.stepDetailBackdrop?.classList.add('is-hidden');
    document.querySelectorAll('.shared-notes-dialog').forEach(dialog => dialog.close());
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
        if (searchMatch && Number.isFinite(searchMatch.firstMatchIndex) && searchMatch.firstMatchIndex >= 0) {
            scrollToLine(searchMatch.firstMatchIndex);
            syncScroll();
        }
    }
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
    if (isEditorFindOpenShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        openFindWidget(false);
        return;
    }

    if (isEditorReplaceOpenShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        openFindWidget(true);
        return;
    }

    const findState = editorFindReplaceManager.getState();
    if (findState.isOpen && isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }

    const isCursorHistoryBack = isEditorCursorHistoryBackShortcut(event, EDITOR_CONFIG);
    const isCursorHistoryForward = isEditorCursorHistoryForwardShortcut(event, EDITOR_CONFIG);
    if (isCursorHistoryBack || isCursorHistoryForward) {
        event.preventDefault();
        const handled = isCursorHistoryForward
            ? editorCursorHistoryManager.moveForward()
            : editorCursorHistoryManager.moveBack();
        if (handled) syncScroll();
        return;
    }

    if (isEditorSaveShortcut(event)) {
        event.preventDefault();
        runFormatAndSave();
        return;
    }

    if (isEditorUndoShortcut(event) || isEditorRedoShortcut(event)) {
        event.preventDefault();
        const command = isEditorRedoShortcut(event) ? 'redo' : 'undo';
        const handled = runNativeEditCommand(document, command);
        if (handled) {
            setTimeout(handleEditorInput, 0);
        }
        return;
    }

    if (event.key !== 'Tab' && event.code !== 'Tab') return;
    event.preventDefault();
    const isShift = event.shiftKey || event.getModifierState('Shift');
    if (isShift) {
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
    if (isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (isEditorFindPreviousShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        editorFindReplaceManager.findPrevious({ focusEditor: false });
        syncScrollToActiveMatch();
        return;
    }
    if (isEditorFindNextShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        editorFindReplaceManager.findNext({ focusEditor: false });
        syncScrollToActiveMatch();
    }
}

function handleReplaceInput() {
    editorFindReplaceManager.setReplaceText(EL.editorReplaceInput.value);
}

function handleReplaceInputKeydown(event) {
    if (isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (!isEditorFindNextShortcut(event, EDITOR_CONFIG)) return;
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
        onMoveFile: (fileId, targetFolderId) => moveFileById(fileId, targetFolderId)
    });
    treeOptions.pendingCopyFileIds = pendingCopyFileIds;
    treeOptions.fileSearchState = fileSearchState;
    UI.renderFileTree(EL.fileTree, workspace, treeOptions);
    updateTreeSearchMeta(fileSearchState);
    updateFolderToggleButtonState();
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

    if (EL.checklistContextColor) {
        EL.checklistContextColor.hidden = !target.isDivider;
    }

    if (EL.checklistContextDetail) {
        EL.checklistContextDetail.hidden = target.isDivider === true;
    }

    const menuWidth = 160;
    const menuHeight = 40;
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
    const left = Math.min(Math.max(8, target.x), maxLeft);
    const top = Math.min(Math.max(8, target.y), maxTop);

    EL.checklistContextMenu.style.left = `${left}px`;
    EL.checklistContextMenu.style.top = `${top}px`;
    EL.checklistContextMenu.hidden = false;
}

function closeChecklistContextMenu() {
    if (!EL.checklistContextMenu) return;
    EL.checklistContextMenu.hidden = true;
    checklistContextTarget = null;
}

function openShortcutsModal() {
    if (EL.shortcutsModal) EL.shortcutsModal.classList.remove('is-hidden');
    if (EL.shortcutsBackdrop) EL.shortcutsBackdrop.classList.remove('is-hidden');
}

function closeShortcutsModal() {
    if (EL.shortcutsModal) EL.shortcutsModal.classList.add('is-hidden');
    if (EL.shortcutsBackdrop) EL.shortcutsBackdrop.classList.add('is-hidden');
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

function handleChecklistContextColorClick(event) {
    const btn = event.target.closest('[data-color]');
    if (!btn || checklistContextTarget == null) return;
    const idx = checklistContextTarget.index;
    if (!currentData || !Array.isArray(currentData.steps)) return;
    const step = currentData.steps[idx];
    if (!step || !UI.isChecklistDividerStep(step)) return;

    const color = btn.dataset.color || '';
    const textValue = UI.normalizeChecklistDividerValue(step.divider) || true;
    step.divider = UI.buildChecklistDividerData(textValue, color);
    syncToEditor();
    renderChecklist();
    closeChecklistContextMenu();
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

    file.folderId = targetFolderId;
    file.name = nextName;
    file.updatedAt = nowTs();

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
    const nextName = Workspace.getNextAvailableFileName(workspace, folderId, trimmedName);
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
    const insertChecklistEntry = (insertIndex, entry) => {
        if (!currentData || !Array.isArray(currentData.steps)) return;
        const safeInsertIndex = Math.max(0, Math.min(Number(insertIndex) || 0, currentData.steps.length));
        currentData.steps.splice(safeInsertIndex, 0, entry);
        syncToEditor();
        renderChecklist();
    };

    UI.renderChecklist(EL.checklistBody, currentData, {
        onUpdatePass: (idx, val) => {
            currentData.steps[idx].pass = val;
            syncToEditor();
        },
        onUpdateStep: (idx, field, val) => {
            if (field === 'divider') {
                currentData.steps[idx].divider = val;
                syncToEditor();
                return;
            }
            if (isStepArrayField(field)) {
                currentData.steps[idx][field] = toChecklistArray(val);
            } else {
                currentData.steps[idx][field] = val;
            }
            syncToEditor();
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
        onAddStep: (insertIndex) => {
            insertChecklistEntry(insertIndex, JSON.parse('{"given":[],"when":[],"then":[],"pass":false}'));
        },
        onAddDivider: (insertIndex) => {
            insertChecklistEntry(insertIndex, { divider: true });
        },
        onOpenChecklistContextMenu: openChecklistContextMenu,
        onOpenStepDetail: openStepDetailPanel,
        activeNoteIndex: stepDetailIndex,
        activeNoteKey: stepDetailActiveNote,
        activeFilter: checklistFilter
    });
    refreshPassSummary();
    refreshStepDetailPanel();
    clearHighlightIfNoSelection();
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
    if (checklistFilter.startsWith('shared:') && EL.checklistFilterLabel) {
        const id = checklistFilter.slice(7);
        EL.checklistFilterLabel.textContent = `🔗 ${currentData?.sharedNotes?.[id]?.label || id}`;
    }
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
    UI.NOTE_TONES.forEach((tone) => {
        EL.checklistFilterToggle.classList.toggle(`is-tone-${tone}`, checklistFilter === tone);
    });
    EL.checklistFilterToggle.classList.toggle('is-filtered', checklistFilter !== 'all');
}

function openChecklistFilterMenu() {
    if (!EL.checklistFilterMenu) return;
    EL.checklistFilterMenu.querySelectorAll('[data-shared-filter]').forEach(el => el.remove());
    const sharedEntries = Object.entries(currentData?.sharedNotes || {});
    const sharedGroup = document.createElement('div');
    sharedGroup.dataset.sharedFilter = 'true';
    sharedGroup.setAttribute('role', 'group');
    sharedGroup.setAttribute('aria-labelledby', 'checklist-shared-group-label');
    const sharedTitle = document.createElement('div');
    sharedTitle.id = 'checklist-shared-group-label';
    sharedTitle.className = 'checklist-filter-group-label';
    sharedTitle.textContent = 'Shared Notes';
    sharedGroup.append(sharedTitle);
    if (sharedEntries.length) {
        const separator = document.createElement('div');
        separator.className = 'checklist-filter-separator';
        separator.dataset.sharedFilter = 'true';
        separator.setAttribute('role', 'separator');
        EL.checklistFilterMenu.append(separator, sharedGroup);
    }
    sharedEntries.forEach(([id, note]) => {
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'checklist-filter-item';
        item.dataset.sharedFilter = 'true'; item.dataset.filter = `shared:${id}`;
        item.setAttribute('role', 'option');
        item.textContent = `🔗 ${note.label || id} (${sharedNoteUsage(id)})`;
        item.addEventListener('click', () => {
            setChecklistFilter(item.dataset.filter); closeChecklistFilterMenu({ restoreFocus: true });
        });
        item.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); moveChecklistFilterFocus(item, event.key === 'ArrowDown' ? 1 : -1);
            }
        });
        sharedGroup.append(item);
    });
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

let sharedNoteTarget = null;

function getStepDetailTarget() {
    if (!currentData) return null;
    if (sharedNoteTarget) return sharedNoteTarget;
    if (stepDetailIndex === null) return null;
    const step = currentData?.steps?.[stepDetailIndex];
    if (!step || UI.isChecklistDividerStep(step)) return null;
    return step;
}

function openStepDetailPanel(index, target = { type: 'panel' }) {
    closeStepDetailPanel();
    sharedNoteTarget = null;
    stepDetailIndex = index;
    const step = getStepDetailTarget();
    if (!step) {
        closeStepDetailPanel();
        return;
    }

    const requested = target || { type: 'panel' };
    let focusNoteIndex = null;

    if (requested.type === 'new') {
        // Append an empty note and focus its label so the user can name it.
        const notes = UI.getChecklistNotes(step, currentData);
        notes.push(UI.createEmptyNoteEntry());
        focusNoteIndex = notes.length - 1;
        stepDetailActiveNote = focusNoteIndex;
        commitStepDetailNotes(notes, { refreshPanel: false, keepEmpty: true });
    } else if (requested.type === 'note' && Number.isInteger(requested.noteIndex)) {
        focusNoteIndex = requested.noteIndex;
        stepDetailActiveNote = focusNoteIndex;
    } else {
        stepDetailActiveNote = null;
    }

    EL.stepDetailPanel?.classList.remove('is-hidden');
    EL.stepDetailBackdrop?.classList.remove('is-hidden');
    EL.stepDetailBackdrop?.setAttribute('aria-hidden', 'false');
    // renderChecklist repaints the table for the active style and calls
    // refreshStepDetailPanel, which paints the notes.
    renderChecklist();
    focusStepDetailNote(focusNoteIndex);
}

function focusStepDetailNote(noteIndex) {
    const cards = EL.stepDetailNotes?.querySelectorAll('.step-detail-note-card');
    if (!cards || cards.length === 0) {
        EL.stepDetailAddNote?.focus();
        return;
    }
    const card = Number.isInteger(noteIndex) ? cards[noteIndex] : cards[0];
    if (!card) return;
    card.scrollIntoView({ block: 'nearest' });
    const field = card.querySelector('.step-detail-label-input')
        || card.querySelector('.step-detail-input');
    if (field) {
        field.focus();
        if (typeof field.select === 'function') field.select();
    }
}

function closeStepDetailPanel() {
    const hadTarget = stepDetailIndex !== null;
    // Flush pending editor text before the instances are torn down, so that
    // closing with Escape keeps what was typed.
    flushStepDetailCodeEditors();
    // Blocks and notes left empty are only useful while the panel is open;
    // drop them so they do not linger in the saved JSON.
    pruneEmptyStepDetailEntries();
    stepDetailIndex = null;
    sharedNoteTarget = null;
    stepDetailActiveNote = null;
    destroyStepDetailCodeEditors();
    closeNoteBlockAddMenu();
    EL.stepDetailPanel?.classList.add('is-hidden');
    EL.stepDetailBackdrop?.classList.add('is-hidden');
    EL.stepDetailBackdrop?.setAttribute('aria-hidden', 'true');
    if (hadTarget) renderChecklist();
}

function refreshStepDetailPanel() {
    if (stepDetailIndex === null && !sharedNoteTarget) return;
    if (!getStepDetailTarget()) {
        closeStepDetailPanel();
        return;
    }
    if (EL.stepDetailPanel?.contains(document.activeElement)) return;
    renderStepDetailContents();
}

function pruneEmptyStepDetailEntries() {
    const step = getStepDetailTarget();
    if (!step || !Array.isArray(step.notes)) return;

    const pruned = [];
    step.notes.forEach((note) => {
        const entry = UI.normalizeNoteEntry(note);
        if (entry) pruned.push(entry);
    });

    const before = JSON.stringify(step.notes);
    if (pruned.length === 0) delete step.notes;
    else step.notes = UI.serializeNotes(pruned);

    if (before !== JSON.stringify(step.notes)) syncToEditor();
}

function flushStepDetailCodeEditors() {
    stepDetailCodeEditors.forEach((entry) => {
        if (typeof entry.flush === 'function') entry.flush();
    });
}

function destroyStepDetailCodeEditors() {
    stepDetailCodeEditors.forEach((entry) => {
        try {
            entry.editor.destroy();
        } catch (_) { /* already gone */ }
    });
    stepDetailCodeEditors = [];
}

function commitStepDetailNotes(notes, options = {}) {
    const { refreshPanel = false, keepEmpty = false } = options;
    const step = getStepDetailTarget();
    if (!step) return;

    const normalized = [];
    notes.forEach((note) => {
        if (note.ref && !note.missing && note.blocks && Object.hasOwn(currentData.sharedNotes || {}, note.ref)) {
            const { ref, missing, ...content } = note;
            currentData.sharedNotes[ref] = UI.normalizeNoteEntry(content, { keepEmpty: true });
        }
        const entry = UI.normalizeNoteEntry(note, { keepEmpty });
        if (entry) normalized.push(entry);
    });

    // Older shapes (`ref`, flat `note`) are folded into `notes` on first write.
    if (UI.hasLegacyChecklistNoteShape(step)) {
        delete step.ref;
        delete step.note;
    }

    if (normalized.length === 0) delete step.notes;
    else step.notes = UI.serializeNotes(normalized);

    syncToEditor();
    renderChecklist();
    if (refreshPanel) renderStepDetailContents();
}

function renderStepDetailContents() {
    const step = getStepDetailTarget();
    if (!step || !EL.stepDetailNotes) return;

    if (EL.stepDetailTitle) {
        EL.stepDetailTitle.textContent = sharedNoteTarget ? '공유 노트' : `Step ${countVisibleStepNumber(stepDetailIndex)}`;
    }

    destroyStepDetailCodeEditors();

    EL.stepDetailAddNote.hidden = false;
    const notes = UI.getChecklistNotes(step, currentData);
    EL.stepDetailNotes.innerHTML = '';
    if (EL.stepDetailNotesEmpty) {
        EL.stepDetailNotesEmpty.hidden = notes.length > 0;
    }

    notes.forEach((note, noteIndex) => {
        EL.stepDetailNotes.appendChild(buildNoteCard(note, noteIndex, notes));
    });
}

const NOTE_BLOCK_META = {
    link: { title: 'Link', placeholder: 'https://...' },
    text: { title: 'Text', placeholder: '원문이나 메모를 입력하세요.' },
    code: { title: 'Code', placeholder: '' }
};

const NOTE_TONE_LABELS = {
    note: 'Note (파랑)',
    tip: 'Tip (초록)',
    important: 'Important (자주)',
    warning: 'Warning (노랑)',
    caution: 'Caution (빨강)'
};

function buildNoteTonePicker(note, patchNote) {
    const current = UI.normalizeNoteTone(note.tone);
    const dropdown = createNoteDropdown(current || '색상');
    if (current) dropdown.toggle.classList.add('is-filtered', `is-tone-${current}`);
    ['', ...UI.NOTE_TONES].forEach(tone => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'checklist-filter-item';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(current === tone));
        item.classList.toggle('is-selected', current === tone);
        const swatch = document.createElement('span');
        swatch.className = tone ? `checklist-filter-swatch is-tone-${tone}`
            : 'checklist-filter-swatch checklist-filter-swatch--none';
        swatch.setAttribute('aria-hidden', 'true');
        item.append(swatch, document.createTextNode(tone || '기본 (색 없음)'));
        item.addEventListener('click', () => {
            dropdown.close();
            patchNote({ tone }, { refreshPanel: true });
        });
        dropdown.body.append(item);
    });
    return dropdown.element;
}

function setActiveStepDetailNote(noteIndex) {
    stepDetailActiveNote = noteIndex;
    EL.stepDetailNotes?.querySelectorAll('.step-detail-note-card').forEach((card, index) => {
        card.classList.toggle('is-active', index === noteIndex);
    });
    EL.checklistBody?.querySelectorAll('.is-note-active .checklist-note-chip-group').forEach((chip, index) => {
        chip.classList.toggle('is-active', index === noteIndex);
    });
}

function buildNoteCard(note, noteIndex, notes) {
    const card = document.createElement('section');
    card.className = 'step-detail-note-card';
    card.addEventListener('focusin', () => setActiveStepDetailNote(noteIndex));
    card.addEventListener('pointerdown', () => setActiveStepDetailNote(noteIndex));
    const cardTone = UI.normalizeNoteTone(note.tone);
    if (cardTone) card.classList.add(`is-tone-${cardTone}`);
    if (stepDetailActiveNote === noteIndex) card.classList.add('is-active');

    const commitNotes = (nextNotes, options) => {
        // Keep event-handler objects current across successive input events.
        nextNotes.forEach((next, i) => {
            if (nextNotes.length === notes.length && notes[i]) Object.assign(notes[i], next);
        });
        commitStepDetailNotes(nextNotes, { keepEmpty: true, ...options });
    };

    const patchNote = (patch, options) => {
        const next = notes.map((item, itemIndex) => (
            itemIndex === noteIndex ? { ...item, ...patch } : item
        ));
        commitNotes(next, options);
    };

    const head = document.createElement('div');
    head.className = 'step-detail-note-head';

    const labelField = document.createElement('input');
    labelField.type = 'text';
    labelField.className = 'step-detail-label-input';
    labelField.value = note.label || '';
    labelField.placeholder = 'Label (표에 표시됩니다)';
    labelField.setAttribute('aria-label', 'Note label');
    // Saving on every keystroke keeps the table chip in sync and means nothing
    // is lost when the panel is closed with Escape.
    labelField.addEventListener('input', () => {
        patchNote({ label: labelField.value });
    });
    head.appendChild(labelField);
    head.appendChild(buildNoteTonePicker(note, patchNote));

    const actions = document.createElement('div');
    actions.className = 'step-detail-note-actions';

    const moveNote = (offset) => {
        const target = noteIndex + offset;
        if (target < 0 || target >= notes.length) return;
        const next = notes.map(item => ({ ...item }));
        const [moved] = next.splice(noteIndex, 1);
        next.splice(target, 0, moved);
        stepDetailActiveNote = target;
        commitNotes(next, { refreshPanel: true });
    };

    const iconButton = (label, title, onClick, disabled, danger) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = danger
            ? 'step-detail-icon-btn is-danger'
            : 'step-detail-icon-btn';
        const iconKinds = { '×': 'trash', '⎘': 'copy', '↑': 'up', '↓': 'down' };
        if (iconKinds[label]) {
            btn.append(createNoteActionIcon(iconKinds[label]));
            btn.classList.add('has-action-icon');
        } else btn.textContent = label;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.disabled = disabled === true;
        btn.addEventListener('click', onClick);
        actions.appendChild(btn);
    };

    iconButton('↑', 'Move note up', () => moveNote(-1), noteIndex === 0);
    iconButton('↓', 'Move note down', () => moveNote(1), noteIndex === notes.length - 1);
    iconButton('×', note.ref ? '이 행에서 연결 제거' : 'Delete note', () => {
        stepDetailActiveNote = null;
        commitStepDetailNotes(
            notes.filter((_, itemIndex) => itemIndex !== noteIndex),
            { refreshPanel: true, keepEmpty: true }
        );
    }, false, true);

    if (!note.missing) {
        const dropdown = createNoteDropdown('공유');
        const action = (label, callback) => {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = label;
            button.className = 'checklist-filter-item';
            button.setAttribute('role', 'menuitem');
            button.addEventListener('click', () => { dropdown.close(); callback(); });
            dropdown.body.append(button);
        };
        if (!note.ref) action('새 공유 노트로 전환', () => {
            const id = createSharedNote(note);
            notes[noteIndex] = { ref: id };
            commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });
        });
        action('기존 공유 노트에 병합…', () => {
            openSharedNotePicker(false, id => {
                if (note.ref) {
                    const targetLabel = currentData.sharedNotes[id]?.label || id;
                    if (!confirm(`“${note.label || note.ref}”을 “${targetLabel}”에 병합할까요?\n블록을 대상 뒤에 추가하고, 원본을 사용하는 ${sharedNoteUsage(note.ref)}개 행의 연결을 대상으로 바꾼 뒤 원본을 제거합니다. 대상의 이름과 색상은 유지됩니다.`)) return;
                    if (!UI.mergeSharedNotes(currentData, note.ref, id)) return;
                    if (sharedNoteTarget) sharedNoteTarget.notes = [{ ref: id }];
                    if (checklistFilter === `shared:${note.ref}`) {
                        setChecklistFilter(`shared:${id}`);
                    }
                } else {
                    const step = getStepDetailTarget();
                    if (!step || !UI.mergeLocalNoteIntoShared(step, currentData, noteIndex, id)) return;
                }
                syncToEditor(); renderChecklist(); renderStepDetailContents();
            }, note.ref);
        });
        actions.prepend(dropdown.element);
    }
    if (note.ref) {
        if (!sharedNoteTarget && !note.missing) iconButton('⎘', '행 노트로 복사하고 연결 해제', () => {
            const { ref, missing, ...content } = note;
            notes[noteIndex] = structuredClone(content);
            commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });
        });
    }
    head.appendChild(actions);
    card.appendChild(head);
    if (note.ref) {
        const notice = document.createElement('p');
        notice.textContent = note.missing ? `깨진 참조: ${note.ref}`
            : `공유 노트 · ${sharedNoteUsage(note.ref)}개 행에서 사용 중. 수정하면 모든 연결에 반영됩니다.`;
        card.appendChild(notice);
        if (sharedNoteTarget) actions.querySelector('.is-danger')?.remove();
        if (note.missing) {
            labelField.disabled = true;
            return card;
        }
    }

    const blockList = document.createElement('div');
    blockList.className = 'step-detail-block-list';
    note.blocks.forEach((block, blockIndex) => {
        blockList.appendChild(buildNoteBlockRow(block, blockIndex, note, noteIndex, notes, commitNotes));
    });
    card.appendChild(blockList);

    const addWrap = document.createElement('div');
    addWrap.className = 'step-detail-block-add';
    NOTE_BLOCK_TYPE_ORDER.forEach((type) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'step-detail-block-add-btn';
        btn.textContent = `+ ${NOTE_BLOCK_META[type].title}`;
        btn.addEventListener('click', () => {
            const nextBlocks = note.blocks.concat([createSeedBlock(type)]);
            stepDetailActiveNote = noteIndex;
            patchNote({ blocks: nextBlocks }, { refreshPanel: true });
            const cards = EL.stepDetailNotes?.querySelectorAll('.step-detail-note-card');
            const rows = cards?.[noteIndex]?.querySelectorAll('.step-detail-block');
            const field = rows?.[rows.length - 1]?.querySelector('.step-detail-input');
            if (field) {
                field.focus();
                if (typeof field.select === 'function') field.select();
            }
        });
        addWrap.appendChild(btn);
    });
    card.appendChild(addWrap);

    return card;
}

const NOTE_BLOCK_TYPE_ORDER = ['link', 'text', 'code'];

// New blocks start empty so the placeholder is visible; they survive the
// commit because the panel normalizes with keepEmpty.
function createSeedBlock(type) {
    if (type === 'link') return { type: 'link', value: '' };
    // A new code block reuses the language picked last, which is almost always
    // the one wanted again.
    if (type === 'code') return { type: 'code', value: '', lang: readRememberedCodeLang() };
    return { type: 'text', value: '' };
}

function getSupportedCodeLanguages() {
    const languages = window.QaCodeMirror?.SUPPORTED_LANGUAGES;
    return Array.isArray(languages) ? languages : [];
}

function readRememberedCodeLang() {
    let stored = null;
    try {
        stored = localStorage.getItem(NOTE_CODE_LANG_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }

    if (stored === null) return DEFAULT_NOTE_CODE_LANG;
    // An empty string is a real choice (plain text), so it is kept as-is.
    if (stored === '') return '';

    const supported = getSupportedCodeLanguages();
    // A remembered language can disappear when the bundle changes.
    if (supported.length > 0 && !supported.includes(stored)) return DEFAULT_NOTE_CODE_LANG;
    return stored;
}

function rememberCodeLang(lang) {
    const next = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
    if (next && !getSupportedCodeLanguages().includes(next)) return;
    try {
        localStorage.setItem(NOTE_CODE_LANG_STORAGE_KEY, next);
    } catch (_) { /* storage unavailable */ }
}

function buildNoteBlockRow(block, blockIndex, note, noteIndex, notes, commitNotes) {
    const meta = NOTE_BLOCK_META[block.type] || NOTE_BLOCK_META.text;
    const row = document.createElement('div');
    row.className = `step-detail-block step-detail-block--${block.type}`;

    const patchBlock = (patch, options) => {
        const nextBlocks = note.blocks.map((item, itemIndex) => (
            itemIndex === blockIndex ? { ...item, ...patch } : item
        ));
        const next = notes.map((item, itemIndex) => (
            itemIndex === noteIndex ? { ...item, blocks: nextBlocks } : item
        ));
        commitNotes(next, options);
    };

    const head = document.createElement('div');
    head.className = 'step-detail-block-head';

    const kind = document.createElement('span');
    kind.className = 'step-detail-block-kind';
    kind.textContent = meta.title;
    head.appendChild(kind);

    if (block.type === 'code') {
        const langSelect = document.createElement('select');
        langSelect.className = 'step-detail-lang-select';
        langSelect.setAttribute('aria-label', 'Code language');
        const languages = window.QaCodeMirror?.SUPPORTED_LANGUAGES || [];
        [''].concat(languages).forEach((lang) => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang || 'plain';
            if ((block.lang || '') === lang) option.selected = true;
            langSelect.appendChild(option);
        });
        langSelect.addEventListener('change', () => {
            // Language changes the editor extensions, so the row is rebuilt.
            stepDetailActiveNote = noteIndex;
            rememberCodeLang(langSelect.value);
            patchBlock({ lang: langSelect.value }, { refreshPanel: true });
        });
        head.appendChild(langSelect);
    }

    const headSpacer = document.createElement('span');
    headSpacer.className = 'step-detail-block-head-spacer';
    head.appendChild(headSpacer);

    // A link block gets an open control so the reference can be checked while
    // the note is being edited.
    if (block.type === 'link' && UI.isSafeChecklistRefLink(block.value)) {
        const openLink = document.createElement('a');
        openLink.className = 'step-detail-icon-btn has-action-icon step-detail-open-link';
        openLink.href = block.value;
        openLink.target = 'qa-scenario-reference';
        openLink.rel = 'noopener noreferrer';
        openLink.append(createNoteActionIcon('external'));
        openLink.title = `Open ${block.value}`;
        openLink.setAttribute('aria-label', 'Open link in a new tab');
        head.appendChild(openLink);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'step-detail-icon-btn is-danger';
    removeBtn.append(createNoteActionIcon('trash'));
    removeBtn.classList.add('has-action-icon');
    removeBtn.title = 'Remove block';
    removeBtn.setAttribute('aria-label', 'Remove block');
    removeBtn.addEventListener('click', () => {
        const nextBlocks = note.blocks.filter((_, itemIndex) => itemIndex !== blockIndex);
        const next = notes.map((item, itemIndex) => (
            itemIndex === noteIndex ? { ...item, blocks: nextBlocks } : item
        ));
        stepDetailActiveNote = noteIndex;
        commitNotes(next, { refreshPanel: true });
    });
    head.appendChild(removeBtn);
    row.appendChild(head);

    if (block.type === 'code') {
        const host = document.createElement('div');
        host.className = 'step-detail-code-host';
        row.appendChild(host);

        const factory = window.QaCodeMirror?.createCodeEditor;
        if (typeof factory === 'function') {
            let pending = block.value;
            const editor = factory({
                parent: host,
                doc: block.value,
                lang: block.lang || '',
                placeholder: 'Paste code here',
                onChange: (value) => {
                    pending = value;
                    patchBlock({ value });
                }
            });
            // `flush` lets the panel persist text if it is torn down before the
            // editor reports a change (for example when closing with Escape).
            stepDetailCodeEditors.push({
                editor,
                flush: () => {
                    if (pending !== block.value) patchBlock({ value: pending });
                }
            });
        } else {
            const fallback = document.createElement('textarea');
            fallback.className = 'step-detail-input';
            fallback.rows = 5;
            fallback.value = block.value;
            fallback.addEventListener('input', () => patchBlock({ value: fallback.value }));
            host.appendChild(fallback);

            const warn = document.createElement('p');
            warn.className = 'step-detail-code-warning';
            warn.textContent = 'CodeMirror 번들이 없어 일반 textarea로 표시합니다. npm install && npm run build 를 실행하세요.';
            row.appendChild(warn);
        }
        return row;
    }

    const isMultiline = block.type === 'text';
    const input = isMultiline
        ? document.createElement('textarea')
        : document.createElement('input');
    if (isMultiline) input.rows = 3;
    else input.type = 'text';
    input.className = 'step-detail-input';
    input.value = block.value;
    input.placeholder = meta.placeholder;
    input.addEventListener('input', () => {
        patchBlock({ value: input.value });
    });
    row.appendChild(input);

    if (block.type === 'link') {
        const labelField = document.createElement('label');
        labelField.className = 'step-detail-field';

        const caption = document.createElement('span');
        caption.className = 'step-detail-field-label';
        caption.textContent = 'Link label (optional)';

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'step-detail-input';
        labelInput.value = block.label || '';
        labelInput.placeholder = 'PRD';
        labelInput.addEventListener('input', () => {
            patchBlock({ label: labelInput.value });
        });

        labelField.appendChild(caption);
        labelField.appendChild(labelInput);
        row.appendChild(labelField);
    }

    return row;
}

function appendNoteFromPanel() {
    const step = getStepDetailTarget();
    if (!step) return;
    const notes = UI.getChecklistNotes(step, currentData);
    notes.push(UI.createEmptyNoteEntry());
    stepDetailActiveNote = notes.length - 1;
    commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });
    focusStepDetailNote(stepDetailActiveNote);
}

function closeNoteBlockAddMenu() {
    // Kept for compatibility with the shared Escape handler.
}

function countVisibleStepNumber(targetIndex) {
    const steps = currentData?.steps;
    if (!Array.isArray(steps)) return 1;
    let visible = 0;
    for (let i = 0; i <= targetIndex && i < steps.length; i += 1) {
        if (!UI.isChecklistDividerStep(steps[i])) visible += 1;
    }
    return visible;
}

function applyStepDetailPanelWidth(width, options = {}) {
    const { persist = true } = options;
    if (!EL.stepDetailPanel) return;

    // The panel is right-anchored, so the drag handle on its left edge grows
    // the panel as it moves left.
    const maxWidth = Math.max(NOTE_PANEL_MIN_WIDTH, window.innerWidth - 80);
    const next = Math.round(Math.min(Math.max(width, NOTE_PANEL_MIN_WIDTH), maxWidth));

    EL.stepDetailPanel.style.setProperty('--step-detail-panel-width', `${next}px`);

    if (persist) {
        try {
            localStorage.setItem(NOTE_PANEL_WIDTH_STORAGE_KEY, String(next));
        } catch (_) { /* storage unavailable */ }
    }
}

function readStoredNotePanelWidth() {
    let stored = null;
    try {
        stored = localStorage.getItem(NOTE_PANEL_WIDTH_STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }

    const parsed = Number.parseInt(stored ?? '', 10);
    return Number.isFinite(parsed) ? parsed : NOTE_PANEL_DEFAULT_WIDTH;
}

function setupStepDetailPanelResizing() {
    applyStepDetailPanelWidth(readStoredNotePanelWidth(), { persist: false });

    if (!EL.stepDetailResizer) return;

    let isResizing = false;
    let draggedWidth = null;

    EL.stepDetailResizer.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        isResizing = true;
        draggedWidth = null;
        document.body.classList.add('is-resizing');
        EL.stepDetailResizer.classList.add('resizing');
    });

    window.addEventListener('mousemove', (event) => {
        if (!isResizing) return;
        draggedWidth = window.innerWidth - event.clientX;
        applyStepDetailPanelWidth(draggedWidth, { persist: false });
    });

    const stopResizing = () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.classList.remove('is-resizing');
        EL.stepDetailResizer.classList.remove('resizing');
        // Persist once at the end instead of on every mousemove.
        if (draggedWidth !== null) applyStepDetailPanelWidth(draggedWidth);
        draggedWidth = null;
    };

    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('mouseleave', stopResizing);

    // A width stored on a large screen would overflow a smaller window. The
    // preference is re-clamped rather than the rendered width, so widening the
    // window again restores the width the user actually chose.
    window.addEventListener('resize', () => {
        if (isResizing) return;
        applyStepDetailPanelWidth(readStoredNotePanelWidth(), { persist: false });
    });
}

function setupStepDetailPanel() {
    EL.stepDetailClose?.replaceChildren(createNoteActionIcon('close'));
    document.addEventListener('click', event => {
        document.querySelectorAll('.note-dropdown').forEach(dropdown => {
            if (!dropdown.contains(event.target)) dropdown.closeMenu();
        });
    });
    document.getElementById('shared-notes-library').addEventListener('click', () => openSharedNotePicker(false));
    const addDropdown = createNoteDropdown('+ Add');
    const addActions = [
        ['새 노트', () => appendNoteFromPanel(), true],
        ['새 공유 노트', () => {
            const id = createSharedNote({ label: '새 공유 노트', blocks: [] });
            if (sharedNoteTarget) {
                syncToEditor();
                openSharedNoteEditor(id);
            } else {
                const step = getStepDetailTarget();
                if (!step) return;
                const notes = UI.getChecklistNotes(step, currentData);
                notes.push({ ref: id });
                commitStepDetailNotes(notes, { refreshPanel: true, keepEmpty: true });
                focusStepDetailNote(notes.length - 1);
            }
        }, false],
        ['공유 노트 연결', () => openSharedNotePicker(true), true]
    ];
    addActions.forEach(([label, action, needsRow]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'checklist-filter-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = label;
        item.addEventListener('click', () => { addDropdown.close(); action(); });
        addDropdown.body.append(item);
        const updateAvailability = () => {
            item.disabled = needsRow && Boolean(sharedNoteTarget);
        };
        addDropdown.toggle.addEventListener('click', updateAvailability, true);
        addDropdown.toggle.addEventListener('keydown', updateAvailability, true);
    });
    EL.stepDetailAddNote.replaceWith(addDropdown.element);
    addDropdown.toggle.id = 'step-detail-add-note';
    EL.stepDetailAddNote = addDropdown.toggle;
    EL.stepDetailClose?.addEventListener('click', closeStepDetailPanel);
    EL.stepDetailBackdrop?.addEventListener('click', closeStepDetailPanel);
    setupStepDetailPanelResizing();

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (stepDetailIndex === null && !sharedNoteTarget) return;
        if (!EL.stepDetailPanel || EL.stepDetailPanel.classList.contains('is-hidden')) return;
        // A code editor's search panel binds Escape to close itself. Let
        // CodeMirror handle it instead of closing the whole notes panel.
        if (EL.stepDetailPanel.querySelector('.cm-panels')) return;
        // Both handlers sit on `document`, where stopPropagation does not stop
        // a sibling listener, so the open filter menu is checked directly.
        if (EL.checklistFilterMenu && !EL.checklistFilterMenu.hidden) return;
        event.preventDefault();
        closeStepDetailPanel();
    });
}

function toChecklistArray(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => (item == null ? '' : String(item).trim()))
            .filter(Boolean);
    }
    if (value == null) return [];
    return String(value)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
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

function flushAutosaveAndPersist() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    persist();
}

function applyImportedWorkspace(data, options = {}) {
    workspace = Workspace.normalizeWorkspace(data);
    restoreActiveFileFromLocation(workspace, options.lastActiveFileLocation);
    persist();
    loadActiveFile();
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

    applyImportedWorkspace(loaded.workspace, { lastActiveFileLocation });
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
    if (EL.checklistContextDetail) {
        EL.checklistContextDetail.addEventListener('click', () => {
            if (checklistContextTarget == null) return;
            const idx = checklistContextTarget.index;
            closeChecklistContextMenu();
            openStepDetailPanel(idx);
        });
    }
    if (EL.checklistContextDelete) {
        EL.checklistContextDelete.addEventListener('click', handleChecklistContextDelete);
    }
    if (EL.checklistContextColor) {
        EL.checklistContextColor.addEventListener('click', handleChecklistContextColorClick);
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
    if (!isEditorUndoShortcut(event, EDITOR_CONFIG)) return;
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

init();


function sharedNoteUsage(id) {
    return (currentData?.steps || []).filter(step => !UI.isChecklistDividerStep(step)
        && step.notes?.some(note => note.ref === id)).length;
}

function createSharedNote(note = UI.createEmptyNoteEntry()) {
    const id = `note-${crypto.randomUUID()}`;
    if (!currentData.sharedNotes || typeof currentData.sharedNotes !== 'object' || Array.isArray(currentData.sharedNotes)) {
        currentData.sharedNotes = {};
    }
    const { ref, missing, ...content } = note;
    currentData.sharedNotes[id] = structuredClone(content);
    return id;
}

function openSharedNoteEditor(id) {
    closeStepDetailPanel();
    sharedNoteTarget = { notes: [{ ref: id }] };
    EL.stepDetailPanel.classList.remove('is-hidden');
    EL.stepDetailBackdrop.classList.remove('is-hidden');
    EL.stepDetailBackdrop.setAttribute('aria-hidden', 'false');
    renderStepDetailContents();
    focusStepDetailNote(0);
}

function openSharedNotePicker(linkToRow, onSelect = null, excludedId = null) {
    if (!currentData) return;
    flushStepDetailCodeEditors();
    const target = linkToRow ? getStepDetailTarget() : null;
    if (linkToRow && !target) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'shared-notes-dialog';
    const header = document.createElement('div');
    header.className = 'shortcuts-modal-header';
    const title = document.createElement('h3');
    header.append(title);
    title.textContent = onSelect ? '병합할 공유 노트 선택' : linkToRow ? '공유 노트 연결' : '공유 노트';
    const search = document.createElement('input');
    search.className = 'step-detail-input';
    search.placeholder = '공유 노트 검색…';
    search.setAttribute('aria-label', '공유 노트 검색');
    const list = document.createElement('div');
    const button = (label, action) => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'step-detail-add-btn';
        el.textContent = label; el.addEventListener('click', action);
        return el;
    };
    const choose = id => {
        dialog.close();
        if (onSelect) return onSelect(id);
        if (!linkToRow) return openSharedNoteEditor(id);
        const notes = UI.getChecklistNotes(target, currentData);
        if (!notes.some(note => note.ref === id)) notes.push({ ref: id });
        commitStepDetailNotes(notes, { keepEmpty: true, refreshPanel: true });
        focusStepDetailNote(notes.findIndex(note => note.ref === id));
    };
    const paint = () => {
        list.replaceChildren();
        Object.entries(currentData.sharedNotes || {}).forEach(([id, note]) => {
            if (id === excludedId) return;
            const label = note?.label || id;
            if (!label.toLowerCase().includes(search.value.toLowerCase())) return;
            const row = document.createElement('div');
            row.className = 'shared-note-list-row';
            row.append(button(`${label} · ${sharedNoteUsage(id)}개 행`, () => choose(id)));
            if (!linkToRow && !onSelect) {
                row.append(button('삭제', () => {
                    if (sharedNoteUsage(id)) return alert('연결된 행이 있습니다. 먼저 각 행의 연결을 제거하세요.');
                    if (!confirm(`공유 노트 “${label}”을 삭제할까요?`)) return;
                    if (sharedNoteTarget?.notes?.[0]?.ref === id) closeStepDetailPanel();
                    delete currentData.sharedNotes[id]; syncToEditor(); renderChecklist(); paint();
                }));
            }
            list.append(row);
        });
    };
    const content = document.createElement('div');
    content.className = 'shortcuts-modal-body';
    content.append(search, list);
    dialog.append(header, content);
    if (!onSelect) content.append(button('+ 새 공유 노트 만들기', () => {
        const id = createSharedNote({ label: search.value.trim() || '새 공유 노트', blocks: [] });
        syncToEditor(); choose(id);
    }));
    const closeButton = button('×', () => dialog.close());
    closeButton.className = 'shortcuts-modal-close';
    closeButton.replaceChildren(createNoteActionIcon('close'));
    closeButton.setAttribute('aria-label', '닫기');
    header.append(closeButton);
    search.addEventListener('input', paint);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('keydown', event => event.stopPropagation());
    document.body.append(dialog); paint(); dialog.showModal(); search.focus();
}


function createNoteActionIcon(kind) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(ns, 'path');
    const paths = {
        copy: 'M9 9h12v12H9z M15 5V3H3v12h2',
        trash: 'M3 6h18 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14 M10 10v7 M14 10v7',
        external: 'M6 18L18 6 M6 6h12v12',
        up: 'M12 19V5 M5 12l7-7 7 7',
        down: 'M12 5v14 M5 12l7 7 7-7',
        close: 'M6 6l12 12M18 6L6 18'
    };
    path.setAttribute('d', paths[kind] || paths.close);
    svg.append(path);
    return svg;
}

function createNoteDropdown(label) {
    // Reuse the existing row-filter trigger, surface, items and swatches.
    const element = document.createElement('div');
    element.className = 'checklist-filter-wrap note-dropdown';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'checklist-filter-toggle';
    toggle.textContent = label;
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    const body = document.createElement('div');
    body.className = 'checklist-filter-menu';
    body.id = `note-menu-${crypto.randomUUID()}`;
    body.setAttribute('role', 'menu');
    body.setAttribute('aria-label', label);
    toggle.setAttribute('aria-controls', body.id);
    body.hidden = true;
    const close = (restoreFocus = false) => {
        body.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) toggle.focus();
    };
    element.closeMenu = close;
    const open = () => {
        document.querySelectorAll('.note-dropdown').forEach(other => {
            if (other !== element) other.closeMenu();
        });
        body.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        (body.querySelector('.is-selected:not(:disabled)') || body.querySelector('button:not(:disabled)'))?.focus();
    };
    toggle.addEventListener('click', () => body.hidden ? open() : close());
    element.addEventListener('keydown', event => {
        const items = [...body.querySelectorAll('button:not(:disabled)')];
        if (event.key === 'Escape' && !body.hidden) {
            event.preventDefault(); event.stopPropagation(); close(true);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); event.stopPropagation();
            if (body.hidden) return open();
            const offset = event.key === 'ArrowDown' ? 1 : -1;
            const index = items.indexOf(document.activeElement);
            items[(index + offset + items.length) % items.length]?.focus();
        } else if (event.key === 'Tab') close();
    });
    element.append(toggle, body);
    return { element, toggle, body, close };
}
