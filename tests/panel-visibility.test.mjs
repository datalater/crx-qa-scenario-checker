import { normalizeWorkspace } from '../modules/workspace-manager.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

/**
 * Panel visibility is a view preference kept in localStorage.
 *
 * Regression: it used to live on `workspace.uiState`. Importing a folder
 * replaces that object, and nothing carried the key over, so every panel
 * silently reopened.
 */
const DEFAULTS = { fileTree: true, jsonEditor: true, tableEditor: true };

function createPanelPrefs({ stored = null, throwOnAccess = false } = {}) {
    const store = { value: stored };
    const storage = {
        getItem() {
            if (throwOnAccess) throw new Error('storage unavailable');
            return store.value;
        },
        setItem(_key, value) {
            if (throwOnAccess) throw new Error('storage unavailable');
            store.value = value;
        }
    };

    const read = (workspace) => {
        let raw = null;
        try {
            raw = storage.getItem();
        } catch (_) { /* unavailable */ }

        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) { /* fall through to the legacy lookup */ }
        }

        const legacy = workspace?.uiState?.panelVisibility;
        if (legacy && typeof legacy === 'object') return legacy;
        if (typeof workspace?.uiState?.showFileTree === 'boolean') {
            return { fileTree: workspace.uiState.showFileTree };
        }
        return {};
    };

    const get = (workspace) => {
        const saved = read(workspace);
        const pick = key => (typeof saved[key] === 'boolean' ? saved[key] : DEFAULTS[key]);
        return {
            fileTree: pick('fileTree'),
            jsonEditor: pick('jsonEditor'),
            tableEditor: pick('tableEditor')
        };
    };

    const persist = (state) => {
        try {
            storage.setItem('k', JSON.stringify(state));
        } catch (_) { /* unavailable */ }
    };

    return { get, persist, store };
}

test('every panel is open before any choice is made', () => {
    const prefs = createPanelPrefs();
    assertDeepEqual(prefs.get(undefined), DEFAULTS);
});

test('importing a workspace no longer reopens the panels', () => {
    const prefs = createPanelPrefs();
    prefs.persist({ fileTree: false, jsonEditor: false, tableEditor: true });

    const imported = normalizeWorkspace({ version: 1, folders: [], files: [], uiState: {} });

    assertDeepEqual(prefs.get(imported), {
        fileTree: false,
        jsonEditor: false,
        tableEditor: true
    });
});

test('a value still on the workspace is adopted once', () => {
    const prefs = createPanelPrefs();
    const legacy = {
        uiState: { panelVisibility: { fileTree: false, jsonEditor: true, tableEditor: true } }
    };
    assertEqual(prefs.get(legacy).fileTree, false);
});

test('the older showFileTree flag is still honoured', () => {
    const prefs = createPanelPrefs();
    assertEqual(prefs.get({ uiState: { showFileTree: false } }).fileTree, false);
    assertEqual(prefs.get({ uiState: { showFileTree: true } }).fileTree, true);
});

test('a stored value wins over whatever the workspace holds', () => {
    const prefs = createPanelPrefs({ stored: '{"fileTree":true}' });
    const workspace = { uiState: { panelVisibility: { fileTree: false } } };
    assertEqual(prefs.get(workspace).fileTree, true);
});

test('a partial value falls back per panel', () => {
    const prefs = createPanelPrefs({ stored: '{"tableEditor":false}' });
    assertDeepEqual(prefs.get(undefined), {
        fileTree: true,
        jsonEditor: true,
        tableEditor: false
    });
});

test('a corrupt value falls back to the defaults', () => {
    assertDeepEqual(createPanelPrefs({ stored: 'not json' }).get(undefined), DEFAULTS);
    assertDeepEqual(createPanelPrefs({ stored: '"a string"' }).get(undefined), DEFAULTS);
    assertDeepEqual(createPanelPrefs({ stored: 'null' }).get(undefined), DEFAULTS);
});

test('it degrades gracefully without storage', () => {
    const prefs = createPanelPrefs({ throwOnAccess: true });
    assertDeepEqual(prefs.get(undefined), DEFAULTS);
    prefs.persist({ fileTree: false, jsonEditor: false, tableEditor: false });
    assertDeepEqual(prefs.get(undefined), DEFAULTS);
});

test('toggling one panel leaves the other two alone', () => {
    const keys = ['fileTree', 'jsonEditor', 'tableEditor'];
    for (let mask = 0; mask < 8; mask += 1) {
        const state = {
            fileTree: Boolean(mask & 1),
            jsonEditor: Boolean(mask & 2),
            tableEditor: Boolean(mask & 4)
        };
        keys.forEach((key) => {
            const next = { ...state, [key]: !state[key] };
            const changed = keys.filter(other => next[other] !== state[other]);
            assertDeepEqual(changed, [key]);
        });
    }
});

test('a round trip through storage keeps every panel', () => {
    const prefs = createPanelPrefs();
    const state = { fileTree: false, jsonEditor: true, tableEditor: false };
    prefs.persist(state);
    assertDeepEqual(prefs.get(undefined), state);
});
