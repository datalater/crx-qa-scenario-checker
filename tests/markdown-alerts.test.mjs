import { markdownLanguage } from '@codemirror/lang-markdown';
import { findAlertTokens } from '../src/markdown-alerts.js';
import { formatChecklistCellContent } from '../modules/ui-renderer.js';
import { getChecklistAlertConfig } from '../modules/checklist-alerts.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const tokens = (source, options) => findAlertTokens(source, markdownLanguage.parser.parse(source), options);

test('live markdown recognizes the same five inline alert tokens as checklist cells', () => {
    const source = '`[!note]` `[!warning]` `[!important]` `[!caution]` `[!TIP]`';
    assertDeepEqual(tokens(source).map(item => item.config.className), ['note', 'warning', 'important', 'caution', 'tip']);
    assertEqual(formatChecklistCellContent('`[!note]`').includes('checklist-alert-token--note'), true);
});

test('alert icons use the bundled GitHub Octicons and inherit their color', () => {
    const starts = {
        note: 'M0 8a8 8', tip: 'M8 1.5c-2.363', important: 'M0 1.75C0',
        warning: 'M6.457 1.047c', caution: 'M4.47.22'
    };
    for (const [name, start] of Object.entries(starts)) {
        const icon = getChecklistAlertConfig(`[!${name}]`).icon;
        assertEqual(icon.includes(`d="${start}`), true);
        assertEqual(icon.includes('fill="currentColor"'), true);
    }
});

test('alerts do not match plain text, unknown tokens, code fences or escaped backticks', () => {
    const source = '[!note] `[!other]` \\`[!tip]\\`\n\n```\n`[!warning]`\n```';
    assertEqual(tokens(source).length, 0);
});

test('table alerts can be rendered separately from editor-level alerts', () => {
    const source = '`[!note]`\n\n| head |\n| --- |\n| `[!tip]` |';
    assertDeepEqual(tokens(source).map(item => item.config.className), ['note', 'tip']);
    assertDeepEqual(tokens(source, { skipTables: true }).map(item => item.config.className), ['note']);
});
