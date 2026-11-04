import { setupTableCellNavigation } from '../src/table-cell-navigation.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function fixture() {
    const doc = { activeElement: null };
    const cells = Array.from({ length: 3 }, () => {
        const handlers = {};
        return {
            ownerDocument: doc, isConnected: true, text: '',
            addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
            emit(type, props = {}) {
                const event = { keyCode: 0, preventDefault() { this.defaultPrevented = true; }, ...props };
                for (const fn of handlers[type] || []) fn(event);
                return event;
            },
            focus() { if (doc.activeElement) doc.activeElement.emit('blur'); doc.activeElement = this; }
        };
    });
    cells.forEach(cell => setupTableCellNavigation(cell, () => cells));
    cells[1].focus();
    return { cells, doc };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('Tab waits for IME final input before focusing the next cell', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    const event = cells[1].emit('keydown', { key: 'Tab', isComposing: true });
    assertEqual(event.defaultPrevented, true);
    assertEqual(doc.activeElement, cells[1]);
    cells[1].emit('compositionend');
    doc.activeElement.text = '영문명'; // final input can follow compositionend
    await tick();
    assertEqual(doc.activeElement, cells[2]);
    assertEqual(cells[1].text, '영문명');
    assertEqual(cells[2].text, '');
});

test('Shift+Tab waits for composition; ordinary Tab moves immediately', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    cells[1].emit('keydown', { key: 'Tab', shiftKey: true });
    cells[1].emit('compositionend');
    await tick();
    assertEqual(doc.activeElement, cells[0]);
    cells[0].emit('keydown', { key: 'Tab' });
    assertEqual(doc.activeElement, cells[1]);
});

test('deferred navigation does not steal focus after blur', async () => {
    const { cells, doc } = fixture();
    cells[1].emit('compositionstart');
    cells[1].emit('keydown', { key: 'Tab', isComposing: true });
    cells[1].emit('compositionend');
    cells[0].focus();
    await tick();
    assertEqual(doc.activeElement, cells[0]);
});
