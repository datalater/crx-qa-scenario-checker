export function createResizerLayoutManager(options) {
    const {
        el,
        isFileTreeVisible,
        persistFileTreeWidthPreference,
        minEditorWidth,
        minFileTreeWidth,
        minJsonEditorWidth
    } = options;

    let manualEditorWidth = null;
    let manualFileTreeWidth = null;
    let isPaneResizing = false;
    let resizeOriginLeft = 0;
    let isFileTreeResizing = false;

    function setupResizing() {
        const startPaneResizing = (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            isPaneResizing = true;
            resizeOriginLeft = el.appContent.getBoundingClientRect().left;
            document.body.classList.add('is-resizing');
            el.paneResizer.classList.add('resizing');
        };

        const startFileTreeResizing = (event) => {
            if (event.button !== 0 || !isFileTreeVisible()) return;
            event.preventDefault();
            isFileTreeResizing = true;
            document.body.classList.add('is-resizing');
            if (el.fileTreeResizer) el.fileTreeResizer.classList.add('resizing');
        };

        el.paneResizer.addEventListener('mousedown', startPaneResizing);
        if (el.fileTreeResizer) {
            el.fileTreeResizer.addEventListener('mousedown', startFileTreeResizing);
        }

        window.addEventListener('mousemove', (event) => {
            if (isPaneResizing) {
                const width = event.clientX - resizeOriginLeft;
                applyEditorWidth(width);
            }
            if (isFileTreeResizing) {
                const paneLeft = el.editorPane.getBoundingClientRect().left;
                const width = event.clientX - paneLeft;
                applyFileTreeWidth(width, { persist: false });
            }
        });

        window.addEventListener('mouseup', () => {
            stopPaneResizing();
            stopFileTreeResizing();
        });

        window.addEventListener('mouseleave', () => {
            stopPaneResizing();
            stopFileTreeResizing();
        });
    }

    function stopPaneResizing() {
        if (!isPaneResizing) return;
        isPaneResizing = false;
        document.body.classList.remove('is-resizing');
        el.paneResizer.classList.remove('resizing');
    }

    function stopFileTreeResizing() {
        if (!isFileTreeResizing) return;
        isFileTreeResizing = false;
        if (el.fileTreeResizer) el.fileTreeResizer.classList.remove('resizing');
        if (Number.isFinite(manualFileTreeWidth)) {
            persistFileTreeWidthPreference(manualFileTreeWidth);
        }
        if (!isPaneResizing) {
            document.body.classList.remove('is-resizing');
        }
    }

    function getFileTreeWidthBounds() {
        const editorPaneWidth = el.editorPane.getBoundingClientRect().width;
        const resizerWidth = getFileTreeResizerWidth();
        const maxFileTreeWidth = Math.max(minFileTreeWidth, editorPaneWidth - minJsonEditorWidth - resizerWidth);
        return { min: minFileTreeWidth, max: maxFileTreeWidth };
    }

    function getFileTreeResizerWidth() {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--tree-resizer-width')
            .trim();
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
        return el.fileTreeResizer ? el.fileTreeResizer.getBoundingClientRect().width : 0;
    }

    function applyFileTreeWidth(nextWidth, options = {}) {
        if (!el.fileTreePanel) return null;
        const { persist = true } = options;
        const bounds = getFileTreeWidthBounds();
        const clampedWidth = Math.min(Math.max(nextWidth, bounds.min), bounds.max);
        el.fileTreePanel.style.flex = `0 0 ${clampedWidth}px`;
        el.fileTreePanel.style.width = `${clampedWidth}px`;
        manualFileTreeWidth = clampedWidth;
        if (persist) {
            persistFileTreeWidthPreference(clampedWidth);
        }
        return clampedWidth;
    }

    function getEditorWidthBounds() {
        const appWidth = el.appContent.getBoundingClientRect().width;
        const resizerWidth = getPaneResizerWidth();
        const minChecklistWidth = resizerWidth;
        const maxEditorWidth = Math.max(minEditorWidth, appWidth - minChecklistWidth - resizerWidth);
        return { min: minEditorWidth, max: maxEditorWidth };
    }

    function getPaneResizerWidth() {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--pane-resizer-width')
            .trim();
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
        return el.paneResizer ? el.paneResizer.getBoundingClientRect().width : 0;
    }

    function applyEditorWidth(nextWidth, options = {}) {
        const { persist = true } = options;
        const bounds = getEditorWidthBounds();
        const clampedWidth = Math.min(Math.max(nextWidth, bounds.min), bounds.max);
        el.editorPane.style.flex = `0 0 ${clampedWidth}px`;
        if (persist) manualEditorWidth = clampedWidth;
        return clampedWidth;
    }

    function handleWindowResize(isFolded) {
        if (isFolded) return;
        if (Number.isFinite(manualEditorWidth)) {
            applyEditorWidth(manualEditorWidth, { persist: false });
        }
        if (Number.isFinite(manualFileTreeWidth) && isFileTreeVisible()) {
            applyFileTreeWidth(manualFileTreeWidth, { persist: false });
        }
    }

    function setManualFileTreeWidth(nextWidth) {
        if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
            manualFileTreeWidth = null;
            return;
        }
        manualFileTreeWidth = nextWidth;
    }

    function getManualFileTreeWidth() {
        return manualFileTreeWidth;
    }

    function getManualEditorWidth() {
        return manualEditorWidth;
    }

    return {
        setupResizing,
        stopPaneResizing,
        stopFileTreeResizing,
        applyEditorWidth,
        applyFileTreeWidth,
        handleWindowResize,
        setManualFileTreeWidth,
        getManualFileTreeWidth,
        getManualEditorWidth
    };
}
