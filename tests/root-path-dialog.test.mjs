import { checkRootPath, normalizeRootPath } from '../modules/root-path-dialog.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

test('a path is stored trimmed and without a trailing slash', () => {
    assertEqual(normalizeRootPath('  /Users/me/qa/  '), '/Users/me/qa');
    assertEqual(normalizeRootPath('~/work/qa//'), '~/work/qa');
    assertEqual(normalizeRootPath(null), '');
});

test('only an absolute path can be saved', () => {
    assertDeepEqual(checkRootPath('/Users/me/qa', 'qa'), {});
    assertDeepEqual(checkRootPath('~/qa/', 'qa'), {});
    assertDeepEqual(checkRootPath('', 'qa'), {}, 'empty clears the setting');
    assertEqual(Boolean(checkRootPath('qa', 'qa').error), true);
    assertEqual(Boolean(checkRootPath('./qa', 'qa').error), true);
});

test('a path not ending in the opened folder is allowed with a warning', () => {
    const result = checkRootPath('/Users/me/other', 'qa');
    assertEqual(result.error, undefined);
    assertEqual(result.warning, '경로 끝 폴더가 연 폴더(qa)와 다릅니다.');
});
