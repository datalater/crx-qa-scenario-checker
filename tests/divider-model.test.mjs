import { buildRequiredScenarioWithDefaults } from '../modules/export-data-manager.js';
import {
    DEFAULT_DIVIDER_TYPE,
    DIVIDER_TYPES,
    getDividerTitle,
    isDivider,
    parseDivider,
    resolveDividerHeight,
    resolveDividerLang,
    resolveDividerType,
    serializeDivider
} from '../modules/divider-model.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const roundTrip = raw => serializeDivider(parseDivider(raw));

test('divider model reads every legacy shape', () => {
    assertDeepEqual(parseDivider(true), { value: '', type: 'text', color: '', lang: '', height: '' });
    assertDeepEqual(parseDivider('  Group  '), { value: 'Group', type: 'text', color: '', lang: '', height: '' });
    assertDeepEqual(parseDivider({ value: 'G', color: '#f85149' }), { value: 'G', type: 'text', color: '#f85149', lang: '', height: '' });
    assertDeepEqual(parseDivider({ value: true, color: '#f85149' }), { value: '', type: 'text', color: '#f85149', lang: '', height: '' });
    assertEqual(parseDivider(''), null);
    assertEqual(parseDivider(false), null);
    assertEqual(parseDivider({ value: '   ' }), null);
    assertEqual(parseDivider({ color: '#fff' }), null);
    assertEqual(parseDivider(['a']), null);
});

test('divider model writes the shortest shape', () => {
    assertEqual(serializeDivider({ value: 'G', type: 'text', color: '' }), 'G');
    assertEqual(serializeDivider({ value: '  ', type: 'text', color: '' }), true);
    assertDeepEqual(serializeDivider({ value: 'G', color: '#3fb950' }), { value: 'G', color: '#3fb950' });
    assertDeepEqual(serializeDivider({ value: '', type: 'code' }), { value: true, type: 'code' });
    assertDeepEqual(
        serializeDivider({ value: 'a && b', type: 'code', color: '#a371f7' }),
        { value: 'a && b', type: 'code', color: '#a371f7' }
    );
});

test('legacy dividers round-trip unchanged', () => {
    assertEqual(roundTrip(true), true);
    assertEqual(roundTrip('Error cases'), 'Error cases');
    assertDeepEqual(roundTrip({ value: 'G', color: '#d29922' }), { value: 'G', color: '#d29922' });
});

test('code keeps indentation but drops surrounding blank lines', () => {
    const value = '\n\nconst canLogin =\n  id.valid()\n  && password.valid()\n\n';
    assertDeepEqual(
        parseDivider({ value, type: 'code' }),
        { value: 'const canLogin =\n  id.valid()\n  && password.valid()', type: 'code', color: '', lang: '', height: '' }
    );
    assertEqual(parseDivider({ value: '  indented', type: 'code' }).value, '  indented');
    assertEqual(parseDivider({ value: '  trimmed  ' }).value, 'trimmed');
});

test('unknown divider type renders as text but is preserved', () => {
    assertEqual(resolveDividerType('sql'), DIVIDER_TYPES[DEFAULT_DIVIDER_TYPE]);
    assertEqual(resolveDividerType(undefined), DIVIDER_TYPES.text);
    assertEqual(resolveDividerType(' Code '), DIVIDER_TYPES.code);
    assertDeepEqual(roundTrip({ value: 'select 1', type: 'sql' }), { value: 'select 1', type: 'sql' });
});

test('changing one divider attribute keeps the others', () => {
    const raw = { value: 'x === y', type: 'code', color: '#db61a2' };
    assertDeepEqual(
        serializeDivider({ ...parseDivider(raw), color: '' }),
        { value: 'x === y', type: 'code' }
    );
    assertDeepEqual(
        serializeDivider({ ...parseDivider(raw), type: 'text' }),
        { value: 'x === y', color: '#db61a2' }
    );
    assertDeepEqual(
        serializeDivider({ ...parseDivider(raw), value: 'z' }),
        { value: 'z', type: 'code', color: '#db61a2' }
    );
});

test('divider title and detection follow the model', () => {
    assertEqual(isDivider({ value: 'a', type: 'code' }), true);
    assertEqual(getDividerTitle({ value: 'a && b', type: 'code' }), 'a && b');
    assertEqual(getDividerTitle({ value: true, type: 'code' }), 'divider');
    assertEqual(getDividerTitle(null), '');
});

test('export normalization keeps divider type and color', () => {
    const normalized = buildRequiredScenarioWithDefaults({
        scenario: 'demo',
        steps: [
            { divider: { value: '  a && b  ', type: 'code', color: '#a371f7' } },
            { divider: { value: 'Group', type: 'text' } }
        ]
    });
    assertDeepEqual(normalized.steps[0].divider, { value: '  a && b', type: 'code', color: '#a371f7' });
    assertEqual(normalized.steps[1].divider, 'Group');
});

test('code divider language defaults to tsx and only stores other picks', () => {
    assertEqual(resolveDividerLang({ type: 'code' }), 'tsx');
    assertEqual(resolveDividerLang({ type: 'code', lang: ' JSON ' }), 'json');
    assertEqual(resolveDividerLang({ type: 'text', lang: 'json' }), '');
    assertDeepEqual(serializeDivider({ value: 'a', type: 'code', lang: 'tsx' }), { value: 'a', type: 'code' });
    assertDeepEqual(
        serializeDivider({ value: 'a', type: 'code', lang: 'plain', color: '#f85149' }),
        { value: 'a', type: 'code', lang: 'plain', color: '#f85149' }
    );
    assertDeepEqual(roundTrip({ value: 'a', type: 'code', lang: 'python' }), { value: 'a', type: 'code', lang: 'python' });
});

test('lang is dropped for text types and kept for unknown types', () => {
    assertEqual(serializeDivider({ value: 'a', type: 'text', lang: 'json' }), 'a');
    assertDeepEqual(roundTrip({ value: 'a', type: 'sql', lang: 'pgsql' }), { value: 'a', type: 'sql', lang: 'pgsql' });
    const raw = { value: 'a', type: 'code', lang: 'json' };
    assertDeepEqual(serializeDivider({ ...parseDivider(raw), color: '#3fb950' }), { ...raw, color: '#3fb950' });
});

test('code divider height defaults to fixed and only stores auto', () => {
    assertEqual(resolveDividerHeight({ type: 'code' }), 'fixed');
    assertEqual(resolveDividerHeight({ type: 'code', height: ' AUTO ' }), 'auto');
    assertEqual(resolveDividerHeight({ type: 'code', height: 'tall' }), 'fixed');
    assertEqual(resolveDividerHeight({ type: 'text', height: 'auto' }), '');
    assertDeepEqual(serializeDivider({ value: 'a', type: 'code', height: 'fixed' }), { value: 'a', type: 'code' });
    assertDeepEqual(
        serializeDivider({ value: 'a', type: 'code', lang: 'json', height: 'auto', color: '#f85149' }),
        { value: 'a', type: 'code', lang: 'json', height: 'auto', color: '#f85149' }
    );
    assertEqual(serializeDivider({ value: 'a', type: 'text', height: 'auto' }), 'a');
    assertDeepEqual(roundTrip({ value: 'a', type: 'code', height: 'tall' }), { value: 'a', type: 'code', height: 'tall' });
});

test('changing height keeps lang and color', () => {
    const raw = { value: 'a', type: 'code', lang: 'json', color: '#3fb950' };
    assertDeepEqual(
        serializeDivider({ ...parseDivider(raw), height: 'auto' }),
        { value: 'a', type: 'code', lang: 'json', height: 'auto', color: '#3fb950' }
    );
});
