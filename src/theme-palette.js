import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Palette copied from styles/reset-layer.css so a code block reads like the
// JSON editor next to it. CodeMirror's defaultHighlightStyle is built for light
// backgrounds and is unreadable here.
export const PALETTE = {
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

export const darkHighlightStyle = HighlightStyle.define(
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
    // Markdown headings (`#` ... `######`, setext) carry heading1-6; a GFM
    // table's header row carries plain `heading`. The more specific tag wins,
    // so headings stay red and a table header reads like body text.
    { tag: t.heading, color: PALETTE.text },
    {
      tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
      color: PALETTE.keyword,
      fontWeight: "bold",
    },
    { tag: t.url, color: PALETTE.number },
    { tag: t.monospace, color: PALETTE.string },
    { tag: t.quote, color: PALETTE.comment },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: PALETTE.type },
    { tag: t.invalid, color: PALETTE.invalid },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "bold" },
  ],
  { themeType: "dark" }
);
