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
      if (target) {
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
