import {
    updateChecklistProgressIndicator,
    updatePassHeaderState
} from '../modules/ui-renderer.js';
import { assertEqual, test } from './lib/test-runner.mjs';

/**
 * Regression: the progress counter was only refreshed inside renderChecklist,
 * but ticking a single pass checkbox goes through syncToEditor instead, so the
 * counter went stale. Both header widgets read the same data and are now
 * refreshed together by one function.
 */
function createHeaderStub() {
    const el = {
        classes: new Set(),
        attrs: {},
        textContent: '',
        title: '',
        hidden: false,
        setAttribute(key, value) { el.attrs[key] = value; },
        removeAttribute(key) { delete el.attrs[key]; }
    };
    el.classList = {
        add(...names) { names.forEach(name => el.classes.add(name)); },
        remove(...names) { names.forEach(name => el.classes.delete(name)); },
        toggle(name, on) { if (on) el.classes.add(name); else el.classes.delete(name); },
        contains(name) { return el.classes.has(name); }
    };
    return el;
}

function createSummaryHarness(steps) {
    const data = { steps };
    const toggle = createHeaderStub();
    const progress = createHeaderStub();

    // Mirrors refreshPassSummary() in script.js.
    const refreshPassSummary = () => {
        updatePassHeaderState(toggle, data);
        updateChecklistProgressIndicator(progress, data);
    };

    refreshPassSummary();
    return { data, toggle, progress, refreshPassSummary };
}

test('progress text follows a single pass change', () => {
    const h = createSummaryHarness([
        { divider: 'group' },
        { pass: false },
        { pass: false },
        { pass: false }
    ]);
    assertEqual(h.progress.textContent, '0/3');

    h.data.steps[1].pass = true;
    h.refreshPassSummary();
    assertEqual(h.progress.textContent, '1/3');

    h.data.steps[1].pass = false;
    h.refreshPassSummary();
    assertEqual(h.progress.textContent, '0/3');
});

test('progress turns complete only when every step passes', () => {
    const h = createSummaryHarness([{ pass: true }, { pass: false }]);
    assertEqual(h.progress.classes.has('is-complete'), false);

    h.data.steps[1].pass = true;
    h.refreshPassSummary();
    assertEqual(h.progress.textContent, '2/2');
    assertEqual(h.progress.classes.has('is-complete'), true);
});

test('the toggle and the counter never disagree', () => {
    const h = createSummaryHarness([{ pass: false }, { pass: false }]);

    h.data.steps.forEach((step) => { step.pass = true; });
    h.refreshPassSummary();
    assertEqual(h.toggle.classes.has('all-passed'), true);
    assertEqual(h.progress.classes.has('is-complete'), true);

    h.data.steps[0].pass = false;
    h.refreshPassSummary();
    assertEqual(h.toggle.classes.has('all-passed'), false);
    assertEqual(h.progress.classes.has('is-complete'), false);
});

test('dividers are excluded from the total', () => {
    const h = createSummaryHarness([
        { divider: true },
        { divider: 'section' },
        { pass: true }
    ]);
    assertEqual(h.progress.textContent, '1/1');
});

test('progress hides when there is nothing to check', () => {
    const h = createSummaryHarness([{ divider: 'only a divider' }]);
    assertEqual(h.progress.hidden, true);
    assertEqual(h.progress.textContent, '');
    assertEqual(h.toggle.classes.has('disabled'), true);
});

test('progress reappears once a step exists', () => {
    const h = createSummaryHarness([{ divider: 'group' }]);
    assertEqual(h.progress.hidden, true);

    h.data.steps.push({ pass: false });
    h.refreshPassSummary();
    assertEqual(h.progress.hidden, false);
    assertEqual(h.progress.textContent, '0/1');
});

test('progress exposes a readable title for screen readers', () => {
    const h = createSummaryHarness([{ pass: true }, { pass: false }]);
    assertEqual(h.progress.title, '1 of 2 steps passed');

    h.data.steps[1].pass = true;
    h.refreshPassSummary();
    assertEqual(h.progress.title, 'All 2 steps passed');
});
