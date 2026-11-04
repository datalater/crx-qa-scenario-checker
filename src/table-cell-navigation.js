// A table row can be taller than this cell's editable content. Clicking the
// remaining area should still put the caret at the end of the cell.
export function focusTableCellFromEmptyArea(event, container, cell) {
  if (event.target !== container || event.button !== 0) return;
  event.preventDefault();
  cell.focus();
  const selection = cell.ownerDocument.getSelection();
  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Probe the browser's visual-line movement (including wrapped lines), then
// restore the caret so the normal arrow key can handle movement within a cell.
function hasAdjacentVisualLine(cell, direction) {
  const selection = cell.ownerDocument.getSelection();
  if (!selection || !selection.isCollapsed || !selection.rangeCount ||
      !cell.contains(selection.anchorNode) || typeof selection.modify !== "function") return null;
  const original = selection.getRangeAt(0).cloneRange();
  const before = original.getBoundingClientRect();
  if (!before.height) return cell.textContent ? null : false;
  selection.modify("move", direction, "line");
  const after = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  const inside = cell.contains(selection.anchorNode);
  selection.removeAllRanges();
  selection.addRange(original);
  if (!inside) return false;
  if (!after || !after.height) return null;
  return direction === "backward" ? after.top < before.top - 1 : after.top > before.top + 1;
}

// Keep focus in the composing cell until the IME has delivered its final input.
export function setupTableCellNavigation(cell, allCells) {
  let composing = false;
  let pendingDirection = 0;
  let generation = 0;
  const move = (direction) => {
    if (!cell.isConnected || cell.ownerDocument.activeElement !== cell) return;
    const cells = allCells();
    const index = cells.indexOf(cell);
    if (index !== -1) cells[index + direction]?.focus();
  };

  cell.addEventListener("compositionstart", () => {
    composing = true;
    pendingDirection = 0;
    generation++;
  });
  cell.addEventListener("compositionend", () => {
    composing = false;
    if (!pendingDirection) return;
    const direction = pendingDirection;
    pendingDirection = 0;
    const current = ++generation;
    // Some browsers send the final input after compositionend.
    setTimeout(() => { if (generation === current) move(direction); }, 0);
  });
  cell.addEventListener("blur", () => {
    composing = false;
    pendingDirection = 0;
    generation++;
  });
  cell.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !composing && !event.isComposing && event.keyCode !== 229 &&
        !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const row = Number(cell.dataset.r) + (event.key === "ArrowUp" ? -1 : 1);
      const target = allCells().find((other) =>
        Number(other.dataset.r) === row && other.dataset.c === cell.dataset.c);
      if (target && hasAdjacentVisualLine(cell, event.key === "ArrowUp" ? "backward" : "forward") === false) {
        event.preventDefault();
        target.focus();
      }
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const direction = event.shiftKey ? -1 : 1;
    if (composing || event.isComposing || event.keyCode === 229) pendingDirection = direction;
    else move(direction);
  });
}
