/**
 * How a code editor shows its text. The stored text never changes with the
 * view; only its presentation does.
 *
 *   source  the text as written
 *   live    parts of it render as editing UI (today: markdown tables)
 *
 * Only markdown has a live view, so other languages have no view at all.
 * Code dividers and note code blocks share these rules.
 */

export const CODE_VIEWS = Object.freeze(['source', 'live']);
export const DEFAULT_CODE_VIEW = 'live';

const LIVE_VIEW_LANGS = Object.freeze(['markdown']);

export function hasCodeView(lang) {
    return LIVE_VIEW_LANGS.includes(String(lang || '').trim().toLowerCase());
}

/**
 * View the editor should use: '' for languages without views, else the stored
 * pick, falling back to the default for empty or unknown values.
 */
export function resolveCodeView(lang, view) {
    if (!hasCodeView(lang)) return '';
    const id = typeof view === 'string' ? view.trim().toLowerCase() : '';
    return CODE_VIEWS.includes(id) ? id : DEFAULT_CODE_VIEW;
}

/**
 * Value to store: the default is omitted. Unknown values are kept so a view
 * added by a newer build survives an older one.
 */
export function storedCodeView(view) {
    const id = typeof view === 'string' ? view.trim().toLowerCase() : '';
    return id && id !== DEFAULT_CODE_VIEW ? id : '';
}

/**
 * Line wrapping per language, like VS Code: prose (markdown) wraps to the
 * editor width, code keeps one source line per screen line.
 */
export const CODE_WRAPS = Object.freeze(['off', 'on']);

export function defaultCodeWrap(lang) {
    return String(lang || '').trim().toLowerCase() === 'markdown' ? 'on' : 'off';
}
