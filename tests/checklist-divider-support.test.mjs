import { buildRequiredScenarioWithDefaults } from '../modules/export-data-manager.js';
import {
    getChecklistDividerTitle,
    isChecklistDividerStep,
    normalizeChecklistDividerValue,
    normalizeEditableChecklistDividerValue
} from '../modules/ui-renderer.js';
import { assertEqual, test } from './lib/test-runner.mjs';

test('divider value normalization supports true and trimmed non-empty string', () => {
    assertEqual(normalizeChecklistDividerValue(true), true);
    assertEqual(normalizeChecklistDividerValue('  validation  '), 'validation');
    assertEqual(normalizeChecklistDividerValue('   '), null);
    assertEqual(normalizeChecklistDividerValue(false), null);
});

test('divider title uses string or default label', () => {
    assertEqual(getChecklistDividerTitle({ divider: 'Scenario Group' }), 'Scenario Group');
    assertEqual(getChecklistDividerTitle({ divider: true }), 'divider');
    assertEqual(getChecklistDividerTitle({ divider: false }), '');
});

test('divider step detection works as expected', () => {
    assertEqual(isChecklistDividerStep({ divider: true }), true);
    assertEqual(isChecklistDividerStep({ divider: 'A' }), true);
    assertEqual(isChecklistDividerStep({ divider: '' }), false);
    assertEqual(isChecklistDividerStep({ given: ['x'], pass: false }), false);
});

test('required scenario normalization preserves valid divider rows', () => {
    const normalStep = { given: ['a'], when: ['b'], pass: false };
    normalStep['then'] = ['c'];
    const normalized = buildRequiredScenarioWithDefaults({
        scenario: 'demo',
        steps: [
            { divider: true },
            { divider: '  Group A  ' },
            normalStep
        ]
    });

    assertEqual(normalized.steps[0].divider, true);
    assertEqual(normalized.steps[1].divider, 'Group A');
    assertEqual(Array.isArray(normalized.steps[2].given), true);
    assertEqual(normalized.steps[2].pass, false);
});

test('editable divider normalization keeps divider step for empty input', () => {
    assertEqual(normalizeEditableChecklistDividerValue('  Group B  '), 'Group B');
    assertEqual(normalizeEditableChecklistDividerValue('   '), true);
    assertEqual(normalizeEditableChecklistDividerValue(null), true);
});
