import { COMMAND_PREFIX, filterCommands } from '../modules/command-palette.js';
import { createOpenFileCommand, createOpenFilePicker } from '../modules/open-file-command.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

let rowsSelected = false;
const commands = [
    { id: 'openFile', label: '파일 열기', name: 'Open File' },
    { id: 'goToSection', label: '구간으로 이동', name: 'Go to Section' },
    { id: 'copyRowReference', label: '선택한 행 참조 복사', name: 'Copy Row Reference', isAvailable: () => rowsSelected },
    { id: 'toggleFileTree', label: '파일 트리 토글', name: 'Toggle File Tree' }
];
const ids = query => filterCommands(commands, query).map(command => command.id);

test('commands are found under either of their names, whatever the case', () => {
    assertDeepEqual(ids('구간'), ['goToSection']);
    assertDeepEqual(ids('SECTION go'), ['goToSection']);
    assertDeepEqual(ids('file'), ['openFile', 'toggleFileTree']);
    assertDeepEqual(ids('파일 toggle'), ['toggleFileTree']);
    assertDeepEqual(ids('없는 명령'), []);
});

test('an empty query lists every command that can run now, in catalog order', () => {
    rowsSelected = false;
    assertDeepEqual(ids(''), ['openFile', 'goToSection', 'toggleFileTree']);
    rowsSelected = true;
    assertDeepEqual(ids('  '), ['openFile', 'goToSection', 'copyRowReference', 'toggleFileTree']);
    rowsSelected = false;
});

test('the prefix that turns quick open into the command list is >', () => {
    assertEqual(COMMAND_PREFIX, '>');
});

test('quick open and the open-file command show the same file list', () => {
    const files = [
        { id: '1', name: 'login.json', path: 'auth/login.json', isOpen: true, isActive: true },
        { id: '2', name: 'cart.json', path: 'cart.json', isOpen: false, isActive: false }
    ];
    let opened = null;
    const source = { getFiles: () => files, open: (id) => { opened = id; } };
    const picker = createOpenFilePicker(source);
    assertDeepEqual(picker.getItems(''), [
        { label: 'login.json', description: 'auth/login.json', badge: '현재', fileId: '1' },
        { label: 'cart.json', description: '', badge: '', fileId: '2' }
    ]);
    picker.onSelect(picker.getItems('cart')[0]);
    assertEqual(opened, '2');

    let config = null;
    const command = createOpenFileCommand(source);
    command.run({ pick: (value) => { config = value; } });
    assertDeepEqual(config.getItems('cart'), picker.getItems('cart'));
    assertEqual(command.name, 'Open File');
});
