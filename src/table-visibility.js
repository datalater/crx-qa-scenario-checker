// Keep hidden column indexes aligned with edits made through the widget.
export function shiftHiddenColumns(hidden, index, operation) {
  if (operation === 'insert') return hidden.map(c => c >= index ? c + 1 : c);
  return hidden.filter(c => c !== index).map(c => c > index ? c - 1 : c);
}
