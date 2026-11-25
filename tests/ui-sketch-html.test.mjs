import { isInsideUiFence, renderUiSketchHtml, splitUiFences } from '../modules/ui-sketch-html.js';
import { formatChecklistCellContent } from '../modules/ui-renderer.js';
import { stepLinesToText, toStepLines } from '../modules/step-lines.js';
import { assert, assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('a sketch is a grid whose last column of each line runs to the edge', () => {
    const html = renderUiSketchHtml('A -- B --- C\n-- D');
    assert(html.startsWith('<div class="ui-sketch" style="grid-template-columns:max-content minmax(0, 1fr);--ui-sketch-depth:0">'));
    assert(html.includes('style="grid-row:1;grid-column:1"><span class="ui-sketch__text">A</span>'));
    assert(html.includes('style="grid-row:1;grid-column:2 / -1"><span class="ui-sketch__text">B</span><span class="ui-sketch__spacer"></span>'));
    assert(html.includes('style="grid-row:2;grid-column:1"></div>'), 'the empty first column of `-- D`');
    assert(html.includes('style="grid-row:2;grid-column:2 / -1"><span class="ui-sketch__text">D</span>'));
});

test('roles, buttons and values are drawn, and a group is marked', () => {
    const html = renderUiSketchHtml('@header(@title(제목) --- [[저장]] {count})');
    assert(html.includes('<span class="ui-sketch__role has-spacer is-group"><span class="ui-sketch__role-name">header</span>'));
    assert(html.includes('<span class="ui-sketch__role"><span class="ui-sketch__role-name">title</span>'));
    assert(html.includes('<span class="ui-sketch__button is-primary">저장</span>'));
    assert(html.includes('<span class="ui-sketch__var">count</span>'));
});

test('content is escaped, and a broken line shows as written', () => {
    const html = renderUiSketchHtml('@a(<img src=x onerror="1">)\n\n@b(닫지 않음');
    assert(!html.includes('<img'));
    assert(html.includes('&lt;img src=x onerror=&quot;1&quot;&gt;'));
    assert(html.includes('class="ui-sketch__gap"'));
    assert(html.includes('class="ui-sketch__error"'));
    assert(html.includes('@b(닫지 않음'));
});

test('cell text splits into the text around a fence and the fence itself', () => {
    assertDeepEqual(splitUiFences('위 문장\n\n```ui\n@a(1)\n-- 2\n```\n아래 문장'), [
        { type: 'text', value: '위 문장\n' },
        { type: 'ui', source: '@a(1)\n-- 2' },
        { type: 'text', value: '아래 문장' }
    ]);
    assertDeepEqual(splitUiFences('```ui\n@a(1)\n```'), [{ type: 'ui', source: '@a(1)' }]);
    assertDeepEqual(splitUiFences('```ui\n1\n```\n```ui\n2\n```').map(piece => piece.type), ['ui', 'ui']);
});

test('only a closed, whole-line ui fence counts', () => {
    assertDeepEqual(splitUiFences('```ui\n@a(1)'), [{ type: 'text', value: '```ui\n@a(1)' }]);
    assertDeepEqual(splitUiFences('글자 ```ui\nx\n```').map(piece => piece.type), ['text']);
    assertDeepEqual(splitUiFences('```ts\nconst a = 1;\n```').map(piece => piece.type), ['text']);
    assertDeepEqual(splitUiFences(''), []);
});

test('a cell draws the fence and still renders the text around it', () => {
    const stored = toStepLines('select box가 표시된다 `[!note]`\n\n```ui\n@radio({radio}) -- @label({email})\n```');
    const html = formatChecklistCellContent(stepLinesToText(stored));
    assert(html.includes('checklist-alert-token--note'));
    assert(html.includes('<div class="ui-sketch-frame" contenteditable="false"><div class="ui-sketch"'));
    assert(html.includes('<span class="ui-sketch__role-name">radio</span>'));
    assert(!html.includes('```'));
});

test('nothing inside a fence is read as a cell token', () => {
    const html = formatChecklistCellContent('```ui\n@a(`code` [x](https://a.dev))\n```', { rich: true });
    assert(!html.includes('inline-code'));
    assert(!html.includes('note-chip'));
    assert(html.includes('`code`'));
});

test('a position is known to be inside a ui fence', () => {
    const text = '앞\n```ui\n@title 제목\n```\n@title 뒤';
    assertEqual(isInsideUiFence(text, text.indexOf('제목')), true);
    assertEqual(isInsideUiFence(text, text.indexOf('뒤')), false);
    assertEqual(isInsideUiFence(text, 0), false);
    assertEqual(isInsideUiFence('```ui\n@title 제목', 12), true);
});

test('every column of a line with a role is marked, so loose content can sit level with role content', () => {
    const html = renderUiSketchHtml('@label(이름) -- [입력] -- 필수\n일반 줄 -- [버튼]');
    assertEqual(html.split('class="ui-sketch__line has-role"').length - 1, 3);
    assertEqual(html.split('class="ui-sketch__line"').length - 1, 2);
});

test('directives are drawn beside the role name, apart from it', () => {
    const html = renderUiSketchHtml('@cta:disabled:선택 <시>([적용]) @plain(내용)');
    assert(html.includes('<span class="ui-sketch__role-name">cta<span class="ui-sketch__directive">disabled</span><span class="ui-sketch__directive">선택 &lt;시&gt;</span></span>'));
    assert(html.includes('<span class="ui-sketch__role-name">plain</span>'));
});

test('an error line says what is wrong with it', () => {
    assert(renderUiSketchHtml('@a:b 내용').includes('data-message="조건(:) 뒤에는 &quot;내용&quot; 이나 (내용) 이 와야 합니다"'));
    assert(renderUiSketchHtml('@a(닫지 않음').includes('data-message="닫는 괄호나 따옴표가 없습니다"'));
});

test('a group frames the rows between its markers and names them', () => {
    const html = renderUiSketchHtml('@a(1)\n@group-start-conflict list\n@b(2)\n@group-end-conflict list');
    assert(html.includes('<div class="ui-sketch__group" style="grid-row:2 / 5;grid-column:1 / -1;--ui-sketch-group-depth:0">'));
    assert(html.includes('<div class="ui-sketch__group-name" style="grid-row:2;grid-column:1 / -1">conflict list</div>'));
    const withDirective = renderUiSketchHtml('@group-start-callout:에러일 때\n@b(2)\n@group-end-callout');
    assert(withDirective.includes('>callout<span class="ui-sketch__directive">에러일 때</span></div>'));
    assert(html.includes('class="ui-sketch__group-foot" style="grid-row:4'));
    assert(html.includes('--ui-sketch-depth:1'), 'the gutter makes room for one level');
});

test('a group marker without its partner is reported on its own line', () => {
    const unclosed = renderUiSketchHtml('@group-start-a\n@b(1)');
    assert(unclosed.includes('data-message="@group-end 로 닫지 않았습니다"'));
    assert(unclosed.includes('@group-start-a'));
    assert(renderUiSketchHtml('@group-end-a').includes('data-message="여는 @group-start 가 없습니다"'));
});
