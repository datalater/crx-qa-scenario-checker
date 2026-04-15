export function createEditorSelectionManager(editing) {
    function indentSelection() {
        updateSelectionBlock((line) => `  ${line}`, () => 2);
    }

    function unindentSelection() {
        updateSelectionBlock(removeLeadingIndent, getUnindentDelta);
    }

    function updateSelectionBlock(transformLine, getDelta) {
        const info = getSelectionInfo();
        const block = info.text.slice(info.blockStart, info.blockEnd);
        const { lines, lineStarts } = splitLines(block);
        const deltas = lines.map(getDelta);
        const nextBlock = lines.map(transformLine).join('\n');
        applyBlockUpdate(info, lineStarts, deltas, nextBlock);
    }

    function getSelectionInfo() {
        const start = editing.selectionStart;
        const end = editing.selectionEnd;
        const text = editing.value;
        const blockStart = text.lastIndexOf('\n', start - 1) + 1;
        const blockEnd = getBlockEnd(text, end);
        return { text, start, end, blockStart, blockEnd };
    }

    function getBlockEnd(text, end) {
        const newline = text.indexOf('\n', end);
        return newline === -1 ? text.length : newline;
    }

    function splitLines(block) {
        const lines = block.split('\n');
        const lineStarts = [];
        let offset = 0;
        lines.forEach((line) => {
            lineStarts.push(offset);
            offset += line.length + 1;
        });
        return { lines, lineStarts };
    }

    function getUnindentDelta(line) {
        if (line.startsWith('  ')) return -2;
        if (line.startsWith(' ')) return -1;
        return 0;
    }

    function removeLeadingIndent(line) {
        if (line.startsWith('  ')) return line.slice(2);
        if (line.startsWith(' ')) return line.slice(1);
        return line;
    }

    function applyBlockUpdate(info, lineStarts, deltas, nextBlock) {
        const startInBlock = info.start - info.blockStart;
        const endInBlock = info.end - info.blockStart;
        const nextStart = info.blockStart + adjustIndex(startInBlock, lineStarts, deltas);
        const nextEnd = info.blockStart + adjustIndex(endInBlock, lineStarts, deltas);

        editing.setRangeText(nextBlock, info.blockStart, info.blockEnd, 'select');
        editing.selectionStart = nextStart;
        editing.selectionEnd = nextEnd;
    }

    function adjustIndex(indexInBlock, lineStarts, deltas) {
        let adjusted = indexInBlock;
        lineStarts.forEach((lineStart, i) => {
            if (lineStart < indexInBlock) adjusted += deltas[i];
        });
        return Math.max(0, adjusted);
    }

    return {
        indentSelection,
        unindentSelection
    };
}
