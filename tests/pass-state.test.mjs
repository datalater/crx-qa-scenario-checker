import {
    countPassStates,
    getPassState,
    looksLikeLegacyPass,
    nextPassState,
    resetFailedToUnchecked,
    setPassState
} from '../modules/pass-state.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const isStep = step => !Object.hasOwn(step, 'divider');

test('true is a pass, false a failure, and anything else is not checked yet', () => {
    assertEqual(getPassState({ pass: true }), 'pass');
    assertEqual(getPassState({ pass: false }), 'fail');
    assertEqual(getPassState({}), 'none');
    assertEqual(getPassState({ pass: null }), 'none');
    assertEqual(getPassState({ pass: 'fail' }), 'none');
    assertEqual(getPassState(undefined), 'none');
});

test('unchecked is stored by leaving the key out', () => {
    const step = { given: ['a'], pass: true };
    setPassState(step, 'fail');
    assertEqual(step.pass, false);
    setPassState(step, 'none');
    assertEqual(Object.hasOwn(step, 'pass'), false);
    setPassState(step, 'pass');
    assertEqual(step.pass, true);
    assertDeepEqual(Object.keys(step), ['given', 'pass']);
});

test('a plain click moves between unchecked and passed, and clears a failure', () => {
    assertEqual(nextPassState('none'), 'pass');
    assertEqual(nextPassState('pass'), 'none');
    assertEqual(nextPassState('fail'), 'none');
});

test('the fail gesture marks a failure from any state and takes it back', () => {
    assertEqual(nextPassState('none', { fail: true }), 'fail');
    assertEqual(nextPassState('pass', { fail: true }), 'fail');
    assertEqual(nextPassState('fail', { fail: true }), 'none');
});

test('counts cover the step rows only', () => {
    const steps = [{ divider: 'a' }, { pass: true }, { pass: false }, {}, { pass: true }];
    assertDeepEqual(countPassStates(steps, isStep), { total: 4, passed: 2, failed: 1, unchecked: 1 });
    assertDeepEqual(countPassStates(null), { total: 0, passed: 0, failed: 0, unchecked: 0 });
});

test('resetting turns every false of the step rows into unchecked', () => {
    const steps = [{ divider: 'a', pass: false }, { pass: true }, { pass: false }, { pass: false }, {}];
    assertEqual(resetFailedToUnchecked(steps, isStep), 2);
    assertDeepEqual(steps, [{ divider: 'a', pass: false }, { pass: true }, {}, {}, {}]);
    assertEqual(resetFailedToUnchecked(steps, isStep), 0);
});

test('a file with false rows and no row without a verdict looks like an old one', () => {
    assertEqual(looksLikeLegacyPass([{ pass: true }, { pass: false }]), true);
    assertEqual(looksLikeLegacyPass([{ pass: true }, { pass: false }, {}]), false);
    assertEqual(looksLikeLegacyPass([{ pass: true }]), false);
    assertEqual(looksLikeLegacyPass([]), false);
});
