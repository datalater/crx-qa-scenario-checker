/**
 * Images pasted into note cells. They are files in `assets/` at the root of
 * the opened folder, so the scenario JSON only carries a short path and the
 * images are versioned with the scenarios that use them.
 *
 * Without an opened folder there is nowhere to put a file, so saving fails
 * with a message instead of falling back to another store.
 */
import { NOTE_ASSET_DIR, isNoteAssetPath, noteAssetName, noteAssetPath } from './note-inline.js';

export const NOTE_IMAGE_LIMIT = 10 * 1024 * 1024;

const MIME_BY_EXTENSION = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp'
};

function ascii(bytes, from, to) {
    return String.fromCharCode(...bytes.slice(from, to));
}

/** File type from the content, not the name or the clipboard's claim. */
export function detectImageExtension(bytes) {
    if (!bytes || bytes.length < 12) return null;
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.every((value, index) => bytes[index] === value)) return 'png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
    if (['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'gif';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
    return null;
}

export function imageMimeForName(name) {
    const extension = String(name || '').split('.').pop().toLowerCase();
    return MIME_BY_EXTENSION[extension] || '';
}

const pad = value => String(value).padStart(2, '0');

/**
 * A name a person can read and sort: the time the image was pasted. Two
 * images in the same second get `-2`, `-3`, ...
 */
export function buildAssetFileName(date, extension, taken = []) {
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
        + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const used = new Set([...taken].map(name => String(name).toLowerCase()));
    let name = `${stamp}.${extension}`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${stamp}-${n}.${extension}`;
    return name;
}

export function formatAssetSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export class NoteAssetError extends Error {}

/**
 * `getRoot()` returns `{ handle, writable }` for the opened folder, or null.
 * It is read on every call because the folder can be opened, closed, or
 * granted write access at any time.
 */
export function createNoteAssetStore({ getRoot, now = () => new Date() }) {
    const urlByName = new Map();
    const listeners = new Set();

    const notify = () => listeners.forEach(listener => listener());

    const forgetUrl = (name) => {
        const url = urlByName.get(name);
        if (url) URL.revokeObjectURL(url);
        urlByName.delete(name);
    };

    const requireRoot = ({ write = false } = {}) => {
        const root = getRoot();
        if (!root?.handle) throw new NoteAssetError('폴더를 열어야 이미지를 사용할 수 있습니다.');
        if (write && !root.writable) {
            throw new NoteAssetError('폴더 쓰기 권한이 없습니다. Grant Access를 눌러 권한을 허용하세요.');
        }
        return root.handle;
    };

    const getDirectory = async ({ create = false } = {}) => {
        const root = requireRoot({ write: create });
        try {
            return await root.getDirectoryHandle(NOTE_ASSET_DIR, { create });
        } catch (error) {
            if (error?.name === 'NotFoundError') return null;
            throw error;
        }
    };

    async function list() {
        const directory = await getDirectory();
        if (!directory) return [];
        const items = [];
        for await (const [name, handle] of directory.entries()) {
            if (handle.kind !== 'file' || !isNoteAssetPath(noteAssetPath(name))) continue;
            try {
                const file = await handle.getFile();
                items.push({ name, path: noteAssetPath(name), size: file.size, modifiedAt: file.lastModified });
            } catch (_) { /* removed while listing */ }
        }
        return items.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name));
    }

    /** Writes the image and returns its path, e.g. `assets/20261116-143205.png`. */
    async function save(blob) {
        if (!blob || !blob.size) throw new NoteAssetError('빈 이미지입니다.');
        if (blob.size > NOTE_IMAGE_LIMIT) throw new NoteAssetError('이미지는 10 MB 이하여야 합니다.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const extension = detectImageExtension(bytes);
        if (!extension) throw new NoteAssetError('PNG, JPEG, GIF 또는 WebP 이미지만 지원합니다.');

        const directory = await getDirectory({ create: true });
        const taken = [];
        for await (const name of directory.keys()) taken.push(name);
        const name = buildAssetFileName(now(), extension, taken);
        const fileHandle = await directory.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        notify();
        return noteAssetPath(name);
    }

    /** An object URL for the image, or null when the file is not there. */
    async function getUrl(path) {
        const name = noteAssetName(path);
        if (!name) return null;
        if (urlByName.has(name)) return urlByName.get(name);
        const directory = await getDirectory();
        if (!directory) return null;
        let file = null;
        try {
            file = await (await directory.getFileHandle(name)).getFile();
        } catch (error) {
            if (error?.name === 'NotFoundError') return null;
            throw error;
        }
        const typed = new Blob([file], { type: imageMimeForName(name) });
        const url = URL.createObjectURL(typed);
        urlByName.set(name, url);
        return url;
    }

    async function remove(path) {
        const name = noteAssetName(path);
        if (!name) throw new NoteAssetError('잘못된 이미지 경로입니다.');
        requireRoot({ write: true });
        const directory = await getDirectory();
        if (!directory) return;
        try {
            await directory.removeEntry(name);
        } catch (error) {
            if (error?.name !== 'NotFoundError') throw error;
        }
        forgetUrl(name);
        notify();
    }

    /** Drops cached URLs, e.g. when another folder is opened. */
    function reset() {
        [...urlByName.keys()].forEach(forgetUrl);
        notify();
    }

    return {
        list,
        save,
        getUrl,
        remove,
        reset,
        isAvailable: () => Boolean(getRoot()?.handle),
        isWritable: () => Boolean(getRoot()?.handle && getRoot().writable),
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}
