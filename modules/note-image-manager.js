/**
 * The image list behind the status bar: every file in the opened folder's
 * `assets/`, where it is used, and the way to delete what is no longer
 * needed. Nothing is ever deleted automatically, because a reference can be
 * restored by undo or by version control after its image is gone.
 */
import { formatAssetSize } from './note-assets.js';
import { buildNoteImageMarkdown } from './note-inline.js';

const pad = value => String(value).padStart(2, '0');

function formatModifiedAt(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function button(label, onClick, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `note-images__btn ${className}`.trim();
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
}

/** Adds `usedBy` (scenario names) to each listed image. */
export function attachImageUsage(items, references) {
    return items.map(item => ({ ...item, usedBy: references.get(item.name) || [] }));
}

export function summarizeImages(items) {
    const unused = items.filter(item => item.usedBy.length === 0).length;
    return { total: items.length, unused };
}

/**
 * `getReferences()` returns Map<image name, scenario names[]> for the
 * scenarios loaded from the opened folder.
 */
export function createNoteImageManager({ assets, getReferences, openLightbox, notify = () => {}, statusButton, statusLabel }) {
    let dialog = null;
    let refreshToken = 0;

    async function load() {
        return attachImageUsage(await assets.list(), getReferences());
    }

    function setStatus(text, title) {
        if (statusLabel) statusLabel.textContent = text;
        if (statusButton) statusButton.title = title;
    }

    /** Repaints the status bar entry and, when open, the list. */
    async function refresh() {
        const token = ++refreshToken;
        if (!assets.isAvailable()) {
            setStatus('Images –', '폴더를 열면 노트 셀에 이미지를 붙여넣을 수 있습니다.');
            if (dialog) paint([], '폴더를 열어야 이미지를 사용할 수 있습니다.');
            return;
        }
        let items = [];
        try {
            items = await load();
        } catch (error) {
            if (token !== refreshToken) return;
            const denied = error?.name === 'NotAllowedError';
            const message = denied ? '폴더 접근 권한이 필요합니다. Grant Access를 누르세요.' : (error?.message || '이미지 목록을 읽지 못했습니다.');
            setStatus('Images ?', message);
            if (dialog) paint([], message);
            return;
        }
        if (token !== refreshToken) return;
        const { total, unused } = summarizeImages(items);
        setStatus(
            unused > 0 ? `Images ${total} · 미사용 ${unused}` : `Images ${total}`,
            '이미지 관리: assets/ 폴더의 이미지 목록'
        );
        if (dialog) paint(items);
    }

    async function removeImages(items) {
        for (const item of items) {
            try {
                await assets.remove(item.path);
            } catch (error) {
                notify(error?.message || `삭제하지 못했습니다: ${item.name}`, 'error');
                break;
            }
        }
        // assets.remove notifies its listeners, which refresh this view.
    }

    function buildCard(item) {
        const card = document.createElement('li');
        card.className = 'note-images__card';
        if (item.usedBy.length === 0) card.classList.add('is-unused');

        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'note-images__thumb';
        thumb.title = '크게 보기';
        thumb.addEventListener('click', () => openLightbox(item.path, item.name));
        assets.getUrl(item.path).then((url) => {
            if (!url) return;
            const img = document.createElement('img');
            img.src = url;
            img.alt = item.name;
            img.loading = 'lazy';
            thumb.append(img);
        }).catch(() => { /* the card still lists the file */ });

        const name = document.createElement('div');
        name.className = 'note-images__name';
        name.textContent = item.name;
        name.title = item.path;

        const meta = document.createElement('div');
        meta.className = 'note-images__meta';
        meta.textContent = `${formatAssetSize(item.size)} · ${formatModifiedAt(item.modifiedAt)}`;

        const usage = document.createElement('div');
        usage.className = 'note-images__usage';
        usage.textContent = item.usedBy.length ? `사용: ${item.usedBy.join(', ')}` : '미사용';
        usage.title = usage.textContent;

        const actions = document.createElement('div');
        actions.className = 'note-images__actions';
        actions.append(
            button('참조 복사', async () => {
                const markdown = buildNoteImageMarkdown('', item.path);
                try {
                    await navigator.clipboard.writeText(markdown);
                    notify(`복사했습니다: ${markdown}`);
                } catch (_) {
                    notify('클립보드에 복사하지 못했습니다.', 'error');
                }
            }),
            button('삭제', () => {
                const message = item.usedBy.length
                    ? `“${item.name}”은(는) ${item.usedBy.join(', ')}에서 사용 중입니다.\n삭제하면 그 노트의 이미지가 보이지 않습니다. 삭제할까요?`
                    : `“${item.name}”을(를) 삭제할까요?`;
                if (confirm(message)) void removeImages([item]);
            }, 'is-danger')
        );

        card.append(thumb, name, meta, usage, actions);
        return card;
    }

    function paint(items, emptyMessage = '') {
        if (!dialog) return;
        const { total, unused } = summarizeImages(items);
        dialog.querySelector('.note-images__summary').textContent = emptyMessage
            ? '' : `${total}개 · 미사용 ${unused}개`;

        const sweep = dialog.querySelector('.note-images__sweep');
        sweep.hidden = unused === 0 || !assets.isWritable();
        sweep.textContent = `미사용 ${unused}개 삭제`;
        sweep.onclick = () => {
            const targets = items.filter(item => item.usedBy.length === 0);
            if (confirm(`어떤 시나리오에서도 쓰지 않는 이미지 ${targets.length}개를 삭제할까요?\n열려 있는 폴더의 시나리오(.json)만 확인했습니다.`)) {
                void removeImages(targets);
            }
        };

        const list = dialog.querySelector('.note-images__list');
        const empty = dialog.querySelector('.note-images__empty');
        list.replaceChildren(...items.map(buildCard));
        empty.hidden = items.length > 0;
        empty.textContent = emptyMessage
            || '아직 이미지가 없습니다. 노트 셀에 스크린샷을 붙여넣으면 assets/ 폴더에 저장됩니다.';
        dialog.querySelectorAll('.note-images__btn.is-danger').forEach((el) => {
            el.disabled = !assets.isWritable();
        });
    }

    function open() {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.className = 'note-images';

        const header = document.createElement('div');
        header.className = 'note-images__header';
        const title = document.createElement('h3');
        title.textContent = 'Images';
        const summary = document.createElement('span');
        summary.className = 'note-images__summary';
        const sweep = button('', () => {}, 'note-images__sweep is-danger');
        sweep.hidden = true;
        const close = button('닫기', () => dialog.close());
        header.append(title, summary, sweep, close);

        const list = document.createElement('ul');
        list.className = 'note-images__list';
        const empty = document.createElement('p');
        empty.className = 'note-images__empty';
        empty.textContent = '불러오는 중…';

        // The dialog itself is only the backdrop's click target; its content
        // sits in a body that fills it.
        const body = document.createElement('div');
        body.className = 'note-images__body';
        body.append(header, list, empty);
        dialog.append(body);
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener('close', () => {
            dialog.remove();
            dialog = null;
            statusButton?.focus();
        });
        document.body.append(dialog);
        dialog.showModal();
        void refresh();
    }

    statusButton?.addEventListener('click', open);
    assets.onChange(() => { void refresh(); });

    return { open, refresh };
}
