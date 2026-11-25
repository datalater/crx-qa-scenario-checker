import { EMPTY_UI_SKETCH, countUiColumns, hasSpacer, parseGroupLine, parseUiBlock, parseUiLine, splitUiColumns } from '../src/ui-sketch.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const text = value => ({ type: 'text', value });
const button = (value, primary = false) => ({ type: 'button', value, primary });
const role = (name, ...children) => ({ type: 'role', name, children });
const spacer = { type: 'spacer' };

test('a role in parentheses covers exactly what is inside them', () => {
    assertDeepEqual(parseUiLine('@title(시간표 설정) --- @cta01([반영 설정]) @cta02([[일괄 삭제]])'), [
        role('title', text('시간표 설정')),
        spacer,
        role('cta01', button('반영 설정')),
        role('cta02', button('일괄 삭제', true))
    ]);
});

test('without parentheses a role runs to the next role, a spacer, or the line end', () => {
    assertDeepEqual(
        parseUiLine('@title 시간표 설정 --- @cta01 [반영 설정] @cta02 [[일괄 삭제]]'),
        parseUiLine('@title(시간표 설정) --- @cta01([반영 설정]) @cta02([[일괄 삭제]])')
    );
    assertDeepEqual(parseUiLine('@description 주차별 감독 시간을 등록할 수 있습니다.'), [
        role('description', text('주차별 감독 시간을 등록할 수 있습니다.'))
    ]);
});

test('parentheses end a role in the middle of a line', () => {
    assertDeepEqual(parseUiLine('@label(이름) 필수'), [role('label', text('이름')), text('필수')]);
});

test('roles nest, and a group holding a spacer is known to stretch', () => {
    const nodes = parseUiLine('@header(@title(시간표 설정) --- @actions([반영] [[삭제]]))');
    assertDeepEqual(nodes, [
        role('header', role('title', text('시간표 설정')), spacer, role('actions', button('반영'), button('삭제', true)))
    ]);
    assertEqual(hasSpacer(nodes), true);
    assertEqual(hasSpacer(nodes[0].children[0].children), false);
});

test('values and plain text sit beside each other in order', () => {
    assertDeepEqual(parseUiLine('@badge(코스 운영기간 {startAt} ~ {endAt})'), [
        role('badge', text('코스 운영기간'), { type: 'var', name: 'startAt' }, text('~'), { type: 'var', name: 'endAt' })
    ]);
});

test('an @ inside a word and balanced parentheses are content', () => {
    assertDeepEqual(parseUiLine('@placeholder(example@mail.com)'), [role('placeholder', text('example@mail.com'))]);
    assertDeepEqual(parseUiLine('문의: help@mail.com'), [text('문의: help@mail.com')]);
    assertDeepEqual(parseUiLine('@help(8~20자 (영문, 숫자 포함)) --- 0 / 20'), [
        role('help', text('8~20자 (영문, 숫자 포함)')), spacer, text('0 / 20')
    ]);
});

test('a backslash takes the next character literally', () => {
    assertDeepEqual(parseUiLine('@note(웃음 :\\))'), [role('note', text('웃음 :)'))]);
    assertDeepEqual(parseUiLine('\\@title \\[x\\] \\{y\\}'), [text('@title [x] {y}')]);
});

test('dashes only space a line when they stand alone', () => {
    assertDeepEqual(parseUiLine('a --- b'), [text('a'), spacer, text('b')]);
    assertDeepEqual(parseUiLine('a---b ----'), [text('a---b ----')]);
});

test('a block keeps blank lines as gaps and isolates a broken line', () => {
    const rows = parseUiBlock('@title(제목)\n\n@title(닫는 괄호 없음 --- [확인]\n끝');
    assertDeepEqual(rows.map(row => row.type), ['line', 'gap', 'error', 'line']);
    assertEqual(rows[2].raw, '@title(닫는 괄호 없음 --- [확인]');
    assertDeepEqual(rows[3].nodes, [text('끝')]);
});

test('the inserted template parses without errors', () => {
    assertEqual(parseUiBlock(EMPTY_UI_SKETCH).every(row => row.type === 'line'), true);
});

test('quotes scope a role like parentheses do', () => {
    assertDeepEqual(
        parseUiLine('@title"시간표 설정" --- @cta01"[반영 설정]" @cta02"[[일괄 삭제]]"'),
        parseUiLine('@title(시간표 설정) --- @cta01([반영 설정]) @cta02([[일괄 삭제]])')
    );
    assertDeepEqual(parseUiLine('@label"이름" 필수'), [role('label', text('이름')), text('필수')]);
});

test('quoted content keeps parentheses, even unbalanced ones', () => {
    assertDeepEqual(parseUiLine('@help"8~20자 (영문, 숫자 포함"'), [role('help', text('8~20자 (영문, 숫자 포함'))]);
    assertDeepEqual(parseUiLine('@note"웃음 :)" --- 끝'), [role('note', text('웃음 :)')), spacer, text('끝')]);
});

test('a quoted role holds roles in parentheses, and an escaped quote is content', () => {
    assertDeepEqual(parseUiLine('@header"@title(제목) --- @cta([삭제])"'), [
        role('header', role('title', text('제목')), spacer, role('cta', button('삭제')))
    ]);
    assertDeepEqual(parseUiLine('@quote"그는 \\"좋아\\"라고 했다"'), [role('quote', text('그는 "좋아"라고 했다'))]);
});

test('a quote away from a role name is plain text, and an unclosed one is an error', () => {
    assertDeepEqual(parseUiLine('그는 "좋아"라고 했다'), [text('그는 "좋아"라고 했다')]);
    assertDeepEqual(parseUiLine('@title "띄어 쓴 따옴표"'), [role('title', text('"띄어 쓴 따옴표"'))]);
    assertEqual(parseUiBlock('@title"닫는 따옴표 없음 --- [확인]')[0].type, 'error');
});

const column = { type: 'column' };

test('two dashes start a column, three still space the line', () => {
    assertDeepEqual(parseUiLine('A -- B --- C'), [text('A'), column, text('B'), spacer, text('C')]);
    assertDeepEqual(splitUiColumns(parseUiLine('A -- B --- C')), [[text('A')], [text('B'), spacer, text('C')]]);
    assertDeepEqual(splitUiColumns(parseUiLine('-- D')), [[], [text('D')]]);
    assertDeepEqual(splitUiColumns(parseUiLine('no marks')), [[text('no marks')]]);
});

test('a role without parentheses ends at a column mark', () => {
    assertDeepEqual(parseUiLine('@label 이름 -- @field [입력]'), [
        role('label', text('이름')), column, role('field', button('입력'))
    ]);
});

test('inside a role, or without space around them, two dashes are text', () => {
    assertDeepEqual(parseUiLine('@range(1 -- 10)'), [role('range', text('1 -- 10'))]);
    assertDeepEqual(parseUiLine('a--b \\-- c'), [text('a--b -- c')]);
    assertDeepEqual(parseUiLine('a ---- b'), [text('a ---- b')]);
});

test('a block has as many columns as its widest line', () => {
    assertEqual(countUiColumns(parseUiBlock('A -- B --- C\n-- D')), 2);
    assertEqual(countUiColumns(parseUiBlock('a\n\nb -- c -- d\n@x(닫지 않음 -- y')), 3);
    assertEqual(countUiColumns(parseUiBlock('plain')), 1);
});

const withDirectives = (name, directives, ...children) => ({ type: 'role', name, children, directives });

test('a directive runs from the colon to the scope, spaces included', () => {
    assertDeepEqual(parseUiLine('@description:전체 미반영 선택 시"전체 미반영 할 수 없는 일정"'), [
        withDirectives('description', ['전체 미반영 선택 시'], text('전체 미반영 할 수 없는 일정'))
    ]);
    assertDeepEqual(parseUiLine('@cta:disabled([적용])'), [withDirectives('cta', ['disabled'], button('적용'))]);
});

test('more colons give more directives, and empty ones are dropped', () => {
    assertDeepEqual(parseUiLine('@cta:disabled : 전체 반영 선택 시 :([적용])'), [
        withDirectives('cta', ['disabled', '전체 반영 선택 시'], button('적용'))
    ]);
    assertDeepEqual(parseUiLine('@cta:([적용])'), [role('cta', button('적용'))]);
});

test('a directive sits on any role of a line, nested ones too', () => {
    assertDeepEqual(parseUiLine('@label:선택 시"{날짜} · {시간}" --- @count"{count}명"'), [
        withDirectives('label', ['선택 시'], { type: 'var', name: '날짜' }, text('·'), { type: 'var', name: '시간' }),
        spacer,
        role('count', { type: 'var', name: 'count' }, text('명'))
    ]);
    assertDeepEqual(parseUiLine('@row(@help:error"필수 항목입니다")'), [
        role('row', withDirectives('help', ['error'], text('필수 항목입니다')))
    ]);
});

test('an escaped mark is part of the directive', () => {
    assertDeepEqual(parseUiLine('@a:값이 \\"x\\" 일 때\\: 표시"내용"'), [
        withDirectives('a', ['값이 "x" 일 때: 표시'], text('내용'))
    ]);
});

test('a directive without a scope is an error of its own kind', () => {
    const [row] = parseUiBlock('@description:disabled 내용');
    assertEqual(row.type, 'error');
    assertEqual(row.reason, 'directive');
    assertEqual(parseUiBlock('@title(닫지 않음')[0].reason, 'unclosed');
    assertEqual(parseUiBlock('@a:b"닫지 않음')[0].reason, 'unclosed');
});

test('a colon that does not touch the role name is content', () => {
    assertDeepEqual(parseUiLine('@time 12:30 --- 끝'), [role('time', text('12:30')), spacer, text('끝')]);
    assertDeepEqual(parseUiLine('메모: @note(내용)'), [text('메모:'), role('note', text('내용'))]);
});

test('a value may be named in any script', () => {
    assertDeepEqual(parseUiLine('{날짜} {assignedCourses.length} {a b}'), [
        { type: 'var', name: '날짜' }, { type: 'var', name: 'assignedCourses.length' }, { type: 'var', name: 'a b' }
    ]);
    assertDeepEqual(parseUiLine('{} { x}'), [text('{} { x}')]);
});

test('a group line opens and closes by name, which may be left out', () => {
    const rows = parseUiBlock('@group-start-callout\n@a(1)\n@group-end-callout');
    assertDeepEqual(rows.map(row => row.type), ['groupStart', 'line', 'groupEnd']);
    assertDeepEqual(rows.map(row => row.depth), [0, 1, 0]);
    assertEqual(rows[0].name, 'callout');
    assertEqual(rows[0].endIndex, 2);
    assertEqual(parseUiBlock('@group-start\n@group-end')[0].name, 'group');
    assertEqual(Object.hasOwn(rows[0], 'directives'), false, 'none written, none stored');
});

const marker = (edge, name, directives = []) => ({ edge, name, directives });

test('a group name runs to the first colon, dashes and spaces included', () => {
    assertDeepEqual(parseGroupLine('@group-start-conflict-list'), marker('start', 'conflict-list'));
    assertDeepEqual(parseGroupLine('  @group-end-목록 상자  '), marker('end', '목록 상자'));
    assertDeepEqual(parseGroupLine('@group-start-a(b) 더'), marker('start', 'a(b) 더'));
    assertEqual(parseGroupLine('@group-startle'), null);
    assertEqual(parseGroupLine('x @group-start-a'), null, 'a marker has its line to itself');
});

test('a group takes directives like a role, and keeps its name for the pairing', () => {
    assertDeepEqual(parseGroupLine('@group-start-callout:에러일 때'), marker('start', 'callout', ['에러일 때']));
    assertDeepEqual(parseGroupLine('@group-start-a : b : '), marker('start', 'a', ['b']));
    assertDeepEqual(parseGroupLine('@group-start:조건'), marker('start', 'group', ['조건']));
    assertDeepEqual(parseGroupLine('@group-start-a\\:b'), marker('start', 'a:b'), 'an escaped colon is part of the name');

    const rows = parseUiBlock('@group-start-callout:에러일 때\n@a(1)\n@group-end-callout');
    assertDeepEqual(rows[0].directives, ['에러일 때']);
    assertEqual(rows[0].endIndex, 2, 'the end marker pairs by name alone');
    assertEqual(Object.hasOwn(rows[2], 'directives'), false, 'only the opening marker carries them');
});

test('groups nest, and each row knows how deep it sits', () => {
    const rows = parseUiBlock('@group-start-a\n@group-start-b\n@x(1)\n@group-end-b\n@y(2)\n@group-end-a');
    assertDeepEqual(rows.map(row => row.depth), [0, 1, 2, 1, 1, 0]);
    assertEqual(rows[1].endIndex, 3);
});

test('a marker with no partner, or closing another name, becomes an error', () => {
    assertDeepEqual(parseUiBlock('@group-start-a\n@x(1)').map(row => row.type), ['error', 'line']);
    assertEqual(parseUiBlock('@group-start-a\n@x(1)')[0].reason, 'groupUnclosed');
    assertEqual(parseUiBlock('@group-end-a')[0].reason, 'groupUnopened');
    const crossed = parseUiBlock('@group-start-a\n@group-start-b\n@x(1)\n@group-end-a');
    assertDeepEqual(crossed.map(row => row.type), ['groupStart', 'error', 'line', 'groupEnd']);
    assertEqual(crossed[1].reason, 'groupUnclosed');
});

test('a backslash-n is a line break, other escapes are the character itself', () => {
    assertDeepEqual(parseUiLine('@d"첫 줄. \\n둘째 줄"'), [role('d', text('첫 줄. \n둘째 줄'))]);
    assertDeepEqual(parseUiLine('\\@title \\[x\\]'), [text('@title [x]')]);
});
