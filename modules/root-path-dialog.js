/**
 * The dialog for the opened folder's real path. A browser never says where a
 * folder it opened lives on disk, so a copied row reference can only name the
 * folder; with the path written here once, it carries an absolute path that
 * a tool outside this folder can open directly.
 */

/** A path as stored: trimmed, without a trailing slash, `~` kept as written. */
export function normalizeRootPath(value) {
    return String(value ?? '').trim().replace(/\/+$/, '');
}

/**
 * What is wrong with a path, if anything. An `error` blocks saving; a
 * `warning` is shown but allowed (the folder may have been renamed since).
 */
export function checkRootPath(value, rootName) {
    const path = normalizeRootPath(value);
    if (!path) return {};
    if (!path.startsWith('/') && !path.startsWith('~/')) {
        return { error: '/ 또는 ~/ 로 시작해야 합니다.' };
    }
    const last = path.split('/').pop();
    if (rootName && last !== rootName) {
        return { warning: `경로 끝 폴더가 연 폴더(${rootName})와 다릅니다.` };
    }
    return {};
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

/**
 * Opens the dialog. `preview(path)` gives the `file` a reference would carry
 * with that path; `onSave(path)` stores it, an empty path clearing it.
 */
export function openRootPathDialog({ rootName, current, preview, onSave }) {
    const dialog = el('dialog', 'root-path-dialog');
    const form = el('form');

    const title = el('h3', '', '참조 경로');
    // Two short lines: what it changes, and that the folder itself is fine.
    const intro = el('div', 'root-path-dialog__intro');
    intro.append(
        el('p', '', '행 참조를 복사할 때 file을 절대 경로로 내보냅니다.'),
        el('p', 'root-path-dialog__note', '브라우저는 폴더 위치를 알려주지 않아 직접 적어야 합니다. 폴더 연결·저장과는 무관합니다.')
    );

    const label = el('label', 'root-path-dialog__field');
    const input = el('input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = `/Users/me/work/${rootName}`;
    input.value = current || '';
    label.append(el('span', '', `${rootName} 폴더 경로`), input);

    const tip = el('p', 'root-path-dialog__tip');
    tip.append('Finder에서 폴더 선택 후 ', el('kbd', '', '⌥⌘C'), ' → 붙여넣기');

    const message = el('p', 'root-path-dialog__message');
    const sample = el('div', 'root-path-dialog__preview');

    const actions = el('div', 'root-path-dialog__actions');
    const clear = el('button', 'is-danger', '지우기');
    clear.type = 'button';
    clear.hidden = !current;
    const spacer = el('span', 'root-path-dialog__spacer');
    const cancel = el('button', '', '취소');
    cancel.type = 'button';
    const save = el('button', 'is-primary', '저장');
    save.type = 'submit';
    actions.append(clear, spacer, cancel, save);

    form.append(title, intro, label, tip, message, sample, actions);
    dialog.append(form);

    const refresh = () => {
        const { error, warning } = checkRootPath(input.value, rootName);
        message.textContent = error || warning || '';
        message.classList.toggle('is-error', Boolean(error));
        save.disabled = Boolean(error);
        sample.replaceChildren(el('span', '', 'file  '), el('code', '', preview(normalizeRootPath(input.value))));
    };

    // Every way out goes through finish(), which removes the dialog itself
    // rather than waiting for its close event.
    let done = false;
    const finish = (value) => {
        if (done) return;
        done = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        if (value !== null) onSave(value);
    };
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (checkRootPath(input.value, rootName).error) return;
        finish(normalizeRootPath(input.value));
    });
    clear.addEventListener('click', () => finish(''));
    cancel.addEventListener('click', () => finish(null));
    input.addEventListener('input', refresh);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
    });
    dialog.addEventListener('close', () => finish(null));

    refresh();
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
    return dialog;
}
