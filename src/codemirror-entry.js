import {
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
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
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
import { tags as t } from "@lezer/highlight";

const LANGUAGE_EXTENSIONS = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json,
  html,
  css,
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_EXTENSIONS);

function resolveLanguage(lang) {
  const factory = LANGUAGE_EXTENSIONS[String(lang || "").toLowerCase()];
  return factory ? [factory()] : [];
}

// Palette copied from styles/reset-layer.css so a code block reads like the
// JSON editor next to it. CodeMirror's defaultHighlightStyle is built for light
// backgrounds and is unreadable here.
const PALETTE = {
  text: "#e6edf3",
  muted: "#7d8590",
  keyword: "#ff7b72",
  string: "#a5d6ff",
  number: "#79c0ff",
  name: "#79c0ff",
  func: "#d2a8ff",
  type: "#ffa657",
  comment: "#8b949e",
  invalid: "#f85149",
};

const darkHighlightStyle = HighlightStyle.define(
  [
    { tag: t.keyword, color: PALETTE.keyword },
    { tag: [t.controlKeyword, t.moduleKeyword], color: PALETTE.keyword },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: PALETTE.text },
    { tag: [t.variableName], color: PALETTE.text },
    { tag: [t.function(t.variableName), t.labelName], color: PALETTE.func },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: PALETTE.number },
    { tag: [t.definition(t.name), t.separator], color: PALETTE.text },
    { tag: [t.className], color: PALETTE.type },
    { tag: [t.typeName, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: PALETTE.type },
    { tag: [t.number, t.integer, t.float], color: PALETTE.number },
    { tag: [t.operator, t.operatorKeyword], color: PALETTE.keyword },
    { tag: [t.regexp, t.escape, t.special(t.string)], color: PALETTE.string },
    { tag: [t.string, t.processingInstruction, t.inserted], color: PALETTE.string },
    { tag: [t.meta, t.comment], color: PALETTE.comment, fontStyle: "italic" },
    { tag: t.link, color: PALETTE.number, textDecoration: "underline" },
    { tag: t.heading, color: PALETTE.keyword, fontWeight: "bold" },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: PALETTE.type },
    { tag: t.invalid, color: PALETTE.invalid },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "bold" },
  ],
  { themeType: "dark" }
);

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

      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "#264f78",
      },
      ".cm-activeLine": { backgroundColor: "#161b22" },
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
    placeholder = "",
    onChange = () => {},
  } = options;

  const view = new EditorView({
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
        ...resolveLanguage(lang),
        search(),
        syntaxHighlighting(darkHighlightStyle, { fallback: true }),
        keymap.of([
          ...searchKeymap,
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(view.state.doc.toString());
        }),
        editorTheme(),
      ],
    }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue(nextValue) {
      const insert = nextValue ?? "";
      if (insert === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert },
      });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
