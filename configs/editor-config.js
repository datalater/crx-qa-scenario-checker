export const EDITOR_CONFIG = {
    shortcuts: {
        save: {
            codes: ['KeyS'],
            keys: ['s'],
            primary: true,
            shift: false,
            alt: false
        },
        undo: {
            codes: ['KeyZ'],
            keys: ['z'],
            primary: true,
            shift: false,
            alt: false
        },
        redoByShift: {
            codes: ['KeyZ'],
            keys: ['z'],
            primary: true,
            shift: true,
            alt: false
        },
        redoByCtrlY: {
            codes: ['KeyY'],
            keys: ['y'],
            primary: true,
            shift: false,
            alt: false
        },
        cursorHistoryBack: {
            codes: ['Minus', 'NumpadSubtract'],
            keys: ['-'],
            primary: true,
            shift: false,
            alt: false
        },
        cursorHistoryForward: {
            codes: ['Minus', 'NumpadSubtract'],
            keys: ['_', '-'],
            primary: true,
            shift: true,
            alt: false
        },
        findOpen: {
            codes: ['KeyF'],
            keys: ['f'],
            primary: true,
            shift: false,
            alt: false
        },
        replaceOpenMac: {
            codes: ['KeyF'],
            keys: ['f'],
            meta: true,
            ctrl: false,
            shift: false,
            alt: true
        },
        replaceOpenWinLinux: {
            codes: ['KeyH'],
            keys: ['h'],
            primary: true,
            shift: false,
            alt: false
        },
        findNext: {
            codes: ['Enter', 'NumpadEnter'],
            keys: ['enter'],
            primary: false,
            shift: false,
            alt: false
        },
        findPrevious: {
            codes: ['Enter', 'NumpadEnter'],
            keys: ['enter'],
            primary: false,
            shift: true,
            alt: false
        },
        findClose: {
            codes: ['Escape'],
            keys: ['escape'],
            primary: false,
            shift: false,
            alt: false
        }
    },
    cursorHistory: {
        maxEntries: 200
    }
};
