import {
    NOTE_IMAGE_LIMIT,
    NoteAssetError,
    buildAssetFileName,
    createNoteAssetStore,
    detectImageExtension,
    formatAssetSize
} from '../modules/note-assets.js';
import { attachImageUsage, summarizeImages } from '../modules/note-image-manager.js';
import { assert, assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
const bytes = values => new Uint8Array(values);
const text = value => bytes([...value].map(char => char.charCodeAt(0)));

/** The slice of the File System Access API the store uses. */
function createDirectory(initial = {}) {
    const files = new Map(Object.entries(initial));
    const children = new Map();
    const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
    const fileHandle = name => ({
        kind: 'file',
        async getFile() {
            if (!files.has(name)) throw notFound();
            const entry = files.get(name);
            return new File([entry.data], name, { lastModified: entry.lastModified });
        },
        async createWritable() {
            return {
                async write(data) { files.set(name, { data, lastModified: 1000 + files.size }); },
                async close() {}
            };
        }
    });
    return {
        kind: 'directory',
        files,
        children,
        async getDirectoryHandle(name, { create = false } = {}) {
            if (!children.has(name)) {
                if (!create) throw notFound();
                children.set(name, createDirectory());
            }
            return children.get(name);
        },
        async getFileHandle(name, { create = false } = {}) {
            if (!files.has(name) && !create) throw notFound();
            return fileHandle(name);
        },
        async removeEntry(name) {
            if (!files.delete(name)) throw notFound();
        },
        async *keys() { yield* files.keys(); },
        async *entries() { for (const name of files.keys()) yield [name, fileHandle(name)]; }
    };
}

async function rejects(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

test('image type comes from the content', () => {
    assertEqual(detectImageExtension(bytes(PNG)), 'png');
    assertEqual(detectImageExtension(bytes([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
    assertEqual(detectImageExtension(text('GIF89a000000')), 'gif');
    assertEqual(detectImageExtension(text('RIFF0000WEBP')), 'webp');
    assertEqual(detectImageExtension(text('<svg xmlns="x">')), null);
    assertEqual(detectImageExtension(bytes([1, 2])), null);
});

test('a file name is the paste time, numbered when taken', () => {
    const date = new Date(2026, 10, 16, 14, 32, 5);
    assertEqual(buildAssetFileName(date, 'png'), '20261116-143205.png');
    assertEqual(buildAssetFileName(date, 'png', ['20261116-143205.PNG']), '20261116-143205-2.png');
    assertEqual(
        buildAssetFileName(date, 'png', ['20261116-143205.png', '20261116-143205-2.png']),
        '20261116-143205-3.png'
    );
});

test('sizes read in the nearest unit', () => {
    assertEqual(formatAssetSize(512), '512 B');
    assertEqual(formatAssetSize(2048), '2.0 KB');
    assertEqual(formatAssetSize(300 * 1024), '300 KB');
    assertEqual(formatAssetSize(3 * 1024 * 1024), '3.0 MB');
});

test('saving writes into assets/ of the opened folder and returns the path', async () => {
    const root = createDirectory();
    const store = createNoteAssetStore({
        getRoot: () => ({ handle: root, writable: true }),
        now: () => new Date(2026, 10, 16, 9, 0, 0)
    });
    let changes = 0;
    store.onChange(() => { changes += 1; });

    const first = await store.save(new Blob([bytes(PNG)]));
    const second = await store.save(new Blob([bytes(PNG)]));
    assertEqual(first, 'assets/20261116-090000.png');
    assertEqual(second, 'assets/20261116-090000-2.png');
    assertEqual(changes, 2);
    assertDeepEqual([...root.children.get('assets').files.keys()], ['20261116-090000.png', '20261116-090000-2.png']);
});

test('saving refuses without a folder, without write access, or with a bad file', async () => {
    const root = createDirectory();
    const png = new Blob([bytes(PNG)]);
    const closed = createNoteAssetStore({ getRoot: () => null });
    const readonly = createNoteAssetStore({ getRoot: () => ({ handle: root, writable: false }) });
    const open = createNoteAssetStore({ getRoot: () => ({ handle: root, writable: true }) });

    assert((await rejects(closed.save(png))) instanceof NoteAssetError);
    assert((await rejects(readonly.save(png))) instanceof NoteAssetError);
    assert((await rejects(open.save(new Blob([text('<svg xmlns="x"></svg>')])))) instanceof NoteAssetError);
    assert((await rejects(open.save(new Blob([])))) instanceof NoteAssetError);
    assert((await rejects(open.save({ size: NOTE_IMAGE_LIMIT + 1 }))) instanceof NoteAssetError);
    assertEqual(root.children.has('assets'), false, 'nothing was created');
    assertEqual(closed.isAvailable(), false);
    assertEqual(readonly.isWritable(), false);
});

test('listing shows only images, newest first, and is empty without assets/', async () => {
    const root = createDirectory();
    const store = createNoteAssetStore({ getRoot: () => ({ handle: root, writable: true }) });
    assertDeepEqual(await store.list(), []);

    root.children.set('assets', createDirectory({
        'old.png': { data: bytes(PNG), lastModified: 10 },
        'new.jpg': { data: bytes(PNG), lastModified: 20 },
        'notes.txt': { data: 'x', lastModified: 30 }
    }));
    const items = await store.list();
    assertDeepEqual(items.map(item => item.path), ['assets/new.jpg', 'assets/old.png']);
    assertEqual(items[1].size, PNG.length);
});

test('removing deletes the file and rejects paths outside assets/', async () => {
    const root = createDirectory();
    root.children.set('assets', createDirectory({ 'a.png': { data: bytes(PNG), lastModified: 1 } }));
    const store = createNoteAssetStore({ getRoot: () => ({ handle: root, writable: true }) });

    assert((await rejects(store.remove('../a.png'))) instanceof NoteAssetError);
    await store.remove('assets/a.png');
    assertDeepEqual(await store.list(), []);
    await store.remove('assets/a.png');
    assertEqual(await store.getUrl('assets/a.png'), null);
});

test('usage marks the images no scenario refers to', () => {
    const items = attachImageUsage(
        [{ name: 'a.png' }, { name: 'b.png' }],
        new Map([['a.png', ['login.json', 'signup.json']]])
    );
    assertDeepEqual(items[0].usedBy, ['login.json', 'signup.json']);
    assertDeepEqual(items[1].usedBy, []);
    assertDeepEqual(summarizeImages(items), { total: 2, unused: 1 });
});
