import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
} from "@codemirror/view";
import { liveMarkdown, markdownSlashCommands } from "./live-markdown.js";
import { PALETTE, darkHighlightStyle } from "./theme-palette.js";

const LANGUAGE_EXTENSIONS = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json,
  html,
  css,
  // GFM (tables, strikethrough, task lists) on top of CommonMark. Fenced code
  // blocks reuse the languages above.
  markdown: () => [
    markdown({ base: markdownLanguage, codeLanguages: resolveFencedLanguage }),
    markdownSlashCommands,
  ],
};

const FENCE_ALIASES = { js: "javascript", ts: "typescript", md: "markdown" };

function resolveFencedLanguage(info) {
  const key = String(info || "").trim().toLowerCase();
  const id = FENCE_ALIASES[key] || key;
  if (id === "markdown") return null;
  const factory = LANGUAGE_EXTENSIONS[id];
  return factory ? factory().language : null;
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_EXTENSIONS);

// Unknown ids (including an explicit "plain") get no language: the editor
// still works, just without highlighting.
function resolveLanguage(lang) {
  const factory = LANGUAGE_EXTENSIONS[String(lang || "").toLowerCase()];
  return factory ? [factory()] : [];
}

// `cm-wrapping` lets other extensions (the live table) follow the wrap mode.
function resolveWrap(wrap) {
  return wrap ? [EditorView.lineWrapping, EditorView.editorAttributes.of({ class: "cm-wrapping" })] : [];
}

// Only markdown has a live view (see modules/code-view.js); any other
// language, or the source view, gets nothing.
function resolveView(lang, view) {
  return String(lang || "").toLowerCase() === "markdown" && view === "live" ? liveMarkdown() : [];
}

/**
 * `dark: true` matters beyond colors: it adds CodeMirror's `cm-dark` class,
 * which switches the built-in caret rule to a light border. Without it the
 * caret stays `1.2px solid black` and is invisible on this background.
 */
function editorTheme() {
  return EditorView.theme(
    {
      "&": {
        color: PALETTE.text,
        backgroundColor: "#0d1117",
        maxHeight: "300px",
        border: "1px solid #21262d",
        borderRadius: "4px",
        overflow: "hidden",
      },
      "&.cm-focused": {
        outline: "none",
        borderColor: "#2f81f7",
      },
      ".cm-scroller": {
        maxHeight: "300px",
        overflow: "auto",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: "12px",
        lineHeight: "1.6",
      },
      ".cm-content": {
        padding: "6px 0",
        caretColor: PALETTE.text,
      },
      ".cm-line": { padding: "0 8px" },

      // Caret: set explicitly so it is visible even before `cm-dark` applies.
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: PALETTE.text,
        borderLeftWidth: "2px",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: PALETTE.text,
      },

      // Selection must match the base theme's selector: its dark rule
      // (`&dark.cm-focused > .cm-scroller > .cm-selectionLayer ...`, #233) is
      // more specific than a plain `.cm-selectionBackground` and otherwise
      // wins, leaving the selection nearly invisible on this background.
      "& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "#264f7880",
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "#264f78",
      },
      // The selection layer is drawn *under* the text, so an opaque active
      // line would hide the selection on the cursor's line. Keep it see-through.
      ".cm-activeLine": { backgroundColor: "#ffffff0a" },
      ".cm-gutters": {
        backgroundColor: "#0d1117",
        color: PALETTE.muted,
        border: "none",
        borderRight: "1px solid #21262d",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#161b22",
        color: PALETTE.text,
      },
      ".cm-foldGutter .cm-gutterElement": { color: PALETTE.muted },
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor: "#3fb95040",
        outline: "1px solid #3fb950",
      },
      ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
        outline: "1px solid #f85149",
      },
      ".cm-placeholder": { color: PALETTE.muted },
      ".cm-tooltip": {
        backgroundColor: "#161b22",
        border: "1px solid #30363d",
        color: PALETTE.text,
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "#21262d",
        color: PALETTE.text,
      },
      ".cm-panels": {
        backgroundColor: "#161b22",
        color: PALETTE.text,
      },
      ".cm-searchMatch": {
        backgroundColor: "#d2992240",
        outline: "1px solid #d29922",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "#d2992266",
      },
    },
    { dark: true }
  );
}

/**
 * Creates a small code editor for a note code block.
 * `onChange` fires on every document change so the caller can persist right
 * away; waiting for blur would lose text when the panel is closed.
 */
export function createCodeEditor(options) {
  const {
    parent,
    doc = "",
    lang = "",
    view = "",
    wrap = false,
    placeholder = "",
    onChange = () => {},
  } = options;

  // The language sits in a compartment so it can change without rebuilding
  // the editor (and losing focus, history and selection).
  const languageCompartment = new Compartment();
  const viewCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  let currentLang = lang;
  let currentView = view;
  const editorView = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        placeholderExtension(placeholder),
        languageCompartment.of(resolveLanguage(lang)),
        viewCompartment.of(resolveView(lang, view)),
        wrapCompartment.of(resolveWrap(wrap)),
        search(),
        syntaxHighlighting(darkHighlightStyle, { fallback: true }),
        keymap.of([
          ...searchKeymap,
          // Tab accepts an open completion first; acceptCompletion returns
          // false when none is open, so Tab falls through to indentation.
          { key: "Tab", run: acceptCompletion },
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(editorView.state.doc.toString());
        }),
        editorTheme(),
      ],
    }),
  });

  return {
    getValue: () => editorView.state.doc.toString(),
    setValue(nextValue) {
      const insert = nextValue ?? "";
      if (insert === editorView.state.doc.toString()) return;
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert },
      });
    },
    focus: () => editorView.focus(),
    blur: () => editorView.contentDOM.blur(),
    setLanguage(nextLang) {
      currentLang = nextLang;
      editorView.dispatch({
        effects: [
          languageCompartment.reconfigure(resolveLanguage(nextLang)),
          viewCompartment.reconfigure(resolveView(currentLang, currentView)),
        ],
      });
    },
    /** `source` or `live`; ignored by languages without a live view. */
    setView(nextView) {
      currentView = nextView;
      editorView.dispatch({ effects: viewCompartment.reconfigure(resolveView(currentLang, currentView)) });
    },
    /** Wraps long lines to the editor width instead of scrolling sideways. */
    setWrap(nextWrap) {
      editorView.dispatch({ effects: wrapCompartment.reconfigure(resolveWrap(nextWrap)) });
    },
    destroy: () => editorView.destroy(),
  };
}
