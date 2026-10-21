import { parseNewEntryPath, describeNewEntryError } from './new-entry-path.js';

/**
 * "새 파일" palette command.
 *   new-file         -> file in the base folder
 *   a/b/new-file     -> folders a/b (reused if present) + file
 *   a/b/             -> folders only
 */
export function createNewFileCommand({ getBaseFolderLabel, create }) {
    function getPreview(value) {
        if (!value.trim()) {
            return { text: '파일 이름을 입력하세요. 슬래시(/)로 폴더를 함께 만들 수 있습니다.', error: false };
        }
        const parsed = parseNewEntryPath(value);
        if (parsed.error) return { text: describeNewEntryError(parsed.error), error: true };
        const base = getBaseFolderLabel?.() || '';
        const folderPath = [base, ...parsed.folders].filter(Boolean).join('/');
        if (!parsed.file) return { text: `${folderPath}/ 폴더 생성`, error: false };
        const fileName = /\.json$/i.test(parsed.file) ? parsed.file : `${parsed.file}.json`;
        return { text: `${folderPath ? folderPath + '/' : ''}${fileName} 파일 생성`, error: false };
    }

    return {
        id: 'newFile',
        label: '새 파일',
        shortcutId: 'newFile',
        run: (api) => api.prompt({
            placeholder: '새 파일 이름 (폴더/파일 형태도 가능)',
            getPreview,
            onSubmit: (value) => {
                const parsed = parseNewEntryPath(value);
                if (!parsed.error) return create(parsed);
            }
        })
    };
}
