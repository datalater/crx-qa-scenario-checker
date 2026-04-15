import { WORKSPACE_STORAGE_KEY } from './constants/storage.js';
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
    highlightOverlay: document.getElementById('highlight-overlay'),
    jsonStatus: document.getElementById('json-status'),
    jsonErrorPosition: document.getElementById('json-error-position'),
    jsonErrorMessage: document.getElementById('json-error-message'),
    appVersion: document.getElementById('app-version'),
    lineNumbers: document.getElementById('line-numbers'),
    toggleLineNumbers: document.getElementById('toggle-line-numbers'),
    editorWrapper: document.getElementById('editor-wrapper'),
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
    btnFormat: document.getElementById('btn-format'),
    saveIndicator: document.getElementById('save-indicator'),
    saveIndicatorTime: document.getElementById('save-indicator-time'),
    saveIndicatorLabel: document.getElementById('save-indicator-label'),
    btnFoldEditor: document.getElementById('btn-fold-editor'),
    paneResizer: document.getElementById('pane-resizer'),
    passHeaderToggle: document.getElementById('col-pass-toggle'),
    btnNewFolder: document.getElementById('btn-new-folder'),
    btnNewFile: document.getElementById('btn-new-file'),
    btnToggleFolders: document.getElementById('btn-toggle-folders'),
    btnToggleTree: document.getElementById('btn-toggle-tree'),
    btnTreeMenu: document.getElementById('btn-tree-menu'),
    btnShowTree: document.getElementById('btn-show-tree'),
    treeMenu: document.getElementById('tree-menu'),
    treeSearchInput: document.getElementById('tree-search-input'),
    treeSearchMeta: document.getElementById('tree-search-meta'),
    btnTreeSearchClear: document.getElementById('btn-tree-search-clear'),
    fileTree: document.getElementById('file-tree'),
    treeContextMenu: document.getElementById('tree-context-menu'),
    treeContextCopy: document.getElementById('tree-context-copy'),
    treeContextRename: document.getElementById('tree-context-rename'),
    treeContextDelete: document.getElementById('tree-context-delete'),
    treeContextReadonly: document.getElementById('tree-context-readonly'),
    checklistContextMenu: document.getElementById('checklist-context-menu'),
    checklistContextDelete: document.getElementById('checklist-context-delete'),
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
let autosaveTimer = null;
let activeFileDirty = false;
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
let treeContextTarget = null;
let checklistContextTarget = null;
const pendingCopyFileIds = new Set();
let fileTreeSearchQuery = '';
let currentFileTreeSearchState = null;
let editorSearchHighlightQuery = '';

const BOUND_FILE_PATH_DEFAULT_LABEL = '';
const BOUND_FILE_PATH_DEFAULT_TOOLTIP = 'No file bound';
const LOCAL_SAVE_ONLY_TOOLTIP = '로컬 저장소(localStorage)에 저장되었습니다. 현재 디스크 파일에 직접 저장할 수 없어 이 상태를 표시합니다.';
const DIRECTORY_LOCAL_SAVE_TOOLTIP = '폴더 기반 모드에서는 현재 로컬 저장 후 필요 시 디스크 동기화를 확장할 예정입니다. 지금은 로컬 저장을 기준으로 동작합니다.';
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
    'steps.pass'
];

// --- Initialization ---

function init() {
    loadAppVersionLabel();
    setupResizerLayout();
    setupExportMenuManager();
    setupTreeMenuManager();
    setupEditorSelectionManager();
    setupEditorHighlightManager();
    setupEditorCursorHistoryManager();
    setupEditorFindReplaceManager();
    setupDeletedFileHistoryManager();
    loadWorkspace();
    setupEventListeners();
    resizerLayout.setupResizing();
    setupWindowListeners();
    applyLineNumberVisibility();
    applyFileTreePreference();
    setupTreeMenu();
    setupExportMenu();
}

async function loadAppVersionLabel() {
    if (!EL.appVersion) return;

    const applyVersion = (value) => {
        const version = String(value || '').trim();
        if (!version) return;
        EL.appVersion.textContent = `v${version}`;
        EL.appVersion.title = `Current version: v${version}`;
    };

    if (typeof chrome !== 'undefined'
        && chrome.runtime
        && typeof chrome.runtime.getManifest === 'function') {
        const manifest = chrome.runtime.getManifest();
        applyVersion(manifest?.version);
        return;
    }

    try {
        const response = await fetch('./manifest.json', { cache: 'no-store' });
        if (!response.ok) return;
        const manifest = await response.json();
        applyVersion(manifest?.version);
    } catch {}
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

    let persisted = null;
    try {
        persisted = await getBoundDirectoryHandleFromDb();
    } catch (error) {
        console.warn('[qa-scenario] failed to restore bound directory handle', error);
        return;
    }

    const handle = persisted?.handle;
    if (!handle) return;

    showLoadingOverlay();
    try {
        await bindAndLoadFromDirectoryHandle(handle, { isRestore: true });
    } catch (error) {
        console.warn('[qa-scenario] auto-reconnect for directory failed', error);
    } finally {
        hideLoadingOverlay();
    }
}

function showLoadingOverlay() {
    if (EL.loadingOverlay) EL.loadingOverlay.classList.remove('is-hidden');
}

function hideLoadingOverlay() {
    if (EL.loadingOverlay) EL.loadingOverlay.classList.add('is-hidden');
}

function persist() {
    Workspace.persistWorkspace(workspace);
    activeFileDirty = false;
    updateSaveIndicator('saved');
    scheduleBoundFileFlush();
    scheduleDirectoryFileFlush();
    renderTree();
}

function loadActiveFile() {
    clearStepHighlight();
    const activeFile = resolveActiveFileOrFallback();
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
        EL.checklistBody.innerHTML = '<tr class="empty-state"><td colspan="5">Select a file or create a new file.</td></tr>';
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

    if (EL.treeContextRename) {
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
        EL.treeContextDelete.disabled = !canMutate;
        EL.treeContextDelete.textContent = target.type === 'folder' ? '폴더 삭제' : '파일 삭제';
    }
    if (EL.treeContextReadonly) {
        EL.treeContextReadonly.hidden = canMutate;
    }

    const menuWidth = 180;
    const menuHeight = canMutate
        ? (target.type === 'file' ? 126 : 90)
        : (target.type === 'file' ? 156 : 120);
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
    const left = Math.min(Math.max(8, target.x), maxLeft);
    const top = Math.min(Math.max(8, target.y), maxTop);

    EL.treeContextMenu.style.left = `${left}px`;
    EL.treeContextMenu.style.top = `${top}px`;
    EL.treeContextMenu.hidden = false;
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

function openChecklistContextMenu(target) {
    if (!EL.checklistContextMenu || target == null) return;
    checklistContextTarget = target;

    if (EL.checklistContextColor) {
        EL.checklistContextColor.hidden = !target.isDivider;
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
    if (treeContextTarget.type === 'folder') {
        await renameFolderById(treeContextTarget.id);
    } else {
        await renameFileById(treeContextTarget.id);
    }
    closeTreeContextMenu();
}

async function handleTreeContextDelete() {
    if (!treeContextTarget || !treeMutationsEnabled) return;
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
            updateBoundFilePathInput(`Folder renamed: ${normalizedName} (direct save enabled)`, 'bound');
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

async function createFolderFromUi() {
    if (!treeMutationsEnabled) {
        alert('Folder mode is read-only in this version.');
        return;
    }

    const selectedFolderId = workspace.uiState.selectedFolderId || workspace.folders[0]?.id || null;
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

    const folder = Workspace.createFolderRecord(trimmedName);
    workspace.folders.push(folder);
    persist();
}

async function createFileFromUi() {
    if (!treeMutationsEnabled) {
        alert('Folder mode is read-only in this version.');
        return;
    }

    const folderId = workspace.uiState.selectedFolderId || workspace.folders[0]?.id;
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
        onOpenChecklistContextMenu: openChecklistContextMenu
    });
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
    clearHighlightIfNoSelection();
}

function isStepArrayField(field) {
    return field === 'given' || field === 'when' || field === 'then';
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
        updateBoundFilePathInput('Sync skipped: no active file content', 'warning');
        return;
    }

    diskFlushQueued = false;
    diskFlushInFlight = true;
    try {
        const writable = await boundFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput(`Synced ${formatSavedTime(nowIso())}`, 'bound');
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
        updateBoundFilePathInput('Folder sync skipped: no active disk file', 'warning');
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
            updateBoundFilePathInput('Conflict: disk file changed externally (re-open folder)', 'warning');
            return;
        }

        const writable = await target.fileHandle.createWritable();
        await writable.write(target.activeFile.content || '');
        await writable.close();

        const syncedFile = await target.fileHandle.getFile();
        directoryFileFingerprintById.set(target.activeFile.id, buildFileFingerprint(syncedFile));
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput(`Folder synced ${formatSavedTime(nowIso())}`, 'bound');
    } catch (error) {
        console.error('[qa-scenario] directory file flush failed', error);
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Folder sync failed', 'warning');
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

function applyImportedWorkspace(data) {
    workspace = Workspace.normalizeWorkspace(data);
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
    updateBoundFilePathInput('Imported only: not bound to disk', 'warning');
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
            updateBoundFilePathInput('Not connected: re-open folder to load disk tree', 'warning');
            return false;
        }
        alert('Open folder failed: read permission denied');
        return false;
    }

    let loaded = null;
    try {
        loaded = await loadWorkspaceFromDirectoryHandle(handle, { silentErrors: isRestore });
    } catch (error) {
        console.error('[qa-scenario] load workspace from directory failed', error);
        alert('Open folder failed while reading directory contents');
        return false;
    }

    if (!loaded?.workspace) {
        alert('Unsupported or invalid directory contents');
        return false;
    }

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

    applyImportedWorkspace(loaded.workspace);
    setWorkspaceBoundFileMeta(loaded.rootName, 'directory');
    try {
        await setBoundDirectoryHandleInDb(handle, loaded.rootName);
    } catch (error) {
        console.warn('[qa-scenario] failed to persist bound directory handle', error);
    }
    applyBoundFilePath(loaded.rootName);
    if (writeGranted) {
        updateBoundFilePathInput(isRestore ? `Folder reconnected: ${loaded.loadedJsonFileCount} JSON files (direct save enabled)` : buildFolderStatusMessage('direct-save'), 'bound');
        scheduleDirectoryFileFlush();
    } else {
        updateBoundFilePathInput(isRestore ? `Folder reconnected: ${loaded.loadedJsonFileCount} JSON files (read-only: click Enable Sync)` : buildFolderStatusMessage('read-only'), 'warning');
    }

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
    const count = Number.isFinite(boundDirectoryJsonFileCount) ? boundDirectoryJsonFileCount : 0;
    if (mode === 'direct-save') {
        return `Folder loaded: ${count} JSON files (direct save enabled)`;
    }
    if (mode === 'read-only') {
        return `Folder loaded: ${count} JSON files (read-only: click Enable Sync)`;
    }
    return `Folder loaded: ${count} JSON files`;
}

function updateFolderWritePermissionUi() {
    if (!EL.btnRequestWrite) return;
    const shouldShow = Boolean(boundDirectoryHandle && !boundDirectoryWriteEnabled);
    EL.btnRequestWrite.hidden = !shouldShow;
    EL.btnRequestWrite.title = shouldShow
        ? '디스크 동기화가 꺼져 있습니다. 클릭하면 폴더 쓰기 권한을 다시 요청해 자동 동기화를 켭니다.'
        : '폴더 쓰기 권한이 허용되어 자동 동기화가 켜져 있습니다.';
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
    if (!boundDirectoryHandle) return;

    const granted = await ensureDirectoryReadWritePermission(boundDirectoryHandle);
    boundDirectoryWriteEnabled = granted;
    setDirectDiskSyncAvailable(granted);
    updateFolderWritePermissionUi();

    if (!granted) {
        setTreeMutationsEnabled(false);
        updateBoundFilePathInput(buildFolderStatusMessage('read-only'), 'warning');
        return;
    }

    setTreeMutationsEnabled(true);
    updateBoundFilePathInput(buildFolderStatusMessage('direct-save'), 'bound');
    scheduleDirectoryFileFlush();
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
        updateBoundFilePathInput('Bound read-only: write permission denied', 'warning');
    } else {
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput('Bound: saving writes directly to file', 'bound');
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
        updateBoundFilePathInput('Not connected: re-open folder to load disk tree', 'warning');
        return;
    }
    updateBoundFilePathInput('Not connected: re-open file to resume direct save', 'warning');
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
    updateSaveIndicatorView({
        saveIndicator: EL.saveIndicator,
        saveIndicatorTime: EL.saveIndicatorTime,
        saveIndicatorLabel: EL.saveIndicatorLabel
    }, state, workspace?.updatedAt);
    refreshSaveIndicatorPresentation();
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
    if (!workspace?.uiState || !EL.fileTreePanel) return;
    const shouldShow = workspace.uiState.showFileTree !== false;
    setFileTreeVisibility(shouldShow, { persist: false });
}

function applyFileTreeWidthPreference() {
    if (!workspace?.uiState || !EL.fileTreePanel) return;
    const preferred = workspace.uiState.fileTreeWidth;
    if (Number.isFinite(preferred) && preferred > 0) {
        resizerLayout.setManualFileTreeWidth(preferred);
    }
    if (isFileTreeVisible()) {
        const nextWidth = resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
        resizerLayout.setManualFileTreeWidth(resizerLayout.applyFileTreeWidth(nextWidth, { persist: false }));
    }
}

function persistFileTreeWidthPreference(width) {
    if (!workspace?.uiState) return;
    workspace.uiState.fileTreeWidth = width;
    Workspace.persistWorkspace(workspace);
}

function setFileTreeVisibility(shouldShow, options = {}) {
    if (!EL.fileTreePanel || !EL.btnToggleTree) return;
    const persist = options.persist !== false;

    if (!shouldShow) {
        resizerLayout.stopFileTreeResizing();
    }

    EL.fileTreePanel.classList.toggle('is-collapsed', !shouldShow);
    EL.fileTreePanel.dataset.treeVisible = shouldShow ? 'true' : 'false';

    if (shouldShow) {
        const nextWidth = resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
        resizerLayout.setManualFileTreeWidth(resizerLayout.applyFileTreeWidth(nextWidth, { persist: false }));
    }

    closeTreeMenu();
    if (persist && workspace?.uiState) {
        workspace.uiState.showFileTree = shouldShow;
        Workspace.persistWorkspace(workspace);
    }
}

function isFileTreeVisible() {
    return Boolean(EL.fileTreePanel && !EL.fileTreePanel.classList.contains('is-collapsed'));
}

function updateLineNumbers() {
    updateLineNumbersView(EL.editing, EL.lineNumbers);
}

function renderEditorFromCurrentData() {
    updateLineNumbers();
    updateHighlighting();
    setJsonValidationValidState();
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
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
    editorHighlightManager.updateErrorPosition(position);
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
    const isFolded = EL.appContent.classList.contains('folded');
    resizerLayout.handleWindowResize(isFolded);
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
    if (EL.treeContextCopy) {
        EL.treeContextCopy.addEventListener('click', handleTreeContextCopy);
    }
    if (EL.treeContextDelete) {
        EL.treeContextDelete.addEventListener('click', handleTreeContextDelete);
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
        onFoldEditor: () => {
            const willFold = !EL.appContent.classList.contains('folded');
            if (willFold) {
                resizerLayout.stopPaneResizing();
                resizerLayout.stopFileTreeResizing();
                EL.appContent.classList.add('folded');
                EL.editorPane.style.flex = '0 0 0px';
                EL.editorPane.style.width = '0px';
                return;
            }

            EL.appContent.classList.remove('folded');
            EL.editorPane.style.width = '';
            const manualEditorWidth = resizerLayout.getManualEditorWidth();
            const manualFileTreeWidth = resizerLayout.getManualFileTreeWidth();
            if (Number.isFinite(manualEditorWidth)) {
                resizerLayout.applyEditorWidth(manualEditorWidth, { persist: false });
                if (Number.isFinite(manualFileTreeWidth) && isFileTreeVisible()) {
                    resizerLayout.applyFileTreeWidth(manualFileTreeWidth, { persist: false });
                }
                return;
            }

            EL.editorPane.style.flex = '';
            if (isFileTreeVisible()) {
                resizerLayout.applyFileTreeWidth(manualFileTreeWidth ?? DEFAULT_FILE_TREE_WIDTH, { persist: false });
            }
        },
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
