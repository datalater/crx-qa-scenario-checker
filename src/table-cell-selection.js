// Rectangular selection follows the original table coordinates; hidden columns
// are excluded when copying so the result matches what the user sees.
export function selectedCellRows(cells, start, end) {
  const minRow = Math.min(start.r, end.r), maxRow = Math.max(start.r, end.r);
  const minCol = Math.min(start.c, end.c), maxCol = Math.max(start.c, end.c);
  const rows = new Map();
  for (const cell of cells) {
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (cell.parentElement.hidden || r < minRow || r > maxRow || c < minCol || c > maxCol) continue;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push({ c, text: cell._text ?? '' });
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.sort((a, b) => a.c - b.c).map(cell => cell.text));
}

export function tableSelectionClipboard(rows) {
  const quote = value => /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    text: rows.map(row => row.map(quote).join('\t')).join('\n'),
    html: `<table>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value).replace(/\r\n?|\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</table>`,
  };
}

export function setupTableCellSelection(table) {
  const doc = table.ownerDocument;
  let start = null, end = null, startCell = null, dragging = false;
  const getCell = (target) => {
    const td = target?.closest?.('td, th');
    return td && table.contains(td) && !td.hidden ? td : null;
  };
  const point = td => ({ r: Number(td.dataset.r), c: Number(td.dataset.c) });
  const clear = () => {
    start = end = startCell = null;
    dragging = false;
    table.classList.remove('cm-lt-selecting');
    table.querySelectorAll('.cm-lt-selected').forEach(td => td.classList.remove('cm-lt-selected'));
  };
  const onDown = event => {
    clear();
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const td = getCell(event.target);
    if (td) { start = point(td); startCell = td.querySelector('.cm-lt-cell'); dragging = true; }
  };
  const paintSelection = () => {
    const minRow = Math.min(start.r, end.r), maxRow = Math.max(start.r, end.r);
    const minCol = Math.min(start.c, end.c), maxCol = Math.max(start.c, end.c);
    table.querySelectorAll('td, th').forEach(item => {
      const r = Number(item.dataset.r), c = Number(item.dataset.c);
      item.classList.toggle('cm-lt-selected', !item.hidden && r >= minRow && r <= maxRow && c >= minCol && c <= maxCol);
    });
  };
  const onMove = event => {
    if (!dragging || !start) return;
    const td = getCell(doc.elementFromPoint(event.clientX, event.clientY));
    if (!td) return;
    const current = point(td);
    if (!end && current.r === start.r && current.c === start.c) return;
    end = current;
    table.classList.add('cm-lt-selecting');
    doc.getSelection()?.removeAllRanges();
    paintSelection();
  };
  const onUp = () => {
    if (dragging && end && startCell?.isConnected && !table.contains(doc.activeElement)) {
      startCell.focus({ preventScroll: true });
    }
    dragging = false;
    table.classList.remove('cm-lt-selecting');
  };
  const onCopy = event => {
    if (!start || !end || !table.contains(doc.activeElement) || !event.clipboardData) return;
    const rows = selectedCellRows(table.querySelectorAll('.cm-lt-cell'), start, end);
    const { text, html } = tableSelectionClipboard(rows);
    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', html);
    event.preventDefault();
    event.stopPropagation();
  };
  // Compared by text so a manual drag over the whole text counts too; an
  // empty cell has nothing to select and goes straight to the table.
  const cellTextSelected = (cell, selection) => {
    const text = cell.textContent ?? '';
    if (!text) return true;
    if (!selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    return cell.contains(range.commonAncestorContainer) && range.toString() === text;
  };
  const onKey = event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
        !event.isComposing && event.keyCode !== 229 && event.key.toLowerCase() === 'a') {
      // First press selects the focused cell's text; pressing again (or when
      // the text is already fully selected, or cells are selected) selects the table.
      const cell = doc.activeElement;
      const selection = doc.getSelection();
      if (!end && selection && cell?.matches?.('.cm-lt-cell') && table.contains(cell) && !cellTextSelected(cell, selection)) {
        selection.selectAllChildren(cell);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const visible = [...table.querySelectorAll('td, th')].filter(td => !td.hidden);
      if (!visible.length) return;
      start = point(visible[0]);
      end = point(visible[visible.length - 1]);
      dragging = false;
      doc.getSelection()?.removeAllRanges();
      paintSelection();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')) return;
    clear();
  };
  // Capture before focus handlers replace highlighted cell content, and before
  // surrounding editor/application handlers can consume the copy event.
  doc.addEventListener('mousedown', onDown, true);
  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('mouseup', onUp);
  doc.addEventListener('copy', onCopy, true);
  table.addEventListener('keydown', onKey);
  return {
    clear,
    destroy() {
      clear();
      doc.removeEventListener('mousedown', onDown, true);
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
      doc.removeEventListener('copy', onCopy, true);
      table.removeEventListener('keydown', onKey);
    },
  };
}
