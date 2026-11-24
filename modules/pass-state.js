/**
 * The verdict of a step row, as three states:
 *
 *   pass   "pass": true    checked and it passed
 *   fail   "pass": false   checked and it did not
 *   none   no "pass" key   not checked yet
 *
 * "Not checked" is stored by leaving the key out, so `false` only ever means
 * a failure. A reader of the JSON (a person or a model) does not have to
 * guess which of the two a `false` stands for.
 */

export const PASS_STATES = Object.freeze(['none', 'pass', 'fail']);

export function getPassState(step) {
    if (step?.pass === true) return 'pass';
    if (step?.pass === false) return 'fail';
    return 'none';
}

export function setPassState(step, state) {
    if (!step || typeof step !== 'object') return;
    if (state === 'pass') step.pass = true;
    else if (state === 'fail') step.pass = false;
    else delete step.pass;
}

/**
 * The state after a click. A plain click only moves between unchecked and
 * passed, the common case, and clears a failure; marking a failure is the
 * separate `fail` gesture, which also takes it back.
 */
export function nextPassState(current, { fail = false } = {}) {
    if (fail) return current === 'fail' ? 'none' : 'fail';
    return current === 'none' ? 'pass' : 'none';
}

/** Counts over the step rows; `isStep` leaves the dividers out. */
export function countPassStates(steps, isStep = () => true) {
    const counts = { total: 0, passed: 0, failed: 0, unchecked: 0 };
    (Array.isArray(steps) ? steps : []).forEach((step) => {
        if (!isStep(step)) return;
        counts.total += 1;
        const state = getPassState(step);
        if (state === 'pass') counts.passed += 1;
        else if (state === 'fail') counts.failed += 1;
        else counts.unchecked += 1;
    });
    return counts;
}

/**
 * Files written before failures existed stored "not checked" as
 * `pass: false`. This turns every `false` of the step rows back into
 * unchecked, in place, and returns how many it changed.
 */
export function resetFailedToUnchecked(steps, isStep = () => true) {
    let changed = 0;
    (Array.isArray(steps) ? steps : []).forEach((step) => {
        if (!isStep(step) || step?.pass !== false) return;
        delete step.pass;
        changed += 1;
    });
    return changed;
}

/**
 * True when a file looks like it was written before failures existed: it has
 * `false` rows and not a single row without a verdict.
 */
export function looksLikeLegacyPass(steps, isStep = () => true) {
    const { failed, unchecked } = countPassStates(steps, isStep);
    return failed > 0 && unchecked === 0;
}
