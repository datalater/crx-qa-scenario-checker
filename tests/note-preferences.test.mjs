import { assertEqual, test } from './lib/test-runner.mjs';

/**
 * Mirrors the localStorage-backed preferences in script.js: the remembered
 * code language and the note panel width. Both fall back safely when storage
 * is unavailable or holds a value the app can no longer honour.
 */
const DEFAULT_NOTE_CODE_LANG = 'javascript';
const NOTE_PANEL_MIN_WIDTH = 320;
const NOTE_PANEL_DEFAULT_WIDTH = 680;

function createStorage(initial = {}, { throwOnAccess = false } = {}) {
    const data = { ...initial };
    return {
        getItem(key) {
            if (throwOnAccess) throw new Error('storage unavailable');
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem(key, value) {
            if (throwOnAccess) throw new Error('storage unavailable');
            data[key] = String(value);
        },
        _data: data
    };
}

function createLangPref(storage, supported) {
    const KEY = 'lang';
    const readRememberedCodeLang = () => {
        let stored = null;
        try {
            stored = storage.getItem(KEY);
        } catch (_) { /* unavailable */ }

        if (stored === null) return DEFAULT_NOTE_CODE_LANG;
        if (stored === '') return '';
        if (supported.length > 0 && !supported.includes(stored)) return DEFAULT_NOTE_CODE_LANG;
        return stored;
    };
    const rememberCodeLang = (lang) => {
        const next = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
        if (next && !supported.includes(next)) return;
        try {
            storage.setItem(KEY, next);
        } catch (_) { /* unavailable */ }
    };
    return { readRememberedCodeLang, rememberCodeLang };
}

const LANGS = ['javascript', 'typescript', 'jsx', 'tsx', 'json', 'html', 'css'];

test('a new code block defaults to javascript before any choice is made', () => {
    const { readRememberedCodeLang } = createLangPref(createStorage(), LANGS);
    assertEqual(readRememberedCodeLang(), DEFAULT_NOTE_CODE_LANG);
});

test('the last chosen language is reused for the next code block', () => {
    const storage = createStorage();
    const pref = createLangPref(storage, LANGS);

    pref.rememberCodeLang('tsx');
    assertEqual(pref.readRememberedCodeLang(), 'tsx');

    pref.rememberCodeLang('css');
    assertEqual(pref.readRememberedCodeLang(), 'css');
});

test('plain text is a real choice and is remembered', () => {
    const storage = createStorage();
    const pref = createLangPref(storage, LANGS);

    pref.rememberCodeLang('');
    assertEqual(storage._data.lang, '');
    assertEqual(pref.readRememberedCodeLang(), '');
});

test('the language is normalized before being stored', () => {
    const storage = createStorage();
    const pref = createLangPref(storage, LANGS);

    pref.rememberCodeLang('  TSX  ');
    assertEqual(storage._data.lang, 'tsx');
});

test('an unsupported language is never stored', () => {
    const storage = createStorage();
    const pref = createLangPref(storage, LANGS);

    pref.rememberCodeLang('rust');
    assertEqual('lang' in storage._data, false);
    assertEqual(pref.readRememberedCodeLang(), DEFAULT_NOTE_CODE_LANG);
});

test('a language that disappeared from the bundle falls back', () => {
    // Written by an older build that still shipped `coffeescript`.
    const storage = createStorage({ lang: 'coffeescript' });
    const pref = createLangPref(storage, LANGS);
    assertEqual(pref.readRememberedCodeLang(), DEFAULT_NOTE_CODE_LANG);
});

test('the remembered language survives when the language list is empty', () => {
    // The bundle has not loaded yet, so nothing can be validated against.
    const storage = createStorage({ lang: 'tsx' });
    const pref = createLangPref(storage, []);
    assertEqual(pref.readRememberedCodeLang(), 'tsx');
});

test('language preference degrades gracefully without storage', () => {
    const storage = createStorage({}, { throwOnAccess: true });
    const pref = createLangPref(storage, LANGS);
    assertEqual(pref.readRememberedCodeLang(), DEFAULT_NOTE_CODE_LANG);
    pref.rememberCodeLang('tsx');
    assertEqual(pref.readRememberedCodeLang(), DEFAULT_NOTE_CODE_LANG);
});

function clampPanelWidth(width, viewportWidth) {
    const maxWidth = Math.max(NOTE_PANEL_MIN_WIDTH, viewportWidth - 80);
    return Math.round(Math.min(Math.max(width, NOTE_PANEL_MIN_WIDTH), maxWidth));
}

test('panel width is clamped to a usable minimum', () => {
    assertEqual(clampPanelWidth(100, 1440), NOTE_PANEL_MIN_WIDTH);
    assertEqual(clampPanelWidth(-50, 1440), NOTE_PANEL_MIN_WIDTH);
});

test('panel width leaves room for the table on wide screens', () => {
    assertEqual(clampPanelWidth(5000, 1440), 1360);
});

test('the minimum wins on a narrow viewport', () => {
    // 360 - 80 = 280, below the minimum, so the minimum is used.
    assertEqual(clampPanelWidth(680, 360), NOTE_PANEL_MIN_WIDTH);
});

test('a width inside the range is kept as-is', () => {
    assertEqual(clampPanelWidth(NOTE_PANEL_DEFAULT_WIDTH, 1440), NOTE_PANEL_DEFAULT_WIDTH);
});

test('a stored width is restored, and a corrupt one falls back', () => {
    const read = (raw) => {
        const parsed = Number.parseInt(raw ?? '', 10);
        return Number.isFinite(parsed) ? parsed : NOTE_PANEL_DEFAULT_WIDTH;
    };
    assertEqual(read('880'), 880);
    assertEqual(read(null), NOTE_PANEL_DEFAULT_WIDTH);
    assertEqual(read('not-a-number'), NOTE_PANEL_DEFAULT_WIDTH);
    assertEqual(read(''), NOTE_PANEL_DEFAULT_WIDTH);
});

test('the drag handle on the left edge maps cursor x to width', () => {
    // The panel is right-anchored: width = viewport - cursorX.
    const widthFromCursor = (cursorX, viewportWidth) =>
        clampPanelWidth(viewportWidth - cursorX, viewportWidth);

    assertEqual(widthFromCursor(760, 1440), 680);
    assertEqual(widthFromCursor(440, 1440), 1000);
    assertEqual(widthFromCursor(1400, 1440), NOTE_PANEL_MIN_WIDTH);
});

test('shrinking then widening the window restores the chosen width', () => {
    // Regression: re-clamping the rendered width instead of the stored
    // preference shrank the panel permanently.
    const stored = 1000;
    const render = (viewportWidth) => clampPanelWidth(stored, viewportWidth);

    assertEqual(render(1440), 1000);
    assertEqual(render(700), 620);
    assertEqual(render(1440), 1000);
});

test('a resize never rewrites the stored preference', () => {
    const storage = createStorage({ width: '1000' });
    const readStored = () => {
        const parsed = Number.parseInt(storage.getItem('width') ?? '', 10);
        return Number.isFinite(parsed) ? parsed : NOTE_PANEL_DEFAULT_WIDTH;
    };

    // Rendering on a narrow window must not touch storage.
    clampPanelWidth(readStored(), 700);
    assertEqual(storage._data.width, '1000');
    assertEqual(readStored(), 1000);
});
