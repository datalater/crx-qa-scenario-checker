import {
    createGoToSectionCommand,
    filterSections,
    findSectionIndexOfRow,
    listSections,
    plainSectionTitle
} from '../modules/go-to-section-command.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const steps = () => [
    { given: ['구분선 앞의 행'], when: [], then: [], pass: true },
    { divider: '#1 수업 감독 활성화' },
    { given: ['a'], when: [], then: [], pass: true },
    { given: ['b'], when: [], then: [], pass: false },
    { divider: { value: '### spec', type: 'code', lang: 'markdown' } },
    { given: ['c'], when: [], then: [], pass: true },
    { divider: { value: '[Figma](https://figma.com/a) #2 LNB 구성', color: '#f85149' } },
    { divider: true },
    { given: ['d'], when: [], then: [] }
];

test('sections are the text dividers, with the progress of the rows under them', () => {
    assertDeepEqual(listSections(steps()), [
        { index: 1, title: '#1 수업 감독 활성화', color: '', passed: 2, total: 3 },
        { index: 6, title: 'Figma #2 LNB 구성', color: '#f85149', passed: 0, total: 0 },
        { index: 7, title: 'divider', color: '', passed: 0, total: 1 }
    ]);
    assertDeepEqual(listSections(null), []);
});

test('a code divider neither starts a section nor counts as a row', () => {
    const [first] = listSections(steps());
    assertEqual(first.total, 3, 'the row below the code divider still belongs to #1');
});

test('a title reads as plain words on one line', () => {
    assertEqual(plainSectionTitle('[Figma](https://figma.com/a)  #2   LNB'), 'Figma #2 LNB');
    assertEqual(plainSectionTitle('\n첫 줄\n둘째 줄'), '첫 줄');
    assertEqual(plainSectionTitle('![x](assets/a.png) 제목'), '![x](assets/a.png) 제목');
    assertEqual(plainSectionTitle(''), '');
});

test('filtering keeps file order and needs every word', () => {
    const sections = listSections(steps());
    assertDeepEqual(filterSections(sections, '').map(s => s.index), [1, 6, 7]);
    assertDeepEqual(filterSections(sections, 'LNB figma').map(s => s.index), [6]);
    assertDeepEqual(filterSections(sections, '  #  ').map(s => s.index), [1, 6]);
    assertDeepEqual(filterSections(sections, '없는 말'), []);
});

test('a row belongs to the last heading at or above it', () => {
    const sections = listSections(steps());
    assertEqual(findSectionIndexOfRow(sections, 0), -1, 'a row before any heading');
    assertEqual(findSectionIndexOfRow(sections, 1), 0);
    assertEqual(findSectionIndexOfRow(sections, 5), 0);
    assertEqual(findSectionIndexOfRow(sections, 8), 2);
});

test('the command lists sections, marks the current one, and goes to the chosen divider', () => {
    let picker = null;
    let went = null;
    const command = createGoToSectionCommand({
        getSections: () => listSections(steps()),
        getCurrentRowIndex: () => 3,
        go: (index) => { went = index; }
    });
    command.run({ pick: (config) => { picker = config; } });
    const items = picker.getItems('');
    assertDeepEqual(items.map(item => [item.label, item.description, item.badge, item.swatch]), [
        ['#1 수업 감독 활성화', '현재 구간', '2/3', 'default'],
        ['Figma #2 LNB 구성', '', '', '#f85149'],
        ['divider', '', '0/1', 'default']
    ]);
    assertDeepEqual(items.map(item => item.isCurrent), [true, false, false]);
    picker.onSelect(picker.getItems('lnb')[0]);
    assertEqual(went, 6);
});

test('an empty scenario explains itself', () => {
    let picker = null;
    createGoToSectionCommand({ getSections: () => [], getCurrentRowIndex: () => -1, go() {} })
        .run({ pick: (config) => { picker = config; } });
    assertEqual(picker.emptyText, '이 시나리오에는 구분선이 없습니다.');
});
