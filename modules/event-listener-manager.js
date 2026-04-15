export function setupMainEventListeners(config) {
    const {
        el,
        onDocumentKeydown,
        onEditorInput,
        onEditorPaste,
        onEditorScroll,
        onEditorKeydown,
        onEditorKeyup,
        onEditorClick,
        onEditorSelect,
        onFindInput,
        onFindInputKeydown,
        onReplaceInput,
        onReplaceInputKeydown,
        onFindNext,
        onFindPrev,
        onFindClose,
        onReplaceOne,
        onReplaceAll,
        onFoldEditor,
        onFormat,
        onToggleLineNumbers,
        onToggleFolders,
        onToggleTree,
        onShowTree,
        onTogglePassHeader,
        onNewFolder,
        onNewFile,
        onExport,
        onImportClick,
        onRequestFolderWritePermission,
        onImportFile,
        onImportError
    } = config;

    if (typeof onDocumentKeydown === 'function') {
        document.addEventListener('keydown', onDocumentKeydown);
    }

    el.editing.addEventListener('input', onEditorInput);
    el.editing.addEventListener('paste', onEditorPaste);
    el.editing.addEventListener('scroll', onEditorScroll);
    el.editing.addEventListener('keydown', onEditorKeydown);
    if (typeof onEditorKeyup === 'function') el.editing.addEventListener('keyup', onEditorKeyup);
    if (typeof onEditorClick === 'function') el.editing.addEventListener('click', onEditorClick);
    if (typeof onEditorSelect === 'function') el.editing.addEventListener('select', onEditorSelect);
    if (el.editorFindInput && typeof onFindInput === 'function') el.editorFindInput.addEventListener('input', onFindInput);
    if (el.editorFindInput && typeof onFindInputKeydown === 'function') el.editorFindInput.addEventListener('keydown', onFindInputKeydown);
    if (el.editorReplaceInput && typeof onReplaceInput === 'function') el.editorReplaceInput.addEventListener('input', onReplaceInput);
    if (el.editorReplaceInput && typeof onReplaceInputKeydown === 'function') el.editorReplaceInput.addEventListener('keydown', onReplaceInputKeydown);
    if (el.btnEditorFindNext && typeof onFindNext === 'function') {
        el.btnEditorFindNext.addEventListener('mousedown', preventFocusSteal);
        el.btnEditorFindNext.addEventListener('click', onFindNext);
    }
    if (el.btnEditorFindPrev && typeof onFindPrev === 'function') {
        el.btnEditorFindPrev.addEventListener('mousedown', preventFocusSteal);
        el.btnEditorFindPrev.addEventListener('click', onFindPrev);
    }
    if (el.btnEditorFindClose && typeof onFindClose === 'function') {
        el.btnEditorFindClose.addEventListener('mousedown', preventFocusSteal);
        el.btnEditorFindClose.addEventListener('click', onFindClose);
    }
    if (el.btnEditorReplaceOne && typeof onReplaceOne === 'function') {
        el.btnEditorReplaceOne.addEventListener('mousedown', preventFocusSteal);
        el.btnEditorReplaceOne.addEventListener('click', onReplaceOne);
    }
    if (el.btnEditorReplaceAll && typeof onReplaceAll === 'function') {
        el.btnEditorReplaceAll.addEventListener('mousedown', preventFocusSteal);
        el.btnEditorReplaceAll.addEventListener('click', onReplaceAll);
    }

    el.btnFoldEditor.addEventListener('click', onFoldEditor);
    el.btnFormat.addEventListener('click', onFormat);
    el.toggleLineNumbers.addEventListener('change', onToggleLineNumbers);
    el.btnToggleFolders.addEventListener('click', onToggleFolders);
    el.btnToggleTree.addEventListener('click', onToggleTree);
    el.btnShowTree.addEventListener('click', onShowTree);
    el.passHeaderToggle.addEventListener('click', onTogglePassHeader);
    el.btnNewFolder.addEventListener('click', onNewFolder);
    el.btnNewFile.addEventListener('click', onNewFile);
    el.btnExport.addEventListener('click', onExport);
    el.btnImport.addEventListener('click', onImportClick);
    if (el.btnRequestWrite && typeof onRequestFolderWritePermission === 'function') {
        el.btnRequestWrite.addEventListener('click', onRequestFolderWritePermission);
    }

    el.fileInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await onImportFile(file);
        } catch (error) {
            onImportError(error);
        }
    });
}

function preventFocusSteal(event) {
    event.preventDefault();
}
