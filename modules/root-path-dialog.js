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
        return { error: '/ 또는 ~/ 로 시작하는 절대 경로를 입력하세요.' };
    }
    const last = path.split('/').pop();
    if (rootName && last !== rootName) {
        return { warning: `경로의 마지막 폴더가 연 폴더 이름(${rootName})과 다릅니다.` };
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
    const intro = el('div', 'root-path-dialog__intro');
    intro.append(
        el('p', '', `"${rootName}" 폴더는 이미 연결되어 있고 저장도 잘 됩니다. 이 설정은 저장과는 관계없습니다.`),
        el('p', '', '행 참조 복사로 넘긴 JSON에는 그 행이 든 파일의 위치(file)가 들어갑니다. '
            + '그런데 브라우저는 보안상 연 폴더가 디스크의 어디에 있는지 알려주지 않아서, '
            + 'file이 폴더 이름부터 시작합니다. 참조를 받은 에이전트가 이 폴더 밖에서 일하고 있으면 '
            + '파일을 찾지 못할 수 있습니다.'),
        el('p', '', '실제 경로를 한 번 적어 두면 file이 절대 경로가 되어, 받는 쪽이 그 파일을 바로 열어 '
            + '최신 내용을 확인할 수 있습니다. 폴더 이름별로 기억합니다.')
    );

    const label = el('label', 'root-path-dialog__field');
    const input = el('input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = `/Users/me/work/${rootName}`;
    input.value = current || '';
    label.append(el('span', '', `"${rootName}" 폴더의 실제 경로`), input);

    const tip = el('p', 'root-path-dialog__tip');
    tip.append('Finder에서 폴더를 선택하고 ', el('kbd', '', '⌥⌘C'), '를 누르면 경로가 복사됩니다. 그대로 붙여넣으세요.');

    const message = el('p', 'root-path-dialog__message');
    const sample = el('div', 'root-path-dialog__preview');

    const actions = el('div', 'root-path-dialog__actions');
    const clear = el('button', 'is-danger', '설정 지우기');
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
        sample.replaceChildren(el('span', '', '복사되는 file: '), el('code', '', preview(normalizeRootPath(input.value))));
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
