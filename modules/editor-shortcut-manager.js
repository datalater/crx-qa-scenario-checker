export function runNativeEditCommand(documentObject, command) {
    if (!documentObject || typeof documentObject.execCommand !== 'function') return false;
    try {
        return documentObject.execCommand(command) !== false;
    } catch (_) {
        return false;
    }
}
