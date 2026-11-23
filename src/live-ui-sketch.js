/**
 * Live view of a ```ui block: the text is drawn as a rough layout, with each
 * role named above the content it covers. The stored text is unchanged; the
 * `</>` button (or a double click) opens it for editing under the drawing.
 *
 * Syntax and parsing: ui-sketch.js.
 */
import { isolateHistory } from "@codemirror/commands";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { findFences } from "./live-diagram.js";
import { planTableDeletion } from "./markdown-table.js";
import { joinFence, splitFence } from "./mermaid-flow.js";
import { PALETTE } from "./theme-palette.js";
import { UI_FENCE_INFO, UI_SYNTAX_HELP, hasSpacer, parseUiBlock } from "./ui-sketch.js";

/** Opens the source of the block starting at this position (after `/ui`). */
export const openUiSourceEffect = StateEffect.define();

// What a block shows: both layers, the content alone, or the role names alone.
const MODES = [
  ["both", "역할 + 내용"],
  ["content", "내용만"],
  ["roles", "역할만"],
];
const MODE_STORAGE_KEY = "qa-scenarios-ui-sketch-mode-v1";

function readMode() {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (MODES.some(([id]) => id === stored)) return stored;
  } catch (_) { /* storage unavailable */ }
  return "both";
}

// One choice for every block: switching views is about how to read, not
// about one block.
let currentMode = readMode();

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function renderNode(node) {
  if (node.type === "text") return el("span", "cm-ui-text", node.value);
  if (node.type === "spacer") return el("span", "cm-ui-spacer");
  if (node.type === "var") return el("span", "cm-ui-var", node.name);
  if (node.type === "button") return el("span", `cm-ui-button${node.primary ? " is-primary" : ""}`, node.value);
  const role = el("span", `cm-ui-role${hasSpacer(node.children) ? " has-spacer" : ""}`);
  if (node.children.some((child) => child.type === "role")) role.classList.add("is-group");
  const body = el("span", "cm-ui-role-body");
  body.append(...node.children.map(renderNode));
  role.append(el("span", "cm-ui-role-name", node.name), body);
  return role;
}

function renderRows(source) {
  return parseUiBlock(source).map((row) => {
    if (row.type === "gap") return el("div", "cm-ui-gap");
    if (row.type === "error") {
      const error = el("div", "cm-ui-error", row.raw);
      error.title = "닫는 괄호나 따옴표가 없습니다";
      return error;
    }
    const line = el("div", "cm-ui-line");
    line.append(...row.nodes.map(renderNode));
    return line;
  });
}

class UiSketchController {
  constructor(view, wrap, block, openSource) {
    this.view = view;
    this.wrap = wrap;
    this.block = block;
    this.sourceOpen = openSource;
    this.help = null;
    this.helpPinned = false;
    this.build();
    this.refresh();
    // The completion that inserted the block may hand focus back to the
    // editor after the first frame, so the field is checked once more.
    if (openSource) {
      requestAnimationFrame(() => {
        this.focusSource();
        requestAnimationFrame(() => {
          if (this.sourceOpen && document.activeElement !== this.source) this.focusSource();
        });
      });
    }
  }

  get inner() {
    return splitFence(this.block)?.inner ?? "";
  }

  build() {
    const { wrap } = this;
    const bar = el("div", "cm-ui-bar");
    bar.append(el("span", "cm-ui-kind", UI_FENCE_INFO), el("span", "cm-ui-bar-spacer"));

    this.modeButtons = MODES.map(([id, label]) => {
      const button = this.button(label, "", () => setMode(id), "cm-ui-mode");
      button.dataset.mode = id;
      return button;
    });
    const modes = el("span", "cm-ui-modes");
    modes.append(...this.modeButtons);

    this.sourceToggle = this.button("</>", "원문 편집 (더블클릭으로도 열림)", () => this.toggleSource());
    bar.append(modes, this.buildHelpButton(), this.sourceToggle, this.button("삭제", "이 블록 삭제", () => this.deleteBlock(), "is-danger"));

    this.stage = el("div", "cm-ui-stage");
    this.stage.addEventListener("dblclick", () => this.toggleSource(true));

    this.source = el("textarea", "cm-ui-source");
    this.source.spellcheck = false;
    this.source.addEventListener("input", () => this.write(this.source.value));
    this.source.addEventListener("keydown", (event) => {
      // An IME re-sends the key that ends composition.
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      this.toggleSource(false);
      this.view.focus();
    });

    wrap.append(bar, this.stage, this.source);
  }

  // ----- syntax help: shown on hover, kept open by a click -----

  buildHelpButton() {
    const help = this.button("?", "", () => {
      // A click pins the panel; another click, Esc or a click elsewhere closes it.
      if (this.help && this.helpPinned) return this.closeHelp();
      this.openHelp(true);
    }, "cm-ui-help");
    help.setAttribute("aria-label", "ui 블록 문법");
    help.addEventListener("mouseenter", () => this.openHelp(this.helpPinned));
    help.addEventListener("mouseleave", () => this.closeHelpSoon());
    this.helpButton = help;
    return help;
  }

  openHelp(pinned) {
    clearTimeout(this.helpTimer);
    this.helpPinned = pinned;
    this.helpButton.classList.toggle("is-on", pinned);
    if (this.help) return;

    const panel = el("div", "cm-ui-help-panel");
    panel.setAttribute("role", "tooltip");
    UI_SYNTAX_HELP.forEach(([syntax, meaning]) => {
      const row = el("div", "cm-ui-help-row");
      row.append(el("code", "", syntax), el("span", "", meaning));
      panel.appendChild(row);
    });
    panel.appendChild(el("div", "cm-ui-help-note", "</> 또는 그림 더블클릭으로 원문을 고칩니다. 내용을 선택하고 ( 나 \" 를 누르면 그 기호로 감쌉니다."));
    // Moving from the button onto the panel keeps it open, so it can be read.
    panel.addEventListener("mouseenter", () => clearTimeout(this.helpTimer));
    panel.addEventListener("mouseleave", () => this.closeHelpSoon());

    // Shown in the top layer: a short block in a fixed-height editor would
    // otherwise clip the panel at the editor's edge.
    panel.popover = "manual";
    this.wrap.appendChild(panel);
    panel.showPopover();
    const box = this.helpButton.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const below = box.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 4) : below;
    panel.style.top = `${top}px`;
    panel.style.left = `${Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8)}px`;
    this.help = panel;

    this.onHelpOutside = (event) => {
      if (!panel.contains(event.target) && !this.helpButton.contains(event.target)) this.closeHelp();
    };
    this.onHelpKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      this.closeHelp();
    };
    // The panel is placed once, so it would drift from its button on scroll.
    this.onHelpScroll = () => this.closeHelp();
    document.addEventListener("mousedown", this.onHelpOutside, true);
    document.addEventListener("keydown", this.onHelpKey, true);
    document.addEventListener("scroll", this.onHelpScroll, true);
  }

  /** Hover alone closes shortly after the pointer leaves; a pinned panel stays. */
  closeHelpSoon() {
    if (this.helpPinned) return;
    clearTimeout(this.helpTimer);
    this.helpTimer = setTimeout(() => this.closeHelp(), 150);
  }

  closeHelp() {
    clearTimeout(this.helpTimer);
    this.help?.remove();
    this.help = null;
    this.helpPinned = false;
    this.helpButton.classList.remove("is-on");
    document.removeEventListener("mousedown", this.onHelpOutside, true);
    document.removeEventListener("keydown", this.onHelpKey, true);
    document.removeEventListener("scroll", this.onHelpScroll, true);
  }

  destroy() {
    this.closeHelp();
  }

  button(label, title, onClick, className = "") {
    const button = el("button", `cm-ui-btn ${className}`.trim(), label);
    button.type = "button";
    if (title) button.title = title;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  update(block) {
    this.block = block;
    this.refresh();
  }

  refresh() {
    const { inner } = this;
    this.stage.replaceChildren(...renderRows(inner));
    this.applyMode();
    this.source.hidden = !this.sourceOpen;
    this.sourceToggle.classList.toggle("is-on", this.sourceOpen);
    // Typing in the source must not be overwritten by its own echo.
    if (document.activeElement !== this.source) this.source.value = inner;
    this.source.rows = Math.min(16, Math.max(2, inner.split("\n").length + 1));
  }

  applyMode() {
    this.stage.dataset.mode = currentMode;
    this.modeButtons.forEach((button) => button.classList.toggle("is-on", button.dataset.mode === currentMode));
  }

  toggleSource(open = !this.sourceOpen) {
    this.sourceOpen = open;
    this.refresh();
    if (open) this.focusSource();
  }

  focusSource() {
    this.source.focus({ preventScroll: true });
    this.source.setSelectionRange(this.source.value.length, this.source.value.length);
  }

  // ----- writing back to the document -----

  range() {
    const pos = this.view.posAtDOM(this.wrap);
    return findFences(this.view.state.doc, UI_FENCE_INFO).find((fence) => fence.from === pos) || null;
  }

  write(inner) {
    const range = this.range();
    if (!range) return;
    const insert = joinFence(inner, UI_FENCE_INFO);
    if (insert === this.view.state.sliceDoc(range.from, range.to)) return;
    this.view.dispatch({ changes: { ...range, insert }, userEvent: "input" });
  }

  deleteBlock() {
    const range = this.range();
    if (!range) return;
    const { doc } = this.view.state;
    const first = doc.lineAt(range.from);
    const last = doc.lineAt(range.to);
    const info = (line) => ({ from: line.from, to: line.to, blank: !line.text.trim() });
    const target = planTableDeletion(range.from, range.to, {
      docLength: doc.length,
      prev: first.number > 1 ? info(doc.line(first.number - 1)) : null,
      next: last.number < doc.lines ? info(doc.line(last.number + 1)) : null,
    });
    this.view.dispatch({
      changes: { from: target.from, to: target.to, insert: "" },
      selection: { anchor: target.from },
      userEvent: "delete",
      annotations: isolateHistory.of("full"),
    });
    this.view.focus();
  }
}

function setMode(mode) {
  currentMode = mode;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch (_) { /* storage unavailable */ }
  // Every block on the page follows, including those in other editors.
  document.querySelectorAll(".cm-ui-wrap").forEach((wrap) => wrap._controller?.applyMode());
}

class UiSketchWidget extends WidgetType {
  constructor(block, openSource) {
    super();
    this.block = block;
    this.openSource = openSource;
  }

  eq(other) {
    return other.block === this.block;
  }

  toDOM(view) {
    const wrap = el("div", "cm-ui-wrap");
    wrap.contentEditable = "false";
    wrap._controller = new UiSketchController(view, wrap, this.block, this.openSource);
    return wrap;
  }

  // Keeps the open source field, and the caret in it, while the text changes.
  updateDOM(dom) {
    dom._controller?.update(this.block);
    return true;
  }

  destroy(dom) {
    dom._controller?.destroy();
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state, openAt = null) {
  const ranges = findFences(state.doc, UI_FENCE_INFO).map(({ from, to }) =>
    Decoration.replace({ widget: new UiSketchWidget(state.sliceDoc(from, to), from === openAt), block: true }).range(from, to)
  );
  return Decoration.set(ranges);
}

// Block decorations must come from a state field, not a view plugin.
const liveUiSketches = StateField.define({
  create: (state) => buildDecorations(state),
  update(decorations, tr) {
    const open = tr.effects.find((effect) => effect.is(openUiSourceEffect));
    if (tr.docChanged || open) return buildDecorations(tr.state, open ? open.value : null);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ---------- theme ----------

const ACCENT = "#2f81f7";
const ROLE_COLOR = "#a371f7";
const VAR_COLOR = "#d29922";

const uiSketchTheme = EditorView.theme({
  ".cm-ui-wrap": {
    position: "relative",
    // Like the diagram: the block takes the editor's width, never widens it.
    contain: "inline-size",
    minWidth: "0",
    maxWidth: "100%",
    margin: "6px 12px 6px 8px",
    border: "1px solid #30363d",
    borderRadius: "6px",
    backgroundColor: "#0d1117",
    fontFamily: "var(--font-ui, sans-serif)",
    fontSize: "13px",
    lineHeight: "1.5",
    color: PALETTE.text,
  },
  ".cm-ui-bar": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px 4px 16px",
    borderBottom: "1px solid #21262d",
  },
  ".cm-ui-kind": { fontSize: "9px", fontWeight: "700", letterSpacing: "0.05em", color: ACCENT },
  ".cm-ui-bar-spacer": { flex: "1" },
  ".cm-ui-modes": { display: "inline-flex" },
  ".cm-ui-btn": {
    padding: "1px 8px",
    border: "1px solid #30363d",
    borderRadius: "4px",
    backgroundColor: "transparent",
    color: PALETTE.muted,
    font: "inherit",
    fontSize: "11px",
    cursor: "pointer",
  },
  ".cm-ui-btn:hover": { color: PALETTE.text },
  ".cm-ui-btn.is-on": {
    color: ACCENT,
    borderColor: ACCENT,
    backgroundColor: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
  },
  ".cm-ui-btn.is-danger:hover": { color: "#f85149", borderColor: "#f85149" },
  ".cm-ui-help": { width: "20px", padding: "1px 0", textAlign: "center", borderRadius: "50%" },
  ".cm-ui-help-panel": {
    // A popover is centred by default; it is placed by its button instead.
    position: "fixed",
    inset: "auto",
    margin: "0",
    flexDirection: "column",
    gap: "4px",
    width: "max-content",
    maxWidth: "min(460px, calc(100vw - 16px))",
    color: PALETTE.text,
    fontFamily: "var(--font-ui, sans-serif)",
    lineHeight: "1.5",
    padding: "10px 12px",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
    boxShadow: "0 8px 24px rgba(1, 4, 9, 0.6)",
    fontSize: "12px",
  },
  ".cm-ui-help-panel:popover-open": { display: "flex" },
  ".cm-ui-help-row": { display: "flex", alignItems: "baseline", gap: "10px" },
  ".cm-ui-help-row code": {
    flex: "0 0 104px",
    fontFamily: "var(--font-code, monospace)",
    fontSize: "11px",
    color: PALETTE.text,
    whiteSpace: "nowrap",
  },
  ".cm-ui-help-row span": { color: PALETTE.muted },
  ".cm-ui-help-note": {
    marginTop: "4px",
    paddingTop: "6px",
    borderTop: "1px solid #21262d",
    color: PALETTE.muted,
    fontSize: "11px",
  },
  ".cm-ui-mode": { borderRadius: "0" },
  ".cm-ui-mode + .cm-ui-mode": { marginLeft: "-1px" },
  ".cm-ui-mode:first-child": { borderRadius: "4px 0 0 4px" },
  ".cm-ui-mode:last-child": { borderRadius: "0 4px 4px 0" },
  ".cm-ui-mode.is-on": { position: "relative" },

  ".cm-ui-stage": {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 16px",
    overflowX: "auto",
  },
  ".cm-ui-line": { display: "flex", alignItems: "flex-end", gap: "8px", minHeight: "22px" },
  ".cm-ui-gap": { height: "12px" },
  ".cm-ui-spacer": { flex: "1 1 24px", minWidth: "24px" },
  ".cm-ui-text": { whiteSpace: "pre-wrap" },
  ".cm-ui-button": {
    display: "inline-block",
    padding: "3px 12px",
    border: "1px solid #30363d",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  ".cm-ui-button.is-primary": { backgroundColor: "#30363d", borderColor: "#484f58" },
  ".cm-ui-var": {
    padding: "0 5px",
    borderRadius: "4px",
    fontFamily: "var(--font-code, monospace)",
    fontSize: "0.9em",
    color: VAR_COLOR,
    backgroundColor: `color-mix(in srgb, ${VAR_COLOR} 14%, transparent)`,
  },
  ".cm-ui-role": { display: "inline-flex", flexDirection: "column", minWidth: "0" },
  ".cm-ui-role.has-spacer": { flex: "1 1 auto" },
  ".cm-ui-role-name": {
    paddingBottom: "1px",
    fontFamily: "var(--font-code, monospace)",
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1.3",
    letterSpacing: "0.04em",
    color: ROLE_COLOR,
    whiteSpace: "nowrap",
  },
  // The line under a role name is as long as what the role covers. A role
  // only names its content: the same role looks different from screen to
  // screen, so no name carries a style.
  ".cm-ui-role-body": {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    paddingTop: "3px",
    borderTop: `1px solid color-mix(in srgb, ${ROLE_COLOR} 45%, transparent)`,
  },
  ".cm-ui-error": {
    fontFamily: "var(--font-code, monospace)",
    fontSize: "12px",
    color: "#f85149",
    whiteSpace: "pre-wrap",
  },
  ".cm-ui-error::before": { content: '"⚠ 닫는 괄호나 따옴표가 없습니다  "', opacity: "0.8" },

  // Content only: the role layer disappears.
  '.cm-ui-stage[data-mode="content"] .cm-ui-role-name': { display: "none" },
  '.cm-ui-stage[data-mode="content"] .cm-ui-role-body': { borderTop: "none", paddingTop: "0" },

  // Roles only: each role becomes a named slot; a group keeps its members.
  '.cm-ui-stage[data-mode="roles"] .cm-ui-role:not(.is-group) > .cm-ui-role-body': { display: "none" },
  '.cm-ui-stage[data-mode="roles"] .cm-ui-role.is-group > .cm-ui-role-body': {
    padding: "0",
    border: "none",
    backgroundColor: "transparent",
  },
  '.cm-ui-stage[data-mode="roles"] .cm-ui-role:not(.is-group) > .cm-ui-role-name': {
    padding: "3px 9px",
    border: `1px dashed color-mix(in srgb, ${ROLE_COLOR} 70%, transparent)`,
    borderRadius: "5px",
    fontSize: "11px",
    color: PALETTE.text,
  },
  '.cm-ui-stage[data-mode="roles"] .cm-ui-line > :not(.cm-ui-role):not(.cm-ui-spacer)': { opacity: "0.45" },

  ".cm-ui-source": {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    // Same inset as the drawing above, so the text lines up with it.
    padding: "8px 16px",
    border: "none",
    borderTop: "1px solid #21262d",
    backgroundColor: "#0d1117",
    color: PALETTE.text,
    fontFamily: "var(--font-code, monospace)",
    fontSize: "12px",
    lineHeight: "1.6",
    resize: "vertical",
    outline: "none",
    whiteSpace: "pre",
  },
  ".cm-ui-source[hidden]": { display: "none" },
});

export const uiSketchExtensions = [liveUiSketches, uiSketchTheme];
