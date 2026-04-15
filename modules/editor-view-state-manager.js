export function updateSaveIndicatorView(elements, state, updatedAt) {
    const { saveIndicator, saveIndicatorTime, saveIndicatorLabel } = elements;
    saveIndicator.classList.remove('is-dirty', 'is-saving', 'is-saved');
    saveIndicator.classList.add(`is-${state}`);

    if (state === 'saved' && saveIndicatorTime) {
        saveIndicatorTime.textContent = formatSavedTime(updatedAt);
    } else if (state === 'dirty' && saveIndicatorTime) {
        saveIndicatorTime.textContent = '';
    }

    if (saveIndicatorLabel) {
        saveIndicatorLabel.textContent = state === 'dirty' ? 'Unsaved' : (state === 'saving' ? 'Saving...' : 'Saved');
    }
}

export function applyLineNumberVisibilityView(elements, persistLineNumberPreference) {
    const { toggleLineNumbers, editorWrapper, editing, lineNumbers } = elements;
    const shouldShow = toggleLineNumbers.checked;
    editorWrapper.classList.toggle('has-line-numbers', shouldShow);
    if (shouldShow) {
        updateLineNumbersView(editing, lineNumbers);
    }
    persistLineNumberPreference(shouldShow);
}

export function applyLineNumberPreferenceFromWorkspace(workspace, toggleLineNumbers) {
    if (!workspace?.uiState) return;
    toggleLineNumbers.checked = workspace.uiState.showLineNumbers !== false;
}

export function updateLineNumbersView(editing, lineNumbers) {
    const lineCount = Math.max(1, editing.value.split('\n').length);
    const lines = Array.from({ length: lineCount }, (_, i) => i + 1);
    lineNumbers.textContent = lines.join('\n');
}

export function setJsonValidationValidView(jsonStatus, onResetErrorPosition, onUpdateErrorMessage) {
    jsonStatus.textContent = 'Valid';
    jsonStatus.classList.remove('error');
    onResetErrorPosition();
    onUpdateErrorMessage('');
}

export function setJsonValidationErrorView(jsonStatus, label) {
    jsonStatus.textContent = label;
    jsonStatus.classList.add('error');
}

export function updateJsonErrorMessageView(jsonErrorMessage, message) {
    if (!jsonErrorMessage) return;
    const normalized = String(message || '').trim();
    jsonErrorMessage.textContent = normalized;
    jsonErrorMessage.title = normalized;
    jsonErrorMessage.classList.toggle('is-hidden', !normalized);
}

export function formatSavedTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '0000-00-00 00:00:00';
    const yyyy = String(date.getFullYear());
    const mon = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mon}-${dd} ${hh}:${mm}:${ss}`;
}
