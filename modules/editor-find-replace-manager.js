export function createEditorFindReplaceManager(options) {
    const editing = options?.editing;
    const onStateChange = typeof options?.onStateChange === 'function' ? options.onStateChange : null;
    const onTextMutated = typeof options?.onTextMutated === 'function' ? options.onTextMutated : null;

    const state = {
        isOpen: false,
        showReplace: false,
        query: '',
        replaceText: '',
        matches: [],
        activeMatchIndex: -1
    };

    function open(config = {}) {
        if (!editing) return;
        const { showReplace = false, seedQuery = '' } = config;
        state.isOpen = true;
        state.showReplace = showReplace;
        if (seedQuery) state.query = seedQuery;
        syncMatches();
        emitState();
    }

    function close() {
        state.isOpen = false;
        state.showReplace = false;
        emitState();
    }

    function setQuery(value) {
        state.query = String(value || '');
        syncMatches();
        emitState();
    }

    function setReplaceText(value) {
        state.replaceText = String(value || '');
        emitState();
    }

    function syncFromEditorSelection() {
        if (!state.isOpen) return;
        syncMatches();
        emitState();
    }

    function syncFromEditorInput() {
        if (!state.isOpen) return;
        syncMatches();
        emitState();
    }

    function findNext(options = {}) {
        const { focusEditor = true } = options;
        if (!state.isOpen || state.matches.length === 0) return false;
        if (state.activeMatchIndex < 0) {
            state.activeMatchIndex = findActiveIndexFromCaret();
        } else if (!isSelectionOnActiveMatch()) {
            selectActiveMatch(focusEditor);
            emitState();
            return true;
        } else {
            state.activeMatchIndex = (state.activeMatchIndex + 1) % state.matches.length;
        }
        selectActiveMatch(focusEditor);
        emitState();
        return true;
    }

    function findPrevious(options = {}) {
        const { focusEditor = true } = options;
        if (!state.isOpen || state.matches.length === 0) return false;
        if (state.activeMatchIndex < 0) {
            state.activeMatchIndex = findActiveIndexFromCaret();
        } else if (!isSelectionOnActiveMatch()) {
            selectActiveMatch(focusEditor);
            emitState();
            return true;
        } else {
            state.activeMatchIndex = (state.activeMatchIndex - 1 + state.matches.length) % state.matches.length;
        }
        selectActiveMatch(focusEditor);
        emitState();
        return true;
    }

    function replaceCurrent() {
        if (!state.isOpen || state.matches.length === 0) return 0;
        if (state.activeMatchIndex < 0) state.activeMatchIndex = findActiveIndexFromSelectionOrCaret();
        const target = state.matches[state.activeMatchIndex];
        if (!target) return 0;

        const value = editing.value;
        const nextValue = value.slice(0, target.start) + state.replaceText + value.slice(target.end);
        editing.value = nextValue;
        const nextCursor = target.start + state.replaceText.length;
        editing.setSelectionRange(nextCursor, nextCursor, 'none');
        if (onTextMutated) onTextMutated();

        syncMatches();
        state.activeMatchIndex = findFirstMatchAtOrAfter(nextCursor);
        selectActiveMatch();
        emitState();
        return 1;
    }

    function replaceAll() {
        if (!state.isOpen || !state.query || state.matches.length === 0) return 0;
        const count = state.matches.length;
        const value = editing.value;
        editing.value = value.split(state.query).join(state.replaceText);
        const caret = editing.selectionStart;
        editing.setSelectionRange(caret, caret, 'none');
        if (onTextMutated) onTextMutated();

        syncMatches();
        emitState();
        return count;
    }

    function revealActiveMatch(options = {}) {
        const { focusEditor = false } = options;
        if (!state.isOpen || state.matches.length === 0) return false;
        if (state.activeMatchIndex < 0) {
            state.activeMatchIndex = findActiveIndexFromSelectionOrCaret();
        }
        selectActiveMatch(focusEditor);
        emitState();
        return true;
    }

    function getActiveMatch() {
        if (!state.isOpen) return null;
        if (state.activeMatchIndex < 0) return null;
        return state.matches[state.activeMatchIndex] || null;
    }

    function getState() {
        return {
            isOpen: state.isOpen,
            showReplace: state.showReplace,
            query: state.query,
            replaceText: state.replaceText,
            activeMatchIndex: state.activeMatchIndex,
            matchCount: state.matches.length
        };
    }

    function emitState() {
        if (!onStateChange) return;
        onStateChange(getState());
    }

    function syncMatches() {
        state.matches = findMatches(editing?.value || '', state.query);
        if (state.matches.length === 0) {
            state.activeMatchIndex = -1;
            return;
        }
        state.activeMatchIndex = findActiveIndexFromSelectionOrCaret();
    }

    function findActiveIndexFromSelectionOrCaret() {
        if (!editing || state.matches.length === 0) return -1;
        const selectionStart = editing.selectionStart;
        const selectionEnd = editing.selectionEnd;

        const selectedIndex = state.matches.findIndex(match => match.start === selectionStart && match.end === selectionEnd);
        if (selectedIndex >= 0) return selectedIndex;
        return findFirstMatchAtOrAfter(selectionStart);
    }

    function findActiveIndexFromCaret() {
        if (!editing || state.matches.length === 0) return -1;
        return findFirstMatchAtOrAfter(editing.selectionStart);
    }

    function findFirstMatchAtOrAfter(position) {
        if (state.matches.length === 0) return -1;
        const nextIndex = state.matches.findIndex(match => match.start >= position);
        return nextIndex >= 0 ? nextIndex : 0;
    }

    function selectActiveMatch(focusEditor) {
        if (!editing) return;
        const target = state.matches[state.activeMatchIndex];
        if (!target) return;
        if (focusEditor) editing.focus();
        editing.setSelectionRange(target.start, target.end, 'none');
    }

    function isSelectionOnActiveMatch() {
        if (!editing) return false;
        const target = state.matches[state.activeMatchIndex];
        if (!target) return false;
        return editing.selectionStart === target.start && editing.selectionEnd === target.end;
    }

    return {
        open,
        close,
        setQuery,
        setReplaceText,
        findNext,
        findPrevious,
        replaceCurrent,
        replaceAll,
        revealActiveMatch,
        getActiveMatch,
        syncFromEditorSelection,
        syncFromEditorInput,
        getState
    };
}

function findMatches(text, query) {
    if (!query) return [];
    const matches = [];
    let startAt = 0;

    while (startAt <= text.length) {
        const index = text.indexOf(query, startAt);
        if (index < 0) break;
        matches.push({ start: index, end: index + query.length });
        startAt = index + Math.max(1, query.length);
    }

    return matches;
}
