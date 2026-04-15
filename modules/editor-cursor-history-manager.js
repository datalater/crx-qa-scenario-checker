export function createEditorCursorHistoryManager(config) {
    const editing = config?.editing;
    const maxEntries = Number.isFinite(config?.maxEntries) ? Math.max(1, config.maxEntries) : 200;
    let backStack = [];
    let forwardStack = [];
    let lastSnapshot = null;
    let suppressRecord = false;

    function reset() {
        backStack = [];
        forwardStack = [];
        lastSnapshot = captureSnapshot();
    }

    function recordSelectionChange() {
        if (!editing || suppressRecord) return;
        const nextSnapshot = captureSnapshot();
        if (!lastSnapshot) {
            lastSnapshot = nextSnapshot;
            return;
        }
        if (isSameSelection(lastSnapshot, nextSnapshot)) return;
        backStack.push(lastSnapshot);
        if (backStack.length > maxEntries) backStack.shift();
        forwardStack = [];
        lastSnapshot = nextSnapshot;
    }

    function moveBack() {
        if (!editing || backStack.length === 0) return false;
        const current = captureSnapshot();
        const target = backStack.pop();
        forwardStack.push(current);
        if (forwardStack.length > maxEntries) forwardStack.shift();
        applySnapshot(target);
        lastSnapshot = captureSnapshot();
        return true;
    }

    function moveForward() {
        if (!editing || forwardStack.length === 0) return false;
        const current = captureSnapshot();
        const target = forwardStack.pop();
        backStack.push(current);
        if (backStack.length > maxEntries) backStack.shift();
        applySnapshot(target);
        lastSnapshot = captureSnapshot();
        return true;
    }

    function captureSnapshot() {
        return {
            start: editing.selectionStart || 0,
            end: editing.selectionEnd || 0,
            direction: editing.selectionDirection || 'none',
            scrollTop: editing.scrollTop || 0,
            scrollLeft: editing.scrollLeft || 0
        };
    }

    function applySnapshot(snapshot) {
        if (!snapshot) return;
        suppressRecord = true;
        editing.focus();
        editing.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
        editing.scrollTop = snapshot.scrollTop;
        editing.scrollLeft = snapshot.scrollLeft;
        queueMicrotask(() => {
            suppressRecord = false;
        });
    }

    return {
        reset,
        recordSelectionChange,
        moveBack,
        moveForward
    };
}

function isSameSelection(a, b) {
    if (!a || !b) return false;
    return a.start === b.start
        && a.end === b.end
        && a.direction === b.direction;
}
