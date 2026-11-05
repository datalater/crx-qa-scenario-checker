// Carry the last measured widget height across document changes. CodeMirror
// uses this estimate before it can measure the newly decorated table.
export function mappedTableWidgetHeights(previous, changes, TableWidget) {
  const heights = new Map();
  if (!previous || !changes) return heights;
  previous.between(0, changes.length, (from, _to, decoration) => {
    const widget = decoration.spec.widget;
    if (widget instanceof TableWidget && widget.height > 0) {
      heights.set(changes.mapPos(from, -1), widget.height);
    }
  });
  return heights;
}
