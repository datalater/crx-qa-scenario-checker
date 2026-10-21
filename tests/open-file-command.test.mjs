import { filterFilesForPicker } from '../modules/open-file-command.js';
import { assertEqual, test } from './lib/test-runner.mjs';

const files = [
    { id: '1', name: 'login.json', path: 'auth/login.json', isOpen: false },
    { id: '2', name: 'signup.json', path: 'auth/signup.json', isOpen: true },
    { id: '3', name: 'cart.json', path: 'shop/cart.json', isOpen: false },
    { id: '4', name: 'auth-flow.json', path: 'misc/auth-flow.json', isOpen: false }
];

test('empty query lists open tabs first, then the rest in order', () => {
    assertEqual(filterFilesForPicker(files, '').map((f) => f.id).join(), '2,1,3,4');
});

test('query matches path tokens and ranks filename matches first', () => {
    assertEqual(filterFilesForPicker(files, 'auth').map((f) => f.id).join(), '4,2,1');
    assertEqual(filterFilesForPicker(files, 'shop cart').map((f) => f.id).join(), '3');
    assertEqual(filterFilesForPicker(files, 'zzz').length, 0);
});

test('query is case-insensitive', () => {
    assertEqual(filterFilesForPicker(files, 'LOGIN').map((f) => f.id).join(), '1');
});
