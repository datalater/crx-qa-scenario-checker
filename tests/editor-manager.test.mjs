import { syntaxHighlight } from '../modules/editor-manager.js';
import { assert, test } from './lib/test-runner.mjs';

test('syntaxHighlight marks search query matches case-insensitively', () => {
    const output = syntaxHighlight('{"title":"Alpha beta"}', -1, 'alpha');
    assert(output.includes('<mark class="json-search-hit">Alpha</mark>'));
});

test('syntaxHighlight keeps escaping while applying search marks', () => {
    const output = syntaxHighlight('{"html":"<tag>"}', -1, 'tag');
    assert(output.includes('&lt;<mark class="json-search-hit">tag</mark>&gt;'));
});
