import { isStickyHeadingDivider } from '../modules/ui-renderer.js';
import { parseDivider } from '../modules/divider-model.js';
import { assertEqual, test } from './lib/test-runner.mjs';

const heading = (raw) => {
    const divider = parseDivider(raw);
    return isStickyHeadingDivider(divider, divider?.value);
};

test('plain text dividers with a title are sticky headings', () => {
    assertEqual(heading('Login'), true);
    assertEqual(heading({ value: 'Login', type: 'text' }), true);
});

test('empty, colored and code dividers are not sticky headings', () => {
    assertEqual(heading(true), false);
    assertEqual(heading('   '), false);
    assertEqual(heading({ value: 'Login', color: '#ff0000' }), false);
    assertEqual(heading({ value: 'const a = 1', type: 'code' }), false);
});
