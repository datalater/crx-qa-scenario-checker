/**
 * Live view for markdown: parts of the text render as editing UI while the
 * document stays plain markdown. Today that is GFM tables; other parts (links,
 * ...) can join `liveMarkdown()` without changing the view or stored data.
 *
 * Also provides the markdown slash commands (`/table`), which work in both
 * the source and live views.
 */
import { pickedCompletion } from "@codemirror/autocomplete";
import { isolateHistory } from "@codemirror/commands";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { highlightCode } from "@lezer/highlight";
import {
  EMPTY_TABLE,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseTable,
  planTableDeletion,
  planTableInsertion,
  serializeTable,
  tableSourceFromClipboard,
} from "./markdown-table.js";
import { renderChecklistAlertToken } from "../modules/checklist-alerts.js";
import { findAlertTokens } from "./markdown-alerts.js";
import { shiftHiddenColumns } from "./table-visibility.js";
import { diagramExtensions } from "./live-diagram.js";
import { focusTableCellFromEmptyArea, setupTableCellNavigation } from "./table-cell-navigation.js";
import { EMPTY_FLOWCHART, joinFence } from "./mermaid-flow.js";
import { PALETTE, darkHighlightStyle } from "./theme-palette.js";

// ---------- icons (currentColor) ----------

const svg = (body, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const dots = (points) =>
  points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`).join("");

const ICONS = {
  gripH: svg(dots([[4, 6], [8, 6], [12, 6], [4, 10], [8, 10], [12, 10]])),
  gripV: svg(dots([[6, 4], [10, 4], [6, 8], [10, 8], [6, 12], [10, 12]])),
  plusSmall: svg('<path d="M5 2.5v5M2.5 5h5"/>', 10),
  minusSmall: svg('<path d="M2.5 5h5"/>', 10),
  right: svg('<path d="M3.5 8h9M9 4.5l3.5 3.5L9 11.5"/>'),
  down: svg('<path d="M8 3.5v9M4.5 9 8 12.5 11.5 9"/>'),
  trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
};

// ---------- cell rendering ----------

/**
 * A cell that is not being edited shows its markdown highlighted with the
 * editor's own style, so `code` in a cell looks exactly like `code` in the
 * source lines around the table.
 */
function renderCellText(cell, text) {
  cell.replaceChildren();
  const tree = markdownLanguage.parser.parse(text);
  const appendHighlighted = (from, to) => highlightCode(
    text,
    tree,
    darkHighlightStyle,
    (chunk, classes) => {
      if (!classes) {
        cell.append(chunk);
        return;
      }
      const span = document.createElement("span");
      span.className = classes;
      span.textContent = chunk;
      cell.append(span);
    },
    () => cell.append("\n"),
    from, to
  );
  let offset = 0;
  for (const token of findAlertTokens(text, tree)) {
    appendHighlighted(offset, token.from);
    const template = document.createElement("template");
    template.innerHTML = renderChecklistAlertToken(token.config);
    cell.append(template.content);
    offset = token.to;
  }
  appendHighlighted(offset, text.length);
}

function setCellText(cell, text) {
  cell._text = text;
  if (document.activeElement === cell) cell.textContent = text;
  else renderCellText(cell, text);
}

// Inline alerts stay editable: reveal the original markdown whenever a
// selection touches a token. Table cells have their own blur/focus rendering.
class AlertTokenWidget extends WidgetType {
  constructor(config) { super(); this.config = config; }
  eq(other) { return this.config === other.config; }
  toDOM() {
    const template = document.createElement("template");
    template.innerHTML = renderChecklistAlertToken(this.config);
    return template.content.firstElementChild;
  }
  ignoreEvent() { return false; }
}

function buildAlertDecorations(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  if (!tree) return Decoration.none;
  const selections = state.selection.ranges;
  const ranges = findAlertTokens(state.doc.toString(), tree, { skipTables: true })
    .filter(({ from, to }) => !selections.some((selection) => selection.from <= to && selection.to >= from))
    .map(({ from, to, config }) => Decoration.replace({ widget: new AlertTokenWidget(config) }).range(from, to));
  return Decoration.set(ranges);
}

const liveAlertTokens = StateField.define({
  create: buildAlertDecorations,
  update(value, tr) {
    return tr.docChanged || tr.selection ? buildAlertDecorations(tr.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ---------- table widget ----------

const focusTableEffect = StateEffect.define();

function findTableAt(view, pos) {
  const tree = ensureSyntaxTree(view.state, view.state.doc.length, 1000);
  for (let node = tree?.resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "Table") {
      return { from: view.state.doc.lineAt(node.from).from, to: view.state.doc.lineAt(node.to).to };
    }
  }
  return null;
}

class TableWidget extends WidgetType {
  // `edges` marks a table on the first / last line of the document, where no
  // blank line gives the overflowing controls room (see .cm-lt-zone).
  constructor(source, autofocus, edges = "") {
    super();
    this.source = source;
    this.autofocus = autofocus;
    this.edges = edges;
  }

  eq(other) {
    return other.source === this.source && other.edges === this.edges;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = `cm-lt-wrap ${this.edges}`.trim();
    wrap.contentEditable = "false";
    buildTable(wrap, view, parseTable(this.source));
    if (this.autofocus) requestAnimationFrame(() => wrap.querySelector(".cm-lt-cell")?.focus());
    return wrap;
  }

  // Reuse the DOM while the shape is unchanged, so the cell being typed in
  // keeps its focus and caret.
  updateDOM(dom, view) {
    dom.className = `cm-lt-wrap ${this.edges}`.trim();
    const next = parseTable(this.source);
    const cells = dom.querySelectorAll(".cm-lt-cell");
    if (cells.length !== (next.rows.length + 1) * next.header.length) {
      if (!dom._pendingTableChange) dom._hiddenColumns = [];
      dom._cleanup?.();
      dom.replaceChildren();
      buildTable(dom, view, next);
      return true;
    }
    if (!dom._pendingTableChange && JSON.stringify(dom._model.header) !== JSON.stringify(next.header)) {
      dom._resetVisibility?.();
    }
    cells.forEach((cell) => {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      const text = r < 0 ? next.header[c] : next.rows[r][c];
      if (document.activeElement !== cell && cell._text !== text) setCellText(cell, text);
    });
    dom._model = next;
    return true;
  }

  destroy(dom) {
    dom._cleanup?.();
  }

  // Events inside the table belong to the cells and controls, not the editor.
  ignoreEvent() {
    return true;
  }
}

function buildTable(wrap, view, model) {
  wrap._model = model;
  let hidden = [...(wrap._hiddenColumns || [])];
  const cols = model.header.length;

  // Cell text goes into the model before the structure changes: an insert
  // shifts indexes, so the order matters.
  // Typing commits without `mutate`. A structural edit (`mutate`) is its own
  // undo step, and focus moves to the editor if it was elsewhere, so Cmd+Z
  // reaches the editor's history instead of the page.
  const commit = (mutate, columnEdit = null) => {
    let next = structuredClone(wrap._model);
    wrap.querySelectorAll(".cm-lt-cell").forEach((cell) => {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      if (r < 0) next.header[c] = cell._text;
      else next.rows[r][c] = cell._text;
    });
    if (mutate) next = mutate(next);
    if (columnEdit) hidden = shiftHiddenColumns(hidden, columnEdit.index, columnEdit.operation);
    wrap._hiddenColumns = hidden;
    const range = findTableAt(view, view.posAtDOM(wrap));
    if (!range) return;
    const insert = serializeTable(next);
    if (insert === view.state.sliceDoc(range.from, range.to)) return;
    // Undo restores the selection from before the change, so the caret goes
    // below the table first; otherwise undo would jump it to wherever the
    // editor's selection happened to be (often the top of the document).
    if (mutate) placeCaretBelow(view, range);
    wrap._pendingTableChange = true;
    try {
      view.dispatch({
        changes: { ...range, insert },
        userEvent: mutate ? "input.table" : "input",
        annotations: mutate ? isolateHistory.of("full") : [],
      });
    } finally {
      wrap._pendingTableChange = false;
    }
    // The rebuild drops focus from a cell; keep it in the editor so Cmd+Z
    // reaches the editor's history instead of the page.
    if (mutate && !view.dom.contains(document.activeElement)) view.focus();
  };

  // zone: hover area; the controls are its descendants, so moving onto them
  // keeps it hovered. grid: coordinate origin for the controls.
  const zone = document.createElement("div");
  zone.className = "cm-lt-zone";
  const grid = document.createElement("div");
  grid.className = "cm-lt-grid";
  zone.appendChild(grid);

  const table = document.createElement("table");
  const allCells = () => [...table.querySelectorAll(".cm-lt-cell")].filter((cell) => !hidden.includes(Number(cell.dataset.c)));
  const addRow = (cells, r, tag) => {
    const tr = document.createElement("tr");
    cells.forEach((text, c) => {
      const td = document.createElement(tag);
      td.dataset.r = r;
      td.dataset.c = c;
      const cell = document.createElement("div");
      cell.className = "cm-lt-cell";
      // plaintext-only: Enter inserts a line break inside the cell.
      cell.contentEditable = "plaintext-only";
      cell.spellcheck = false;
      cell.dataset.r = r;
      cell.dataset.c = c;
      setCellText(cell, text);
      cell.addEventListener("focus", () => {
        cell.textContent = cell._text;
      });
      cell.addEventListener("blur", () => renderCellText(cell, cell._text));
      cell.addEventListener("input", () => {
        cell._text = cell.innerText;
        commit();
      });
      setupTableCellNavigation(cell, allCells);
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          // Back to the editor; the next Escape leaves the editor. The caret
          // goes to the line below the table: a caret beside a block widget
          // is drawn as tall as the whole table.
          event.preventDefault();
          event.stopPropagation();
          cell.blur();
          focusBelowTable(view, wrap);
        }
      });
      td.addEventListener("mousedown", (event) => focusTableCellFromEmptyArea(event, td, cell));
      td.appendChild(cell);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  };
  addRow(model.header, -1, "th");
  model.rows.forEach((row, r) => addRow(row, r, "td"));
  grid.appendChild(table);

  // ---- floating controls ----
  const control = (className, icon, title) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cm-lt-ctl ${className}`;
    button.innerHTML = icon;
    button.title = title;
    button.setAttribute("aria-label", title);
    // Keep focus in the cell being edited.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    grid.appendChild(button);
    return button;
  };
  const colHandle = control("cm-lt-handle cm-lt-col-handle", ICONS.gripH, "열 메뉴");
  const rowHandle = control("cm-lt-handle cm-lt-row-handle", ICONS.gripV, "행 메뉴");
  // Shown while the table is hovered, at fixed spots that no handle uses:
  // `+` on the middle of the right and bottom edges, the trash just above the
  // top-left corner (the header row's handle sits right below the corner).
  // `-` beside each `+` removes the last column / row; it is left out when
  // there is nothing to remove (one column, or only the header row).
  const edgeButton = (className, icon, title, mutate) => {
    control(`cm-lt-edge-btn ${className}`, icon, title).addEventListener("click", () => commit(mutate));
  };
  control("cm-lt-edge-btn cm-lt-edge-right-add", ICONS.plusSmall, "맨 오른쪽에 열 추가")
    .addEventListener("click", () => commit((m) => insertColumn(m, cols), { operation: "insert", index: cols }));
  const removeColumnButton = cols > 1 ? control("cm-lt-edge-btn cm-lt-edge-right-remove", ICONS.minusSmall, "열 삭제") : null;
  removeColumnButton?.addEventListener("click", () => {
    const c = Array.from({ length: cols }, (_, i) => i).filter((i) => !hidden.includes(i)).at(-1);
    if (c != null) commit((m) => deleteColumn(m, c), { operation: "delete", index: c });
  });
  edgeButton("cm-lt-edge-bottom-add", ICONS.plusSmall, "맨 아래에 행 추가", (m) => insertRow(m, model.rows.length));
  if (model.rows.length > 0) {
    edgeButton("cm-lt-edge-bottom-remove", ICONS.minusSmall, "마지막 행 삭제", (m) => deleteRow(m, model.rows.length - 1));
  }
  const deleteButton = control("cm-lt-delete", ICONS.trash, "표 삭제");
  deleteButton.addEventListener("click", () => deleteTable(view, wrap));

  const box = (element) => {
    const g = grid.getBoundingClientRect();
    const b = element.getBoundingClientRect();
    return {
      left: b.left - g.left,
      top: b.top - g.top,
      right: b.right - g.left,
      bottom: b.bottom - g.top,
      width: b.width,
      height: b.height,
    };
  };
  const place = (element, x, y) => {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.classList.add("is-on");
  };
  const hide = (...elements) => elements.forEach((element) => element.classList.remove("is-on"));

  // While a menu is open the hover controls stay where they are.
  let menu = null;
  const highlight = (match) =>
    table.querySelectorAll("td, th").forEach((td) => {
      td.classList.toggle("cm-lt-target", match(Number(td.dataset.r), Number(td.dataset.c)));
    });
  const onOutside = (event) => {
    if (menu && !menu.contains(event.target)) closeMenu();
  };
  const closeMenu = () => {
    menu?.remove();
    menu = null;
    highlight(() => false);
    document.removeEventListener("mousedown", onOutside, true);
  };
  const openMenu = (anchor, items, match) => {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "cm-lt-menu";
    menu.setAttribute("role", "menu");
    items.forEach(([icon, label, run, danger]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.innerHTML = `${icon}<span>${label}</span>`;
      if (danger) item.classList.add("is-danger");
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", () => {
        closeMenu();
        run();
      });
      menu.appendChild(item);
    });
    const a = box(anchor);
    menu.style.left = `${a.left}px`;
    menu.style.top = `${a.bottom + 4}px`;
    grid.appendChild(menu);
    highlight(match);
    document.addEventListener("mousedown", onOutside, true);
  };
  wrap._cleanup = closeMenu;

  const visibilityButton = control("cm-lt-visibility", svg('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6 3v10M10 3v10"/>'), "열 표시");
  const emptyMessage = document.createElement("div");
  emptyMessage.className = "cm-lt-empty";
  emptyMessage.textContent = "열 표시가 모두 해제되었습니다.";
  grid.appendChild(emptyMessage);
  const applyVisibility = () => {
    table.querySelectorAll("td, th").forEach((td) => { td.hidden = hidden.includes(Number(td.dataset.c)); });
    const allHidden = hidden.length === cols;
    grid.classList.toggle("all-hidden", allHidden);
    table.hidden = allHidden;
    emptyMessage.hidden = !allHidden;
    visibilityButton.classList.toggle("has-hidden", hidden.length > 0);
    visibilityButton.title = hidden.length ? `열 표시 · ${hidden.length}개 숨김` : "열 표시";
    visibilityButton.setAttribute("aria-label", visibilityButton.title);
    if (removeColumnButton) {
      removeColumnButton.hidden = allHidden;
      const c = Array.from({ length: cols }, (_, i) => i).filter((i) => !hidden.includes(i)).at(-1);
      const label = wrap._model.header[c] || `${(c ?? 0) + 1}열`;
      removeColumnButton.title = `열 삭제: ${label}`;
      removeColumnButton.setAttribute("aria-label", removeColumnButton.title);
    }
  };
  wrap._resetVisibility = () => { hidden = []; wrap._hiddenColumns = hidden; applyVisibility(); };
  const saveVisibility = (nextHidden) => {
    hidden = nextHidden;
    wrap._hiddenColumns = hidden;
    applyVisibility();
    return true;
  };
  visibilityButton.addEventListener("click", () => {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "cm-lt-menu cm-lt-visibility-menu";
    const title = document.createElement("strong");
    title.textContent = "열 표시";
    menu.appendChild(title);
    wrap._model.header.forEach((name, c) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !hidden.includes(c);
      input.addEventListener("change", () => {
        const next = input.checked ? hidden.filter((i) => i !== c) : [...hidden, c];
        if (!saveVisibility(next)) input.checked = !input.checked;
        const button = menu?.querySelector("button");
        if (button) button.disabled = hidden.length === 0;
      });
      const text = document.createElement("span");
      text.textContent = name || `열 ${c + 1}`;
      label.append(input, text);
      menu.appendChild(label);
    });
    const showAll = document.createElement("button");
    showAll.type = "button";
    showAll.textContent = "모두 표시";
    showAll.disabled = hidden.length === 0;
    showAll.addEventListener("click", () => { if (saveVisibility([])) closeMenu(); });
    menu.appendChild(showAll);
    grid.appendChild(menu);
    document.addEventListener("mousedown", onOutside, true);
  });
  applyVisibility();

  let hoverCol = 0;
  let hoverRow = -1;
  colHandle.addEventListener("click", () => {
    const c = hoverCol;
    openMenu(
      colHandle,
      [
        [ICONS.right, "오른쪽에 열 삽입", () => commit((m) => insertColumn(m, c + 1), { operation: "insert", index: c + 1 })],
        ...(cols > 1 ? [[ICONS.trash, "열 삭제", () => commit((m) => deleteColumn(m, c), { operation: "delete", index: c }), true]] : []),
      ],
      (_r, cc) => cc === c
    );
  });
  rowHandle.addEventListener("click", () => {
    const r = hoverRow;
    openMenu(
      rowHandle,
      [
        [ICONS.down, "아래에 행 삽입", () => commit((m) => insertRow(m, r + 1))],
        // The header row cannot be deleted: a table needs one.
        ...(r >= 0 ? [[ICONS.trash, "행 삭제", () => commit((m) => deleteRow(m, r)), true]] : []),
      ],
      (rr) => rr === r
    );
  });
  zone.addEventListener("mousemove", (event) => {
    if (menu) return;
    const td = event.target.closest?.("td, th");
    if (!td || !table.contains(td)) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const tableBox = box(table);
    const headerBox = box(table.rows[0].cells[c]);
    const rowBox = box(td.parentElement);
    hoverCol = c;
    hoverRow = r;
    place(colHandle, headerBox.left + headerBox.width / 2, tableBox.top);
    place(rowHandle, tableBox.left, rowBox.top + rowBox.height / 2);
  });
  zone.addEventListener("mouseleave", () => {
    if (!menu) hide(colHandle, rowHandle);
  });

  wrap.appendChild(zone);
}

/**
 * Puts the caret on the line below the table and focuses the editor. A caret
 * right beside a block widget is drawn as tall as the whole table.
 */
function placeCaretBelow(view, range) {
  const { doc } = view.state;
  const anchor = range.to < doc.length ? doc.lineAt(range.to + 1).from : range.to;
  view.dispatch({ selection: { anchor } });
}

function focusBelowTable(view, wrap) {
  const range = findTableAt(view, view.posAtDOM(wrap));
  if (range) placeCaretBelow(view, range);
  view.focus();
}

/** Removes the whole table; undo brings it back. */
function deleteTable(view, wrap) {
  const range = findTableAt(view, view.posAtDOM(wrap));
  if (!range) return;
  const { doc } = view.state;
  const first = doc.lineAt(range.from);
  const last = doc.lineAt(range.to);
  const lineInfo = (line) => ({ from: line.from, to: line.to, blank: !line.text.trim() });
  const target = planTableDeletion(range.from, range.to, {
    docLength: doc.length,
    prev: first.number > 1 ? lineInfo(doc.line(first.number - 1)) : null,
    next: last.number < doc.lines ? lineInfo(doc.line(last.number + 1)) : null,
  });
  // As in commit(): put the caret by the table first, so undo brings it back
  // there along with the table.
  placeCaretBelow(view, range);
  view.dispatch({
    changes: { from: target.from, to: target.to, insert: "" },
    selection: { anchor: target.from },
    userEvent: "delete",
    annotations: isolateHistory.of("full"),
  });
  view.focus();
}

function buildTableDecorations(state, focusAt = null) {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  const ranges = [];
  tree?.iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      const edges = [from === 0 ? "is-doc-start" : "", to === state.doc.length ? "is-doc-end" : ""].join(" ").trim();
      const widget = new TableWidget(state.sliceDoc(from, to), from === focusAt, edges);
      ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
      return false;
    },
  });
  return Decoration.set(ranges);
}

// Block decorations must come from a state field, not a view plugin.
const liveTables = StateField.define({
  create: (state) => buildTableDecorations(state),
  update(decorations, tr) {
    const focus = tr.effects.find((effect) => effect.is(focusTableEffect));
    if (tr.docChanged || focus) return buildTableDecorations(tr.state, focus ? focus.value : null);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ---------- theme ----------

const liveTheme = EditorView.theme({
  ".cm-lt-wrap": {
    padding: "0",
    fontFamily: "inherit",
  },
  ".cm-lt-zone": {
    display: "inline-block",
    // No vertical padding: the blank lines markdown keeps around a table are
    // the spacing. Controls overflow into them and still count as hovering
    // the zone, because they are its descendants and touch the table edge.
    // The left padding keeps the trash button and row handles (centred on
    // the table's left edge) clear of the line-number gutter.
    padding: "0 12px 0 16px",
  },
  ".cm-lt-wrap.is-doc-start .cm-lt-zone": { paddingTop: "18px" },
  ".cm-lt-wrap.is-doc-end .cm-lt-zone": { paddingBottom: "10px" },
  ".cm-lt-grid": { position: "relative" },
  ".cm-lt-grid [hidden], .cm-lt-grid.all-hidden .cm-lt-edge-btn, .cm-lt-grid.all-hidden .cm-lt-handle": { display: "none !important" },
  ".cm-lt-empty": { padding: "20px 28px", border: "1px solid #30363d", color: PALETTE.muted },
  ".cm-lt-ctl.cm-lt-visibility": {
    right: "0", top: "-20px", width: "20px", height: "18px", color: PALETTE.muted,
    backgroundColor: "#161b22", borderRadius: "4px", boxShadow: "0 0 0 1px #30363d",
  },
  ".cm-lt-zone:hover .cm-lt-visibility, .cm-lt-zone:focus-within .cm-lt-visibility, .cm-lt-visibility:focus, .cm-lt-visibility.has-hidden": { display: "flex" },
  ".cm-lt-visibility.has-hidden::after": {
    content: '""', position: "absolute", right: "-2px", top: "-2px", width: "6px", height: "6px",
    borderRadius: "50%", backgroundColor: "#2f81f7",
  },
  ".cm-lt-visibility-menu": { right: "0", top: "0", minWidth: "150px", zIndex: "5" },
  ".cm-lt-visibility-menu strong": { padding: "5px", fontWeight: "600" },
  ".cm-lt-visibility-menu label": { display: "flex", alignItems: "center", gap: "6px", padding: "4px 5px", cursor: "pointer" },
  ".cm-lt-visibility-menu input": { margin: "0" },
  ".cm-lt-visibility-menu button:disabled": { opacity: "0.5" },
  // With line wrapping the table fits the editor width: the grid shrinks to
  // the table but never past the editor, and long cells wrap.
  // `&` is the editor root, which carries `cm-wrapping`.
  "&.cm-wrapping .cm-lt-zone": { display: "block" },
  "&.cm-wrapping .cm-lt-grid": { width: "fit-content", maxWidth: "100%" },
  // The host page styles every table (sticky headers, row hover, padding).
  // These rules reset all of it; the extra `table tr` keeps them more
  // specific than the page's own cell rules.
  ".cm-lt-grid table": {
    borderCollapse: "collapse",
    minWidth: "0",
    width: "auto",
    fontSize: "inherit",
  },
  ".cm-lt-grid table tr, .cm-lt-grid table tr:hover": {
    background: "none",
    cursor: "default",
  },
  ".cm-lt-grid table tr th, .cm-lt-grid table tr td": {
    position: "static",
    zIndex: "auto",
    boxShadow: "none",
    border: "1px solid #30363d",
    padding: "0",
    verticalAlign: "top",
    textAlign: "left",
    minWidth: "72px",
    maxWidth: "36em",
    color: PALETTE.text,
    background: "none",
    fontSize: "inherit",
    fontWeight: "normal",
    lineHeight: "inherit",
    letterSpacing: "normal",
    textTransform: "none",
  },
  "&.cm-wrapping .cm-lt-grid table tr th, &.cm-wrapping .cm-lt-grid table tr td": { maxWidth: "none" },
  ".cm-lt-grid table tr th": { backgroundColor: "#161b22", fontWeight: "600" },
  ".cm-lt-grid table tr td.cm-lt-target, .cm-lt-grid table tr th.cm-lt-target": { backgroundColor: "#2f81f71f" },
  ".cm-lt-cell": {
    padding: "3px 8px",
    minHeight: "1.6em",
    whiteSpace: "pre-wrap",
    // Korean breaks between words, not inside them; an over-long word still
    // breaks rather than overflowing the cell.
    wordBreak: "keep-all",
    overflowWrap: "break-word",
    outline: "none",
    color: PALETTE.text,
    caretColor: PALETTE.text,
    cursor: "text",
  },
  ".cm-lt-grid table tr td:focus-within, .cm-lt-grid table tr th:focus-within": {
    boxShadow: "inset 0 0 0 1px #2f81f7",
  },

  ".cm-lt-ctl": {
    position: "absolute",
    display: "none",
    zIndex: "2",
    padding: "0",
    border: "none",
    alignItems: "center",
    justifyContent: "center",
    color: PALETTE.muted,
    background: "none",
    cursor: "pointer",
  },
  ".cm-lt-ctl.is-on": { display: "flex" },
  ".cm-lt-ctl svg": { display: "block" },
  ".cm-lt-handle": {
    transform: "translate(-50%, -50%)",
    backgroundColor: "#161b22",
    borderRadius: "4px",
    boxShadow: "0 0 0 1px #30363d",
  },
  ".cm-lt-handle:hover": { backgroundColor: "#21262d", color: PALETTE.text },
  ".cm-lt-col-handle": { width: "20px", height: "12px" },
  ".cm-lt-row-handle": { width: "12px", height: "20px" },
  ".cm-lt-zone:hover .cm-lt-edge-btn, .cm-lt-zone:hover .cm-lt-delete": { display: "flex" },
  ".cm-lt-edge-btn": {
    transform: "translate(-50%, -50%)",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#0d1117",
    color: "#2f81f7",
    boxShadow: "0 0 0 1px #2f81f7",
  },
  ".cm-lt-edge-btn:hover": { backgroundColor: "#2f81f7", color: "#ffffff" },
  // `+` and `-` sit side by side around the middle of each edge.
  ".cm-lt-edge-right-add": { left: "100%", top: "calc(50% - 9px)" },
  ".cm-lt-edge-right-remove": { left: "100%", top: "calc(50% + 9px)" },
  ".cm-lt-edge-bottom-add": { left: "calc(50% - 9px)", top: "100%" },
  ".cm-lt-edge-bottom-remove": { left: "calc(50% + 9px)", top: "100%" },
  ".cm-lt-edge-right-remove:hover, .cm-lt-edge-bottom-remove:hover": {
    backgroundColor: "#f85149",
    boxShadow: "0 0 0 1px #f85149",
  },
  ".cm-lt-delete": {
    left: "0",
    top: "-8px",
    width: "16px",
    height: "16px",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#161b22",
    borderRadius: "4px",
    boxShadow: "0 0 0 1px #30363d",
  },
  ".cm-lt-delete svg": { width: "12px", height: "12px" },
  ".cm-lt-delete:hover": { backgroundColor: "#f851491a", color: "#f85149", boxShadow: "0 0 0 1px #f85149" },

  ".cm-lt-menu": {
    position: "absolute",
    zIndex: "3",
    display: "flex",
    flexDirection: "column",
    minWidth: "150px",
    padding: "4px",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
    boxShadow: "0 8px 24px rgba(1, 4, 9, 0.6)",
  },
  ".cm-lt-menu button": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 8px",
    border: "none",
    borderRadius: "4px",
    background: "none",
    color: PALETTE.text,
    font: "inherit",
    fontSize: "12px",
    textAlign: "left",
    cursor: "pointer",
  },
  ".cm-lt-menu button svg": { color: PALETTE.muted, flex: "none" },
  ".cm-lt-menu button:hover": { backgroundColor: "#21262d" },
  ".cm-lt-menu button.is-danger, .cm-lt-menu button.is-danger svg": { color: "#f85149" },
});

// ---------- pasting tables ----------

/**
 * A table copied from Notion, a spreadsheet or a web page (tab-separated text
 * or an HTML table) becomes a markdown table, which the live view then renders
 * as a table widget. Anything else, and code, pastes as usual.
 */
const pasteTables = EditorView.domEventHandlers({
  paste(event, view) {
    const { state } = view;
    const data = event.clipboardData;
    if (!data || state.selection.ranges.length !== 1) return false;
    const { from, to } = state.selection.main;
    if (insideNoCommandNode(state, from)) return false;
    const table = tableSourceFromClipboard({
      html: data.getData("text/html"),
      text: data.getData("text/plain"),
    });
    if (!table) return false;

    const { doc } = state;
    const first = doc.lineAt(from);
    const last = doc.lineAt(to);
    const isBlank = (n) => !doc.line(n).text.trim();
    const plan = planTableInsertion(
      {
        text: doc.sliceString(first.from, last.to),
        from: first.from,
        to: last.to,
        hasPrev: first.number > 1,
        prevBlank: first.number > 1 && isBlank(first.number - 1),
        hasNext: last.number < doc.lines,
        nextBlank: last.number < doc.lines && isBlank(last.number + 1),
      },
      from,
      to,
      table
    );
    const tableTo = plan.tableFrom + table.length;
    const length = doc.length + plan.changes.reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
    event.preventDefault();
    view.dispatch({
      changes: plan.changes,
      // Beside a block widget the caret would be drawn as tall as the table.
      selection: { anchor: tableTo < length ? tableTo + 1 : tableTo },
      scrollIntoView: true,
      userEvent: "input.paste",
    });
    return true;
  },
});

/** Everything the live view adds. Only mounted for markdown in live view. */
export function liveMarkdown() {
  return [liveTables, liveAlertTokens, liveTheme, pasteTables, diagramExtensions];
}

// ---------- slash commands ----------

// Code, raw HTML and existing tables take `/` literally.
const NO_COMMAND_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode", "HTMLBlock", "Table", "URL"]);

function insideNoCommandNode(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (NO_COMMAND_NODES.has(node.name)) return true;
  }
  return false;
}

/** Replaces the command text with a block (a table, a fenced diagram, ...). */
function applyBlockCommand(view, completion, from, to, block, focusTable) {
  const { doc } = view.state;
  const line = doc.lineAt(from);
  const isBlank = (n) => !doc.line(n).text.trim();
  const plan = planTableInsertion(
    {
      text: line.text,
      from: line.from,
      to: line.to,
      hasPrev: line.number > 1,
      prevBlank: line.number > 1 && isBlank(line.number - 1),
      hasNext: line.number < doc.lines,
      nextBlank: line.number < doc.lines && isBlank(line.number + 1),
    },
    from,
    to,
    block
  );
  view.dispatch({
    changes: plan.changes,
    // In the source view the caret lands in the block's first line; in the
    // live view a new table's first cell takes focus.
    selection: { anchor: plan.tableFrom + (focusTable ? 2 : 0) },
    effects: focusTable ? focusTableEffect.of(plan.tableFrom) : [],
    annotations: pickedCompletion.of(completion),
    userEvent: "input.complete",
  });
}

const applyTableCommand = (view, completion, from, to) =>
  applyBlockCommand(view, completion, from, to, EMPTY_TABLE, true);

const applyDiagramCommand = (view, completion, from, to) =>
  applyBlockCommand(view, completion, from, to, joinFence(EMPTY_FLOWCHART), false);

const SLASH_COMMANDS = [
  { label: "/table", detail: "표 삽입", apply: applyTableCommand },
  { label: "/diagram", detail: "다이어그램 삽입 (mermaid)", apply: applyDiagramCommand },
];

/**
 * Opens on `/` at the start of a line or after whitespace, so `a/b` and
 * `작성/수정` stay plain text.
 */
function slashCommandSource(context) {
  const match = context.matchBefore(/\/[\w-]*$/);
  if (!match) return null;
  const before = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : "";
  if (before && !/\s/.test(before)) return null;
  if (insideNoCommandNode(context.state, match.from)) return null;
  return { from: match.from, options: SLASH_COMMANDS, validFor: /^\/[\w-]*$/ };
}

export const markdownSlashCommands = markdownLanguage.data.of({ autocomplete: slashCommandSource });
