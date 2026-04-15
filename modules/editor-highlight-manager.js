export function createEditorHighlightManager(options) {
    const {
        editing,
        highlightOverlay,
        jsonErrorPosition,
        getLineColumn,
        getEditorMetrics
    } = options;

    let stepHighlightRange = null;

    function clearStepHighlight() {
        stepHighlightRange = null;
        highlightOverlay.innerHTML = '';
    }

    function renderStepHighlight(bounds) {
        stepHighlightRange = getLineRange(editing.value, bounds.start, bounds.end);
        highlightOverlay.innerHTML = '<div class="highlight-block"></div>';
        updateStepHighlightPosition();
    }

    function updateStepHighlightPosition() {
        if (!stepHighlightRange) return;
        const block = highlightOverlay.firstElementChild;
        if (!block) return;

        const metrics = getEditorMetrics();
        const height = Math.max(1, stepHighlightRange.endLine - stepHighlightRange.startLine + 1) * metrics.lineHeight;
        const top = metrics.paddingTop + (stepHighlightRange.startLine - 1) * metrics.lineHeight - editing.scrollTop;

        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
    }

    function scrollToLine(position) {
        const line = getLineColumn(editing.value, position).line;
        const metrics = getEditorMetrics();
        const targetTop = metrics.paddingTop + (line - 1) * metrics.lineHeight;
        editing.scrollTop = Math.max(0, targetTop - (editing.clientHeight / 3));
        updateStepHighlightPosition();
    }

    function updateErrorPosition(position) {
        if (!Number.isFinite(position) || position < 0) {
            jsonErrorPosition.textContent = '';
            jsonErrorPosition.classList.add('is-hidden');
            return;
        }

        const location = getLineColumn(editing.value, position);
        jsonErrorPosition.textContent = `Line ${location.line}, Col ${location.column}`;
        jsonErrorPosition.classList.remove('is-hidden');
    }

    function getLineRange(text, start, end) {
        const startLoc = getLineColumn(text, start);
        const endLoc = getLineColumn(text, end);
        return { startLine: startLoc.line, endLine: endLoc.line };
    }

    return {
        clearStepHighlight,
        renderStepHighlight,
        updateStepHighlightPosition,
        scrollToLine,
        updateErrorPosition
    };
}
