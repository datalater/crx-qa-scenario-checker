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
    if (event.key !== "Tab") return;
    event.preventDefault();
    const direction = event.shiftKey ? -1 : 1;
    if (composing || event.isComposing || event.keyCode === 229) pendingDirection = direction;
    else move(direction);
  });
}
