/**
 * Divider row model.
 *
 * Stored shapes (all still readable):
 *   true                                   empty text divider
 *   "Error cases"                          text divider
 *   { value, color?, type?, lang?, height?, view?, wrap? } divider with attributes
 *
 * `type` stores what the text *is* (text, code, ...). How a type
 * is edited lives in DIVIDER_TYPES. Code types also take `lang`, `height`,
 * `view` (source/live, markdown only) and `wrap` (off/on, default per
 * language); each falls back to its default, and a default is never stored.
 *
 * Every write goes through `serializeDivider({ ...parseDivider(raw), patch })`
 * so changing one attribute can never drop another.
 */

import { parseCodeHeightPx } from './code-height.js';
import { CODE_WRAPS, DEFAULT_CODE_VIEW, defaultCodeWrap, resolveCodeView } from './code-view.js';

export const DEFAULT_DIVIDER_TYPE = 'text';

// Adding a type is one entry here. `editor` picks the renderer ('text' or
// 'code'). Code editors also define defaults for the code attributes below:
// tsx is a superset of the JS-like pseudo-code people write, and `fixed`
// keeps a long block from pushing the table down.
export const DIVIDER_TYPES = Object.freeze({
    text: Object.freeze({ label: 'Text', editor: 'text' }),
    code: Object.freeze({
        label: 'Code',
        editor: 'code',
        lang: 'tsx',
        height: 'fixed',
        view: DEFAULT_CODE_VIEW,
        placeholder: 'Write code'
    })
});

// `fixed` caps the editor (it scrolls past that); `auto` grows to fit. A
// dragged height ("480px", see code-height.js) is also valid.
export const DIVIDER_HEIGHTS = Object.freeze(['fixed', 'auto']);

// `off` scrolls long lines sideways; `on` wraps them to the editor width.
// The default depends on the language (see defaultCodeWrap).
export const DIVIDER_WRAPS = CODE_WRAPS;

// Explicit "no highlighting" for a code divider. An empty `lang` already means
// "use the type default", so plain text needs its own id.
export const PLAIN_DIVIDER_LANG = 'plain';

export const DIVIDER_TYPE_IDS = Object.freeze(Object.keys(DIVIDER_TYPES));

const DEFAULT_DIVIDER_LABEL = 'divider';

function normalizeDividerType(value) {
    const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return type || DEFAULT_DIVIDER_TYPE;
}

// Attributes that only mean something for code editors.
const CODE_ATTRIBUTES = Object.freeze(['lang', 'height', 'view', 'wrap']);

function normalizeAttribute(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * A code attribute is dropped for known text types, kept for unknown types
 * (they may be code in a newer build), and omitted when it equals the type
 * default.
 */
function storedCodeAttribute(type, key, value, divider) {
    if (!value) return '';
    const known = Object.prototype.hasOwnProperty.call(DIVIDER_TYPES, type) ? DIVIDER_TYPES[type] : null;
    if (!known) return value;
    if (known.editor !== 'code') return '';
    // wrap's default follows the language rather than the type.
    const fallback = key === 'wrap' ? defaultCodeWrap(resolveDividerLang({ ...divider, type })) : known[key];
    return fallback === value ? '' : value;
}

function resolveCodeAttribute(divider, key) {
    const typeDef = resolveDividerType(divider?.type);
    if (typeDef.editor !== 'code') return '';
    return normalizeAttribute(divider?.[key]) || typeDef[key] || '';
}

/** Language the editor should use: the row's pick, else the type default. */
export function resolveDividerLang(divider) {
    return resolveCodeAttribute(divider, 'lang');
}

/**
 * View the editor should use: '' unless the language has views (markdown).
 * A stored view outside markdown is ignored but kept.
 */
export function resolveDividerView(divider) {
    if (resolveDividerType(divider?.type).editor !== 'code') return '';
    return resolveCodeView(resolveDividerLang(divider), divider?.view);
}

/** Line wrapping for code editors (default per language); '' for text types. */
export function resolveDividerWrap(divider) {
    if (resolveDividerType(divider?.type).editor !== 'code') return '';
    const wrap = normalizeAttribute(divider?.wrap);
    return DIVIDER_WRAPS.includes(wrap) ? wrap : defaultCodeWrap(resolveDividerLang(divider));
}

/**
 * Height mode the editor should use. An unknown stored value renders as the
 * type default but is still preserved by serialize.
 */
export function resolveDividerHeight(divider) {
    const height = resolveCodeAttribute(divider, 'height');
    if (!height) return '';
    if (DIVIDER_HEIGHTS.includes(height) || parseCodeHeightPx(height) !== null) return height;
    return resolveDividerType(divider?.type).height;
}

/**
 * Unknown types render as text. The original type id stays in the data
 * (see parse/serialize), so a newer type is not lost by an older build.
 */
export function resolveDividerType(type) {
    const id = normalizeDividerType(type);
    return Object.prototype.hasOwnProperty.call(DIVIDER_TYPES, id)
        ? DIVIDER_TYPES[id]
        : DIVIDER_TYPES[DEFAULT_DIVIDER_TYPE];
}

/** Code keeps its indentation; other types are trimmed like before. */
function normalizeDividerText(value, type) {
    if (typeof value !== 'string') return '';
    if (resolveDividerType(type).editor === 'code') {
        return value.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '');
    }
    return value.trim();
}

function emptyDivider(type, value = '') {
    return { value, type, color: '', lang: '', height: '', view: '', wrap: '' };
}

/**
 * Any stored divider value -> `{ value, type, color, lang, height, view, wrap }`, or null
 * when the value is not a divider. An empty divider (`true`) has `value: ''`.
 */
export function parseDivider(raw) {
    if (raw === true) return emptyDivider(DEFAULT_DIVIDER_TYPE);
    if (typeof raw === 'string') {
        const value = raw.trim();
        return value ? emptyDivider(DEFAULT_DIVIDER_TYPE, value) : null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('value' in raw)) return null;

    const type = normalizeDividerType(raw.type);
    const value = raw.value === true ? '' : normalizeDividerText(raw.value, type);
    if (!value && raw.value !== true) return null;
    return {
        value,
        type,
        color: typeof raw.color === 'string' ? raw.color.trim() : '',
        lang: normalizeAttribute(raw.lang),
        height: normalizeAttribute(raw.height),
        view: normalizeAttribute(raw.view),
        wrap: normalizeAttribute(raw.wrap)
    };
}

/**
 * Parsed divider -> the shortest stored shape. Defaults are omitted and an
 * empty value becomes `true`, so the row stays a divider while the user
 * clears its text.
 */
export function serializeDivider(divider) {
    const source = divider && typeof divider === 'object' ? divider : {};
    const type = normalizeDividerType(source.type);
    const color = typeof source.color === 'string' ? source.color.trim() : '';
    const value = normalizeDividerText(source.value, type) || true;
    const codeAttributes = CODE_ATTRIBUTES
        .map(key => [key, storedCodeAttribute(type, key, normalizeAttribute(source[key]), source)])
        .filter(([, attribute]) => attribute);

    if (type === DEFAULT_DIVIDER_TYPE && !color && codeAttributes.length === 0) return value;
    const stored = { value };
    if (type !== DEFAULT_DIVIDER_TYPE) stored.type = type;
    codeAttributes.forEach(([key, attribute]) => { stored[key] = attribute; });
    if (color) stored.color = color;
    return stored;
}

export function isDivider(raw) {
    return parseDivider(raw) !== null;
}

/** Display/search text; an empty divider shows a fixed label. */
export function getDividerTitle(raw) {
    const divider = parseDivider(raw);
    if (!divider) return '';
    return divider.value || DEFAULT_DIVIDER_LABEL;
}
