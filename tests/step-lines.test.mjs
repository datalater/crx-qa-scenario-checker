import { stepLinesToText, toStepLines } from '../modules/step-lines.js';
import { formatChecklistCellContent } from '../modules/ui-renderer.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const typed = '{안내문구}\n수업 감독이 예정되어 있습니다.\n\n{이용 권장 환경 안내}\n- onclick: 모달 표시\n\nstatus: `[대기, 진행 중, 종료]`';

test('blank lines between text survive a save and a reload', () => {
    const stored = toStepLines(typed);
    assertDeepEqual(stored, [
        '{안내문구}', '수업 감독이 예정되어 있습니다.', '',
        '{이용 권장 환경 안내}', '- onclick: 모달 표시', '',
        'status: `[대기, 진행 중, 종료]`'
    ]);
    assertEqual(stepLinesToText(stored), typed);
    assertEqual(stepLinesToText(JSON.parse(JSON.stringify(stored))), typed);
});

test('several blank lines in a row are kept as typed', () => {
    assertDeepEqual(toStepLines('a\n\n\nb'), ['a', '', '', 'b']);
});

test('blank lines at either end and space around a line are dropped', () => {
    assertDeepEqual(toStepLines('\n  \n a \n\n b  \n\n'), ['a', '', 'b']);
    assertDeepEqual(toStepLines(['', 'a', null, 'b', '  ']), ['a', '', 'b']);
});

test('an empty cell stores no lines', () => {
    assertDeepEqual(toStepLines(''), []);
    assertDeepEqual(toStepLines(' \n \n'), []);
    assertDeepEqual(toStepLines(null), []);
    assertDeepEqual(toStepLines(undefined), []);
    assertEqual(stepLinesToText([]), '');
});

test('older shapes read as text or as nothing', () => {
    assertEqual(stepLinesToText('one\n\ntwo'), 'one\n\ntwo');
    assertEqual(stepLinesToText([{ type: 'text', value: 'x' }]), '');
    assertEqual(stepLinesToText({ label: 'x' }), '');
});

test('a rendered cell keeps the blank line', () => {
    assertEqual(formatChecklistCellContent(stepLinesToText(['a', '', 'b'])), 'a\n\nb');
});
