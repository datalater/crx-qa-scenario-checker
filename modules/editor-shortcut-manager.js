import { EDITOR_CONFIG } from '../configs/editor-config.js';

export function isEditorSaveShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.save);
}

export function isEditorUndoShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.undo);
}

export function isEditorRedoShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.redoByShift)
        || isShortcutMatch(event, config?.shortcuts?.redoByCtrlY);
}

export function isEditorCursorHistoryBackShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.cursorHistoryBack);
}

export function isEditorCursorHistoryForwardShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.cursorHistoryForward);
}

export function isEditorFindOpenShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.findOpen);
}

export function isEditorReplaceOpenShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.replaceOpenMac)
        || isShortcutMatch(event, config?.shortcuts?.replaceOpenWinLinux);
}

export function isEditorFindNextShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.findNext);
}

export function isEditorFindPreviousShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.findPrevious);
}

export function isEditorFindCloseShortcut(event, config = EDITOR_CONFIG) {
    return isShortcutMatch(event, config?.shortcuts?.findClose);
}

export function runNativeEditCommand(documentObject, command) {
    if (!documentObject || typeof documentObject.execCommand !== 'function') return false;
    try {
        return documentObject.execCommand(command) !== false;
    } catch (_) {
        return false;
    }
}

function isShortcutMatch(event, shortcut) {
    if (!event || event.isComposing || !shortcut) return false;
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;

    if (typeof shortcut.primary === 'boolean' && hasPrimaryModifier !== shortcut.primary) return false;
    if (typeof shortcut.ctrl === 'boolean' && event.ctrlKey !== shortcut.ctrl) return false;
    if (typeof shortcut.meta === 'boolean' && event.metaKey !== shortcut.meta) return false;
    if (typeof shortcut.shift === 'boolean' && event.shiftKey !== shortcut.shift) return false;
    if (typeof shortcut.alt === 'boolean' && event.altKey !== shortcut.alt) return false;

    const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const hasCodeMatch = Array.isArray(shortcut.codes) && shortcut.codes.includes(event.code);
    const hasKeyMatch = Array.isArray(shortcut.keys) && shortcut.keys.some(key => key.toLowerCase() === normalizedKey);
    return hasCodeMatch || hasKeyMatch;
}
