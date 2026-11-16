import {
    buildNoteImageMarkdown,
    buildNoteLinkMarkdown,
    collectNoteAssetNames,
    findNoteInlineTokenAt,
    findNoteInlineTokens,
    isNoteAssetPath,
    isSafeLinkUrl
} from '../modules/note-inline.js';
import { formatChecklistCellContent } from '../modules/ui-renderer.js';
import { assert, assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const pick = token => ({ type: token.type, label: token.label, target: token.target });

test('note text yields links and images in source order', () => {
    const source = '[Figma](https://figma.com/design/a?node-id=1-2) ![에러 상태](assets/20261116-143205.png) 문구 다름';
    assertDeepEqual(findNoteInlineTokens(source).map(pick), [
        { type: 'link', label: 'Figma', target: 'https://figma.com/design/a?node-id=1-2' },
        { type: 'image', label: '에러 상태', target: 'assets/20261116-143205.png' }
    ]);
});

test('token offsets cover exactly the markdown that was written', () => {
    const source = 'a [b](https://c.dev) d';
    const [token] = findNoteInlineTokens(source);
    assertEqual(source.slice(token.from, token.to), '[b](https://c.dev)');
});

test('a bare URL is a link labelled by its host, without trailing punctuation', () => {
    const source = '참고: https://www.example.com/docs/a.';
    const [token] = findNoteInlineTokens(source);
    assertEqual(token.target, 'https://www.example.com/docs/a');
    assertEqual(token.label, 'example.com');
    assertEqual(source.slice(token.from, token.to), 'https://www.example.com/docs/a');
});

test('an empty label falls back to the host or the file name', () => {
    const tokens = findNoteInlineTokens('![](assets/shot.png) ![](https://cdn.dev/img/a.webp?x=1)');
    assertDeepEqual(tokens.map(token => token.label), ['shot.png', 'a.webp']);
    assertEqual(tokens[0].text, '');
});

test('a link target may hold balanced parentheses', () => {
    const [token] = findNoteInlineTokens('[wiki](https://en.wikipedia.org/wiki/Foo_(bar))');
    assertEqual(token.target, 'https://en.wikipedia.org/wiki/Foo_(bar)');
});

test('unsafe or unknown targets stay plain text', () => {
    assertEqual(findNoteInlineTokens('[x](javascript:alert(1))').length, 0);
    assertEqual(findNoteInlineTokens('![x](../secret.png)').length, 0);
    assertEqual(findNoteInlineTokens('![x](assets/../a.png)').length, 0);
    assertEqual(findNoteInlineTokens('[x](assets/a.png)').length, 0);
});

test('text inside backticks is code, not a link', () => {
    assertEqual(findNoteInlineTokens('`[a](https://b.dev)` `https://c.dev`').length, 0);
});

test('only safe paths count as an image in the assets folder', () => {
    assertEqual(isNoteAssetPath('assets/20261116-143205.png'), true);
    assertEqual(isNoteAssetPath('assets/login-modal.JPG'), true);
    assertEqual(isNoteAssetPath('assets/a/b.png'), false);
    assertEqual(isNoteAssetPath('assets/.hidden.png'), false);
    assertEqual(isNoteAssetPath('assets/a.svg'), false);
    assertEqual(isNoteAssetPath('other/a.png'), false);
    assertEqual(isSafeLinkUrl('https://a.dev'), true);
    assertEqual(isSafeLinkUrl('ftp://a.dev'), false);
    assertEqual(isSafeLinkUrl('https://a.dev b'), false);
});

test('the token around a caret is found, and none outside one', () => {
    const source = 'ab [x](https://y.dev) cd';
    assertEqual(findNoteInlineTokenAt(source, 5).target, 'https://y.dev');
    assertEqual(findNoteInlineTokenAt(source, 1), null);
    assertEqual(findNoteInlineTokenAt(source, 1, 8), null);
});

test('image names are collected once each, from image syntax only', () => {
    const source = JSON.stringify({ steps: [
        { note: ['![a](assets/one.png) ![b](assets/two.jpg)'] },
        { note: ['![again](assets/one.png) assets/three.png [x](https://a.dev/assets/four.png)'] }
    ] });
    assertDeepEqual(collectNoteAssetNames(source), ['one.png', 'two.jpg']);
});

test('built markdown parses back to the same link and image', () => {
    const link = buildNoteLinkMarkdown(' 로그인 [모달] ', ' https://a.dev/x ');
    assertEqual(link, '[로그인 모달](https://a.dev/x)');
    assertDeepEqual(findNoteInlineTokens(link).map(pick), [{ type: 'link', label: '로그인 모달', target: 'https://a.dev/x' }]);
    assertEqual(buildNoteLinkMarkdown('', 'https://a.dev/x'), 'https://a.dev/x');
    assertEqual(buildNoteImageMarkdown('', 'assets/a.png'), '![](assets/a.png)');
});

test('a rich cell renders chips; a plain cell leaves the same text alone', () => {
    const source = '[Figma](https://figma.com/a) ![shot](assets/a.png) `[!note]`';
    const rich = formatChecklistCellContent(source, { rich: true });
    assert(rich.includes('data-note-link="https://figma.com/a"'));
    assert(rich.includes('data-note-image="assets/a.png"'));
    assert(rich.includes('checklist-alert-token--note'));
    assert(!rich.includes('[Figma]'));
    const plain = formatChecklistCellContent(source);
    assert(!plain.includes('note-chip'));
    assert(plain.includes('[Figma](https://figma.com/a)'));
});

test('chip labels and targets are escaped', () => {
    const rich = formatChecklistCellContent('[<b>x</b>](https://a.dev/?q="><script>)', { rich: true });
    assert(!rich.includes('<b>'));
    assert(!rich.includes('"><script>'));
    assert(rich.includes('&lt;b&gt;x&lt;/b&gt;'));
});
