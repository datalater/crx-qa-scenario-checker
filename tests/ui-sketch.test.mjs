import { EMPTY_UI_SKETCH, hasSpacer, parseUiBlock, parseUiLine } from '../src/ui-sketch.js';
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
