import { parseNewEntryPath } from '../modules/new-entry-path.js';
import { assertEqual, test } from './lib/test-runner.mjs';

test('plain name creates a file without folders', () => {
    const parsed = parseNewEntryPath('  new-file ');
    assertEqual(parsed.file, 'new-file');
    assertEqual(parsed.folders.length, 0);
});

test('slash path creates nested folders plus a file', () => {
    const parsed = parseNewEntryPath('new-folder/sub/new-file.json');
    assertEqual(parsed.folders.join('|'), 'new-folder|sub');
    assertEqual(parsed.file, 'new-file.json');
});

test('trailing slash means folders only; stray slashes and spaces are ignored', () => {
    const folderOnly = parseNewEntryPath('a/b/');
    assertEqual(folderOnly.folders.join('|'), 'a|b');
    assertEqual(folderOnly.file, null);
    const messy = parseNewEntryPath('/a// b /file');
    assertEqual(messy.folders.join('|'), 'a|b');
    assertEqual(messy.file, 'file');
});

test('invalid input is rejected with an error code', () => {
    assertEqual(parseNewEntryPath('').error, 'empty');
    assertEqual(parseNewEntryPath(' / ').error, 'empty');
    assertEqual(parseNewEntryPath('a/../b').error, 'relative-segment');
    assertEqual(parseNewEntryPath('a\\b').error, 'illegal-character');
    assertEqual(parseNewEntryPath('a:b').error, 'illegal-character');
    assertEqual(parseNewEntryPath('x'.repeat(256)).error, 'too-long');
});
