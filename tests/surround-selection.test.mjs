import { SURROUND_PAIRS, isRoleGapBefore, surroundText } from '../modules/surround-selection.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('an opening mark wraps the selection and keeps the inside selected', () => {
    assertDeepEqual(surroundText('@title 시간표 설정', 7, 13, '('), { text: '@title (시간표 설정)', start: 8, end: 14 });
    assertDeepEqual(surroundText('abc', 0, 3, '['), { text: '[abc]', start: 1, end: 4 });
});

test('a backward selection wraps the same range', () => {
    assertDeepEqual(surroundText('abc', 3, 1, '{'), { text: 'a{bc}', start: 2, end: 4 });
});

test('quotes and backticks close with themselves', () => {
    assertEqual(surroundText('a', 0, 1, '`').text, '`a`');
    assertEqual(surroundText('a', 0, 1, '"').text, '"a"');
    assertEqual(surroundText('a', 0, 1, "'").text, "'a'");
});

test('a bare caret or another character is left to plain typing', () => {
    assertEqual(surroundText('abc', 1, 1, '('), null);
    assertEqual(surroundText('abc', 0, 3, ')'), null);
    assertEqual(surroundText('abc', 0, 3, 'x'), null);
    assertEqual(Object.hasOwn(SURROUND_PAIRS, 'toString'), false);
});

test('the space after a role name is the gap a parenthesis closes', () => {
    assertEqual(isRoleGapBefore('@title 시간표 설정', 7), true);
    assertEqual(isRoleGapBefore('a --- @cta01 [삭제]', 13), true);
    assertEqual(isRoleGapBefore('@header(@title 제목)', 15), true);
    assertEqual(isRoleGapBefore('@title  시간표', 8), false, 'two spaces');
    assertEqual(isRoleGapBefore('mail@site 주소', 10), false, 'an @ inside a word');
    assertEqual(isRoleGapBefore('@title 시간표 설정', 11), false, 'inside the content');
});
