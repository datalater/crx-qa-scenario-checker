/**
 * Divider row model.
 *
 * Stored shapes (all still readable):
 *   true                                   empty text divider
 *   "Error cases"                          text divider
 *   { value, color?, type?, lang? }        divider with attributes
 *
 * `type` stores what the text *is* (text, code, ...). How a type
 * is edited lives in DIVIDER_TYPES. Code types highlight with the type's
 * default `lang` unless the row picks another one; the default is not stored.
 *
 * Every write goes through `serializeDivider({ ...parseDivider(raw), patch })`
 * so changing one attribute can never drop another.
 */

export const DEFAULT_DIVIDER_TYPE = 'text';

// Adding a type is one entry here. `editor` picks the renderer ('text' or
// 'code'); `lang` is the default CodeMirror language for code editors. tsx is
// the default because it is a superset of the JS-like pseudo-code people write.
export const DIVIDER_TYPES = Object.freeze({
    text: Object.freeze({ label: 'Text', editor: 'text' }),
    code: Object.freeze({ label: 'Code', editor: 'code', lang: 'tsx', placeholder: 'Write code' })
});

// Explicit "no highlighting" for a code divider. An empty `lang` already means
// "use the type default", so plain text needs its own id.
export const PLAIN_DIVIDER_LANG = 'plain';

export const DIVIDER_TYPE_IDS = Object.freeze(Object.keys(DIVIDER_TYPES));

const DEFAULT_DIVIDER_LABEL = 'divider';

function normalizeDividerType(value) {
    const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return type || DEFAULT_DIVIDER_TYPE;
}

function normalizeDividerLang(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * `lang` only means something for code types. It is dropped for known text
 * types, kept for unknown types (they may be code in a newer build), and
 * omitted when it equals the type default.
 */
function storedDividerLang(type, lang) {
    if (!lang) return '';
    const known = Object.prototype.hasOwnProperty.call(DIVIDER_TYPES, type) ? DIVIDER_TYPES[type] : null;
    if (known && (known.editor !== 'code' || known.lang === lang)) return '';
    return lang;
}

/** Language the editor should use: the row's pick, else the type default. */
export function resolveDividerLang(divider) {
    const typeDef = resolveDividerType(divider?.type);
    if (typeDef.editor !== 'code') return '';
    return normalizeDividerLang(divider?.lang) || typeDef.lang || '';
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

/**
 * Any stored divider value -> `{ value, type, color, lang }`, or null when the
 * value is not a divider. An empty divider (`true`) has `value: ''`.
 */
export function parseDivider(raw) {
    if (raw === true) return { value: '', type: DEFAULT_DIVIDER_TYPE, color: '', lang: '' };
    if (typeof raw === 'string') {
        const value = raw.trim();
        return value ? { value, type: DEFAULT_DIVIDER_TYPE, color: '', lang: '' } : null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('value' in raw)) return null;

    const type = normalizeDividerType(raw.type);
    const color = typeof raw.color === 'string' ? raw.color.trim() : '';
    const lang = normalizeDividerLang(raw.lang);
    if (raw.value === true) return { value: '', type, color, lang };
    const value = normalizeDividerText(raw.value, type);
    return value ? { value, type, color, lang } : null;
}

/**
 * `{ value, type, color, lang }` -> the shortest stored shape. Defaults are omitted
 * and an empty value becomes `true`, so the row stays a divider while the
 * user clears its text.
 */
export function serializeDivider(divider) {
    const source = divider && typeof divider === 'object' ? divider : {};
    const type = normalizeDividerType(source.type);
    const color = typeof source.color === 'string' ? source.color.trim() : '';
    const lang = storedDividerLang(type, normalizeDividerLang(source.lang));
    const value = normalizeDividerText(source.value, type) || true;

    if (type === DEFAULT_DIVIDER_TYPE && !color && !lang) return value;
    const stored = { value };
    if (type !== DEFAULT_DIVIDER_TYPE) stored.type = type;
    if (lang) stored.lang = lang;
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
