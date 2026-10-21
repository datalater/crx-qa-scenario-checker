// Single source of truth for keyboard shortcuts.
// Both the key handlers (matchShortcut) and the help modal read this list.
// To add a shortcut: append an entry here, then call matchShortcut(event, id).
//
// binding fields:
//   codes / keys   event.code / lower-cased event.key values that trigger it
//   primary        true: Cmd or Ctrl; false: neither. Omit to ignore.
//   meta/ctrl/shift/alt  exact modifier state. Omit to ignore.
//   platform       'mac' | 'other' - which platform lists it in the help modal
//                  (omit for both). Matching itself is not platform-gated.
//   display        optional key label override for the help modal
export const SHORTCUTS = [
    {
        id: 'save',
        label: 'Save (Table Editor) / Format + Save (JSON Editor)',
        bindings: [{ codes: ['KeyS'], keys: ['s'], primary: true, shift: false, alt: false }]
    },
    {
        id: 'undo',
        label: 'Undo',
        bindings: [{ codes: ['KeyZ'], keys: ['z'], primary: true, shift: false, alt: false }]
    },
    {
        id: 'redo',
        label: 'Redo',
        bindings: [
            { codes: ['KeyZ'], keys: ['z'], primary: true, shift: true, alt: false },
            { codes: ['KeyY'], keys: ['y'], primary: true, shift: false, alt: false, platform: 'other' }
        ]
    },
    {
        id: 'findOpen',
        label: 'Find in active editor',
        bindings: [{ codes: ['KeyF'], keys: ['f'], primary: true, shift: false, alt: false }]
    },
    {
        id: 'replaceOpen',
        label: 'Find & Replace',
        bindings: [
            { codes: ['KeyF'], keys: ['f'], meta: true, ctrl: false, shift: false, alt: true, platform: 'mac' },
            { codes: ['KeyH'], keys: ['h'], primary: true, shift: false, alt: false, platform: 'other' }
        ]
    },
    {
        id: 'findNext',
        label: 'Next match',
        bindings: [{ codes: ['Enter', 'NumpadEnter'], keys: ['enter'], primary: false, shift: false, alt: false }]
    },
    {
        id: 'findPrevious',
        label: 'Previous match',
        bindings: [{ codes: ['Enter', 'NumpadEnter'], keys: ['enter'], primary: false, shift: true, alt: false }]
    },
    {
        id: 'findClose',
        label: 'Close find',
        bindings: [{ codes: ['Escape'], keys: ['escape'], primary: false, shift: false, alt: false }]
    },
    {
        id: 'cursorHistoryBack',
        label: 'Cursor back',
        bindings: [{ codes: ['Minus', 'NumpadSubtract'], keys: ['-'], primary: true, shift: false, alt: false, display: '-' }]
    },
    {
        id: 'cursorHistoryForward',
        label: 'Cursor forward',
        bindings: [{ codes: ['Minus', 'NumpadSubtract'], keys: ['_', '-'], primary: true, shift: true, alt: false, display: '-' }]
    },
    {
        id: 'commandPalette',
        label: 'Command palette (new file / folder)',
        bindings: [{ codes: ['KeyP'], keys: ['p'], meta: true, ctrl: false, shift: true, alt: false, platform: 'mac' }]
    },
    {
        id: 'newFile',
        label: 'New file',
        bindings: [{ codes: ['KeyN'], keys: ['n'], meta: true, ctrl: false, shift: false, alt: true, platform: 'mac' }]
    },
    {
        id: 'toggleFileTree',
        label: 'Toggle file tree',
        // meta only: Ctrl+B moves the caret back one character in macOS text fields.
        bindings: [{ codes: ['KeyB'], keys: ['b'], meta: true, ctrl: false, shift: false, alt: false, platform: 'mac' }]
    },
    {
        id: 'indent',
        label: 'Indent (JSON Editor)',
        bindings: [{ codes: ['Tab'], keys: ['tab'], shift: false }]
    },
    {
        id: 'outdent',
        label: 'Outdent (JSON Editor)',
        bindings: [{ codes: ['Tab'], keys: ['tab'], shift: true }]
    },
    {
        id: 'tabPrevious',
        label: 'Previous open file tab',
        bindings: [
            { codes: ['BracketLeft'], keys: ['[', '{'], meta: true, ctrl: false, shift: true, alt: false, platform: 'mac' },
            { codes: ['ArrowLeft'], keys: ['arrowleft'], meta: true, ctrl: false, shift: false, alt: true, platform: 'mac' }
        ]
    },
    {
        id: 'tabNext',
        label: 'Next open file tab',
        bindings: [
            { codes: ['BracketRight'], keys: [']', '}'], meta: true, ctrl: false, shift: true, alt: false, platform: 'mac' },
            { codes: ['ArrowRight'], keys: ['arrowright'], meta: true, ctrl: false, shift: false, alt: true, platform: 'mac' }
        ]
    }
];
