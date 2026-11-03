/**
 * Live view for ```mermaid fences: the block renders as a diagram that can be
 * edited like a GUI (rename, add, connect, delete) while the document keeps
 * the plain mermaid source. Layout is pele's, so spacing is automatic.
 *
 * Only flowcharts the model can hold losslessly get the editing tools (see
 * mermaid-flow.js); anything else renders read-only and is edited as source,
 * through the `</>` toggle or the source view.
 */
import { isolateHistory } from "@codemirror/commands";
import { StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { parse, register, render } from "pele/core";
import flowchart from "pele/diagrams/flowchart";
import { exportSvg } from "./diagram-export.js";
import { ZOOM_STEP, clampScale, fitScale, scaleAfterWheel, scrollAfterZoom } from "./diagram-zoom.js";
import { planTableDeletion } from "./markdown-table.js";
import {
  DIRECTIONS,
  DIRECTION_ARROWS,
  EDGE_STYLES,
  EDGE_STYLE_LABELS,
  SHAPES,
  SHAPE_LABELS,
  addEdge,
  addNode,
  analyzeFlowchart,
  deleteEdge,
  deleteNode,
  joinFence,
  serializeFlowchart,
  setDirection,
  splitFence,
  updateEdge,
  updateNode,
} from "./mermaid-flow.js";
import { PALETTE } from "./theme-palette.js";

register(flowchart);

/** Base font size of the drawn diagram (pele's default is 16). */
const FONT_SIZE = 13;

/** The stage scrolls past this height, so a tall diagram does not push the table down. */
const STAGE_MAX_HEIGHT = 560;
const STAGE_PADDING = { x: 32, y: 60 };

/** Shortcut help: [section, [[keys, what it does]]]. Keep in step with the key handlers below. */
const HELP_SECTIONS = [
  ["노드", [
    [["←", "↑", "↓", "→"], "가까운 노드로 이동"],
    [["Enter"], "이름 편집 (더블클릭도 가능)"],
    [["Tab"], "이어지는 하위 노드 추가"],
    [["Shift", "Tab"], "같은 부모에서 갈라지는 형제 노드 추가"],
    [["Delete"], "삭제 후 이전 노드 선택"],
    [["Esc"], "선택 해제"],
  ]],
  ["이름 입력 중", [
    [["Enter"], "확정"],
    [["Tab"], "확정하고 하위 노드 추가"],
    [["Shift", "Tab"], "확정하고 형제 노드 추가"],
    [["Esc"], "취소"],
  ]],
  ["마우스", [
    [["동그라미 끌기"], "다른 노드에 놓으면 연결, 빈 곳이면 새 노드"],
    [["간선 더블클릭"], "간선 설명 편집"],
    [["빈 곳 끌기"], "화면 이동 (확대했을 때)"],
  ]],
  ["보기", [
    [["+"], "확대"],
    [["-"], "축소"],
    [["0"], "100%"],
    [["Ctrl/⌘", "휠"], "포인터 위치 기준 확대/축소"],
  ]],
];

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

// ---------- finding fences ----------

/**
 * Every plain (unindented) ```mermaid fence as `{ from, to }` (whole lines).
 * Other fences are skipped over, so a ```mermaid line inside another code
 * block stays text.
 */
export function findMermaidFences(doc) {
  const fences = [];
  let open = null;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!open) {
      const match = /^```(.*)$/.exec(line.text);
      if (match) open = { from: line.from, info: match[1].trim() };
    } else if (/^```\s*$/.test(line.text)) {
      if (open.info === "mermaid") fences.push({ from: open.from, to: line.to });
      open = null;
    }
  }
  // An unclosed fence runs to the end of the document.
  if (open?.info === "mermaid") fences.push({ from: open.from, to: doc.length });
  return fences;
}

// ---------- widget ----------

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const button = (label, title, onClick, className = "") => {
  const b = el("button", `cm-ld-btn ${className}`.trim(), label);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return b;
};

const select = (options, value, onChange, title) => {
  const s = el("select", "cm-ld-select");
  s.title = title;
  options.forEach(([val, label]) => {
    const o = el("option", "", label);
    o.value = val;
    s.appendChild(o);
  });
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
};

class DiagramController {
  constructor(view, wrap, block) {
    this.view = view;
    this.wrap = wrap;
    this.block = block;
    this.selected = null; // { kind: "node", id } | { kind: "edge", index }
    this.sourceOpen = false;
    this.scale = 1; // 100%: the drawing keeps its size and the stage scrolls
    this.natural = null;
    this.analysis = null;
    this.build();
    this.refresh();
  }

  build() {
    const { wrap } = this;
    this.bar = el("div", "cm-ld-bar");
    this.stage = el("div", "cm-ld-stage");
    this.stage.tabIndex = 0;
    this.layer = el("div", "cm-ld-layer"); // floating tools, inside the stage
    this.message = el("div", "cm-ld-message");
    this.source = el("textarea", "cm-ld-source");
    this.source.spellcheck = false;
    this.source.addEventListener("input", () => this.commitSource(this.source.value));
    wrap.append(this.bar, this.stage, this.message, this.source);

    this.stage.addEventListener("click", (event) => this.onClick(event));
    this.stage.addEventListener("dblclick", (event) => this.onDoubleClick(event));
    this.stage.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.stage.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.stage.addEventListener("pointerdown", (event) => this.onPanStart(event));
  }

  /** Lives in the bar (rebuilt with it), so it never covers the drawing. */
  buildZoomControls() {
    const zoom = el("div", "cm-ld-zoom");
    this.zoomLabel = button(`${Math.round(this.scale * 100)}%`, "100%로 (0)", () => this.zoomTo(1), "cm-ld-zoom-label");
    zoom.append(
      button("−", "축소 (-, Ctrl/⌘+휠)", () => this.zoomBy(1 / ZOOM_STEP)),
      this.zoomLabel,
      button("+", "확대 (+, Ctrl/⌘+휠)", () => this.zoomBy(ZOOM_STEP)),
      button("맞춤", "전체가 보이게 맞춤", () => this.zoomFit())
    );
    return zoom;
  }

  get inner() {
    return splitFence(this.block)?.inner ?? "";
  }

  update(block) {
    this.block = block;
    this.refresh();
  }

  // ----- rendering -----

  refresh() {
    this.closeEditor();
    this.analysis = analyzeFlowchart(this.inner, parse);
    const { analysis } = this;

    let svg = "";
    let error = analysis.error;
    if (!error) {
      try {
        svg = render(this.inner, { fontSize: FONT_SIZE }).svg;
      } catch (e) {
        error = e.message || String(e);
      }
    }
    this.stage.replaceChildren();
    this.stage.insertAdjacentHTML("afterbegin", svg);
    this.stage.appendChild(this.layer);
    this.layer.replaceChildren();
    this.applyZoom();
    this.stage.querySelectorAll(".pele-edge").forEach((edge) => {
      // The drawn line is thin; a wide invisible copy makes it clickable.
      edge.querySelectorAll("path:not(.pele-marker)").forEach((path) => {
        const hit = path.cloneNode();
        hit.removeAttribute("stroke-dasharray");
        hit.setAttribute("class", "cm-ld-hit");
        edge.appendChild(hit);
      });
    });

    const readOnly = !analysis.editable;
    this.message.textContent = error
      ? `다이어그램 오류: ${error}`
      : readOnly
        ? `GUI 편집을 지원하지 않는 다이어그램입니다 (${analysis.reason}). </> 로 소스를 편집하세요.`
        : "";
    this.message.hidden = !this.message.textContent;
    this.message.classList.toggle("is-error", Boolean(error));

    if (error) this.sourceOpen = true;
    this.source.hidden = !this.sourceOpen;
    if (document.activeElement !== this.source) this.source.value = this.inner;
    this.source.rows = Math.min(16, this.inner.split("\n").length + 1);

    this.renderBar();
    this.applySelection();
  }

  renderBar() {
    const { analysis } = this;
    this.bar.replaceChildren();
    if (analysis.editable) {
      this.bar.append(
        select(DIRECTIONS.map((d) => [d, `방향 ${DIRECTION_ARROWS[d]}`]), analysis.model.direction, (value) =>
          this.commitModel(setDirection(analysis.model, value))
        , "배치 방향"),
        button("+ 노드", "새 노드 추가", () => {
          const { model, id } = addNode(analysis.model);
          this.commitModel(model, { kind: "node", id }, true);
        })
      );
    }
    const spacer = el("span", "cm-ld-spacer");
    const help = button("?", "단축키 도움말", () => this.toggleHelp(help), "cm-ld-help");
    const more = button("⋯", "더보기 (복사)", () => this.toggleMenu(more));
    more.classList.add("cm-ld-more");
    const toggle = button("</>", "mermaid 소스 보기/편집", () => {
      this.sourceOpen = !this.sourceOpen;
      this.source.hidden = !this.sourceOpen;
      toggle.classList.toggle("is-on", this.sourceOpen);
      if (this.sourceOpen) this.source.focus();
    }, this.sourceOpen ? "is-on" : "");
    const del = button("삭제", "다이어그램 삭제", () => this.deleteDiagram(), "is-danger");
    this.bar.append(spacer, this.buildZoomControls(), help, toggle, more, del);
  }

  // ----- zoom and pan -----

  svgEl() {
    return this.stage.querySelector("svg.pele");
  }

  /** Sizes the drawing from its natural size; the stage then scrolls instead of shrinking it. */
  applyZoom() {
    const svg = this.svgEl();
    if (!svg) return;
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    if (!width || !height) return;
    this.natural = { width, height };
    svg.style.maxWidth = "none";
    svg.style.width = `${width * this.scale}px`;
    svg.style.height = `${height * this.scale}px`;
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    this.stage.classList.toggle("is-zoomed", this.scale !== 1);
  }

  /** Changes the scale; the point at `anchor` (visible-area px, default centre) stays put. */
  zoomTo(scale, anchor = null) {
    const next = clampScale(scale);
    if (!this.svgEl() || next === this.scale) return;
    const point = anchor || { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 };
    const scroll = scrollAfterZoom(this.stage, point, this.scale, next);
    this.scale = next;
    this.applyZoom();
    this.stage.scrollLeft = scroll.scrollLeft;
    this.stage.scrollTop = scroll.scrollTop;
    this.applySelection(); // tools and handles are positioned from the drawing
  }

  zoomBy(factor, anchor = null) {
    this.zoomTo(this.scale * factor, anchor);
  }

  zoomFit() {
    if (!this.natural) return;
    const box = {
      width: this.stage.clientWidth - STAGE_PADDING.x,
      height: STAGE_MAX_HEIGHT - STAGE_PADDING.y,
    };
    this.zoomTo(fitScale(this.natural, box));
    this.stage.scrollLeft = 0;
    this.stage.scrollTop = 0;
  }

  /** Ctrl/⌘ + wheel (also a trackpad pinch) zooms at the pointer; a plain wheel scrolls. */
  onWheel(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const box = this.stage.getBoundingClientRect();
    this.zoomTo(scaleAfterWheel(this.scale, event.deltaY), {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
  }

  /** Dragging empty background pans the stage when the drawing is bigger than it. */
  onPanStart(event) {
    if (event.button !== 0 || event.target.closest(".pele-node, .pele-edge, .pele-edge-label, .cm-ld-tools, .cm-ld-handle, .cm-ld-editor")) return;
    const { stage } = this;
    if (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
    const start = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
    let moved = false;
    const onMove = (e) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) {
        moved = true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add("is-panning");
      }
      stage.scrollLeft = start.left - dx;
      stage.scrollTop = start.top - dy;
    };
    const onUp = () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.classList.remove("is-panning");
      // The click that ends a drag must not deselect.
      if (moved) this.justPanned = true;
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
  }

  // ----- more menu: copy source / svg -----

  closeMenu() {
    this.menu?.remove();
    this.menu = null;
    this.menuAnchor = null;
    document.removeEventListener("mousedown", this.onOutside, true);
    document.removeEventListener("keydown", this.onMenuKey, true);
  }

  /** Shows `menu` under `anchor`, right-aligned with it; Esc or an outside click closes it. */
  openPopover(anchor, menu) {
    this.closeMenu();
    this.wrap.appendChild(menu);
    const wrapBox = this.wrap.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    menu.style.top = `${box.bottom - wrapBox.top + 4}px`;
    menu.style.right = `${Math.max(4, wrapBox.right - box.right)}px`;
    this.menu = menu;
    this.menuAnchor = anchor;
    this.onOutside = (event) => {
      if (!menu.contains(event.target) && !anchor.contains(event.target)) this.closeMenu();
    };
    this.onMenuKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      this.closeMenu();
    };
    document.addEventListener("mousedown", this.onOutside, true);
    document.addEventListener("keydown", this.onMenuKey, true);
  }

  toggleMenu(anchor) {
    if (this.menu && this.menuAnchor === anchor) return this.closeMenu();
    const items = [
      ["소스 복사", () => this.copy(this.source.value, anchor)],
      ["소스 복사 (``` 포함)", () => this.copy(joinFence(this.source.value, "mermaid"), anchor)],
    ];
    if (!this.analysis.error) {
      items.push(
        ["SVG 복사 (다크)", () => this.copy(this.svgFor("dark"), anchor)],
        ["SVG 복사 (라이트)", () => this.copy(this.svgFor("light"), anchor)]
      );
    }
    const menu = el("div", "cm-ld-menu");
    menu.setAttribute("role", "menu");
    items.forEach(([label, run]) => {
      const item = el("button", "", label);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", () => {
        this.closeMenu();
        run();
      });
      menu.appendChild(item);
    });
    this.openPopover(anchor, menu);
  }

  toggleHelp(anchor) {
    if (this.menu && this.menuAnchor === anchor) return this.closeMenu();
    const panel = el("div", "cm-ld-menu cm-ld-help-panel");
    HELP_SECTIONS.forEach(([title, rows]) => {
      panel.appendChild(el("div", "cm-ld-help-title", title));
      rows.forEach(([keys, description]) => {
        const row = el("div", "cm-ld-help-row");
        const cell = el("span", "cm-ld-help-keys");
        keys.forEach((key) => cell.appendChild(el("kbd", "", key)));
        row.append(cell, el("span", "", description));
        panel.appendChild(row);
      });
    });
    this.openPopover(anchor, panel);
  }

  /** A fresh, selection-free render, so the copy has no editing overlays in it. */
  svgFor(theme) {
    return exportSvg(render(this.inner, { fontSize: FONT_SIZE }).svg, theme);
  }

  async copy(text, anchor) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No async clipboard (permissions, focus): select-and-copy in a scratch field.
      const scratch = el("textarea");
      scratch.value = text;
      this.wrap.appendChild(scratch);
      scratch.select();
      document.execCommand("copy");
      scratch.remove();
    }
    anchor.textContent = "복사됨";
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => (anchor.textContent = "⋯"), 1200);
  }

  // ----- selection -----

  nodeEl(id) {
    return [...this.stage.querySelectorAll(".pele-node")].find((n) => n.dataset.id === id) || null;
  }

  edgeIndexOf(el) {
    const id = el.closest("[data-id]")?.dataset.id;
    return this.analysis.model ? this.analysis.model.edges.findIndex((edge) => edge.id === id) : -1;
  }

  select(selected) {
    this.selected = selected;
    this.closeEditor();
    this.applySelection();
  }

  applySelection() {
    this.stage.querySelectorAll(".cm-ld-sel").forEach((n) => n.classList.remove("cm-ld-sel"));
    this.layer.replaceChildren();
    const { selected, analysis } = this;
    if (!selected || !analysis.editable) return;
    if (selected.kind === "node") {
      const node = this.nodeEl(selected.id);
      if (!node) {
        this.selected = null;
        return;
      }
      node.classList.add("cm-ld-sel");
      this.showNodeTools(node, selected.id);
    } else {
      const edge = analysis.model.edges[selected.index];
      const g = edge && [...this.stage.querySelectorAll(".pele-edge")].find((n) => n.dataset.id === edge.id);
      if (!g) {
        this.selected = null;
        return;
      }
      g.classList.add("cm-ld-sel");
      this.showEdgeTools(g, selected.index);
    }
  }

  /** Box of `target` in the stage's own (scrolling) coordinates. */
  box(target) {
    const r = target.getBoundingClientRect();
    const s = this.stage.getBoundingClientRect();
    return {
      left: r.left - s.left + this.stage.scrollLeft,
      top: r.top - s.top + this.stage.scrollTop,
      width: r.width,
      height: r.height,
    };
  }

  showNodeTools(nodeEl, id) {
    const { model } = this.analysis;
    const node = model.nodes.find((n) => n.id === id);
    const b = this.box(nodeEl);
    const tools = el("div", "cm-ld-tools");
    tools.append(
      button("이름", "이름 변경 (Enter, 더블클릭)", () => this.editNodeLabel(id)),
      button("+ 하위", "이 노드에서 이어지는 새 노드 (Tab, 형제는 Shift+Tab)", () => this.addChild(id)),
      select(Object.keys(SHAPES).map((s) => [s, SHAPE_LABELS[s]]), node.shape, (shape) =>
        this.commitModel(updateNode(model, id, { shape }), this.selected)
      , "모양"),
      button("삭제", "노드와 연결된 간선 삭제 (Delete)", () => this.removeNode(id), "is-danger")
    );
    this.place(tools, b.left, b.top - 34);

    const handle = el("div", "cm-ld-handle");
    handle.title = "드래그해서 다른 노드에 연결 (빈 곳에 놓으면 새 노드)";
    handle.style.left = `${b.left + b.width}px`;
    handle.style.top = `${b.top + b.height / 2}px`;
    handle.addEventListener("pointerdown", (event) => this.startConnect(event, id, nodeEl));
    this.layer.appendChild(handle);
  }

  showEdgeTools(edgeEl, index) {
    const { model } = this.analysis;
    const edge = model.edges[index];
    const b = this.box(edgeEl.querySelector("path"));
    const tools = el("div", "cm-ld-tools");
    tools.append(
      button("설명", "간선 설명 편집 (더블클릭)", () => this.editEdgeLabel(index)),
      select(EDGE_STYLES.map((s) => [s, EDGE_STYLE_LABELS[s]]), edge.style, (style) =>
        this.commitModel(updateEdge(model, index, { style }), this.selected)
      , "선 모양"),
      button("삭제", "간선 삭제 (Delete)", () => this.removeEdge(index), "is-danger")
    );
    this.place(tools, b.left + b.width / 2 - 70, b.top + b.height / 2 - 40);
  }

  /** Positions floating tools, kept inside the stage's width. */
  place(node, left, top) {
    this.layer.appendChild(node);
    const right = this.stage.scrollLeft + this.stage.clientWidth - node.offsetWidth - 4;
    node.style.left = `${Math.max(4, Math.min(left, right))}px`;
    node.style.top = `${Math.max(2, top)}px`;
  }

  // ----- events -----

  onClick(event) {
    if (this.justPanned) {
      this.justPanned = false;
      return;
    }
    if (!this.analysis.editable || event.target.closest(".cm-ld-tools, .cm-ld-handle, .cm-ld-editor")) return;
    const node = event.target.closest(".pele-node");
    if (node) return this.select({ kind: "node", id: node.dataset.id });
    const edge = event.target.closest(".pele-edge, .pele-edge-label");
    if (edge) {
      const index = this.edgeIndexOf(edge);
      if (index >= 0) return this.select({ kind: "edge", index });
    }
    this.select(null);
  }

  onDoubleClick(event) {
    if (!this.analysis.editable || event.target.closest(".cm-ld-tools, .cm-ld-editor")) return;
    const node = event.target.closest(".pele-node");
    if (node) return this.editNodeLabel(node.dataset.id);
    const edge = event.target.closest(".pele-edge, .pele-edge-label");
    const index = edge ? this.edgeIndexOf(edge) : -1;
    if (index >= 0) this.editEdgeLabel(index);
  }

  onKeyDown(event) {
    // Korean (and other) IMEs re-send the key that ends a composition; the
    // composing copy is for the IME, and a handled one would run twice.
    if (event.isComposing) return;
    // Safety net for an IME copy of Tab/Enter that lands on the stage just after
    // the label editor closed on the same key.
    if (performance.now() - (this.editorClosedAt ?? -1e9) < 150) return;
    if (event.target !== this.stage) return;
    if (!(event.metaKey || event.ctrlKey || event.altKey)) {
      if (event.key === "+" || event.key === "=") return this.zoomBy(ZOOM_STEP);
      if (event.key === "-" || event.key === "_") return this.zoomBy(1 / ZOOM_STEP);
      if (event.key === "0") return this.zoomTo(1);
    }
    if (!this.analysis.editable) return;
    if (ARROW_KEYS.has(event.key) && !(event.metaKey || event.ctrlKey || event.altKey)) {
      event.preventDefault();
      this.moveSelection(event.key);
      return;
    }
    if (!this.selected) return;
    const { model } = this.analysis;
    if (event.key === "Escape") {
      this.select(null);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (this.selected.kind === "node") this.removeNode(this.selected.id);
      else this.removeEdge(this.selected.index);
    } else if (event.key === "Tab" && this.selected.kind === "node") {
      // Like mind-map tools: Tab adds the next connected node and starts naming it;
      // Shift+Tab adds one beside it, from the same parent.
      event.preventDefault();
      if (event.shiftKey) this.addSibling(this.selected.id);
      else this.addChild(this.selected.id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (this.selected.kind === "node") this.editNodeLabel(this.selected.id);
      else this.editEdgeLabel(this.selected.index);
    }
  }

  /**
   * Arrow keys select the nearest node in that direction on screen, so it
   * works for any layout. With nothing (or an edge) selected, the first node.
   */
  moveSelection(key) {
    const nodes = [...this.stage.querySelectorAll(".pele-node")];
    if (!nodes.length) return;
    const current = this.selected?.kind === "node" ? this.nodeEl(this.selected.id) : null;
    if (!current) {
      this.select({ kind: "node", id: nodes[0].dataset.id });
      return;
    }
    const center = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const from = center(current);
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    let best = null;
    for (const node of nodes) {
      if (node === current) continue;
      const to = center(node);
      const along = (horizontal ? to.x - from.x : to.y - from.y) * sign;
      const across = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
      // Within about 60 degrees of the arrow; off-axis distance counts double.
      if (along <= 0 || across > along * 2) continue;
      const score = along + across * 2;
      if (!best || score < best.score) best = { node, score };
    }
    if (!best) return;
    this.select({ kind: "node", id: best.node.dataset.id });
    best.node.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // ----- inline label editor -----

  closeEditor() {
    this.editor?.remove();
    this.editor = null;
  }

  /**
   * Deletes a node and moves the selection to a neighbour so the keyboard can
   * carry on: the node it came from, else one it led to, else the one next to
   * it in the list.
   */
  removeNode(id) {
    const { model } = this.analysis;
    const index = model.nodes.findIndex((node) => node.id === id);
    const target =
      model.edges.find((edge) => edge.to === id && edge.from !== id)?.from ??
      model.edges.find((edge) => edge.from === id && edge.to !== id)?.to ??
      model.nodes[index - 1]?.id ??
      model.nodes[index + 1]?.id ??
      null;
    this.commitModel(deleteNode(model, id), target ? { kind: "node", id: target } : null);
    this.stage.focus({ preventScroll: true });
  }

  /** Deletes an edge and selects the node it left. */
  removeEdge(index) {
    const { model } = this.analysis;
    const from = model.edges[index]?.from;
    this.commitModel(deleteEdge(model, index), from ? { kind: "node", id: from } : null);
    this.stage.focus({ preventScroll: true });
  }

  /** Adds a node that branches from the same parent as `id` (unconnected when `id` has none). */
  addSibling(id, model = this.analysis.model) {
    const parent = model.edges.find((edge) => edge.to === id && edge.from !== id)?.from ?? null;
    const added = addNode(model, { from: parent });
    this.commitModel(added.model, { kind: "node", id: added.id }, true);
  }

  /** Adds a node after `id` (on top of `model`, which may carry a pending rename) and names it. */
  addChild(id, model = this.analysis.model) {
    const added = addNode(model, { from: id });
    this.commitModel(added.model, { kind: "node", id: added.id }, true);
  }

  openEditor(box, value, onCommit) {
    this.closeEditor();
    const input = el("input", "cm-ld-editor");
    input.value = value;
    const width = Math.max(box.width + 24, 120);
    input.style.width = `${width}px`;
    input.style.left = `${box.left + box.width / 2 - width / 2}px`;
    input.style.top = `${box.top + box.height / 2 - 14}px`;
    let done = false;
    const finish = (commit, via = null) => {
      if (done) return;
      done = true;
      this.editor = null;
      this.editorClosedAt = performance.now();
      input.remove();
      this.stage.focus({ preventScroll: true });
      if (commit && (via || input.value !== value)) onCommit(input.value, via);
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.isComposing) return; // the IME is still composing; see onKeyDown
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape") finish(false);
      else if (event.key === "Tab") {
        event.preventDefault();
        finish(true, event.shiftKey ? "sibling" : "child");
      }
    });
    input.addEventListener("blur", () => finish(true));
    this.editor = input;
    this.layer.appendChild(input);
    input.focus();
    input.select();
  }

  editNodeLabel(id) {
    const { model } = this.analysis;
    const node = model.nodes.find((n) => n.id === id);
    const target = this.nodeEl(id);
    if (!node || !target) return;
    this.openEditor(this.box(target), node.text, (text, via) => {
      const renamed = updateNode(model, id, { text: text.trim() || node.text });
      // Tab / Shift+Tab while naming: keep the name and continue with the next node.
      if (via === "child") this.addChild(id, renamed);
      else if (via === "sibling") this.addSibling(id, renamed);
      else this.commitModel(renamed, { kind: "node", id });
    });
  }

  editEdgeLabel(index) {
    const { model } = this.analysis;
    const edge = model.edges[index];
    const g = [...this.stage.querySelectorAll(".pele-edge")].find((n) => n.dataset.id === edge?.id);
    if (!g) return;
    const label = [...this.stage.querySelectorAll(".pele-edge-label")].find((n) => n.dataset.id === edge.id);
    const box = this.box(label || g.querySelector("path"));
    this.openEditor(box, edge.text, (text) =>
      this.commitModel(updateEdge(model, index, { text: text.trim() }), { kind: "edge", index })
    );
  }

  // ----- drag a handle to connect -----

  startConnect(event, fromId, fromEl) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const from = this.box(fromEl);
    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const NS = "http://www.w3.org/2000/svg";
    const overlay = document.createElementNS(NS, "svg");
    overlay.setAttribute("class", "cm-ld-drag");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", startX);
    line.setAttribute("y1", startY);
    line.setAttribute("x2", startX);
    line.setAttribute("y2", startY);
    overlay.appendChild(line);
    this.layer.appendChild(overlay);

    let moved = false;
    let targetEl = null;
    const stageBox = () => this.stage.getBoundingClientRect();
    const onMove = (e) => {
      const s = stageBox();
      const x = e.clientX - s.left + this.stage.scrollLeft;
      const y = e.clientY - s.top + this.stage.scrollTop;
      if (Math.hypot(x - startX, y - startY) > 6) moved = true;
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".pele-node");
      const next = under && this.stage.contains(under) && under.dataset.id !== fromId ? under : null;
      if (next !== targetEl) {
        targetEl?.classList.remove("cm-ld-target");
        next?.classList.add("cm-ld-target");
        targetEl = next;
      }
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      targetEl?.classList.remove("cm-ld-target");
      overlay.remove();
      if (!moved) return;
      const { model } = this.analysis;
      if (targetEl) {
        this.commitModel(addEdge(model, fromId, targetEl.dataset.id), this.selected);
      } else {
        const added = addNode(model, { from: fromId });
        this.commitModel(added.model, { kind: "node", id: added.id }, true);
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  // ----- writing back to the document -----

  range() {
    const pos = this.view.posAtDOM(this.wrap);
    return findMermaidFences(this.view.state.doc).find((fence) => fence.from === pos) || null;
  }

  /** Replaces the fence; `info` and the lines around it stay as they are. */
  write(inner, { mutate }) {
    const range = this.range();
    if (!range) return;
    const info = splitFence(this.block)?.info || "mermaid";
    const insert = joinFence(inner, info);
    if (insert === this.view.state.sliceDoc(range.from, range.to)) return;
    const { doc } = this.view.state;
    // As with tables: the caret goes below the block first, so undo returns there.
    if (mutate) {
      const anchor = range.to < doc.length ? doc.lineAt(range.to + 1).from : range.to;
      this.view.dispatch({ selection: { anchor } });
    }
    this.view.dispatch({
      changes: { ...range, insert },
      userEvent: mutate ? "input.diagram" : "input",
      annotations: mutate ? isolateHistory.of("full") : [],
    });
    if (mutate && !this.view.dom.contains(document.activeElement)) this.view.focus();
  }

  commitModel(model, selected = this.selected, editLabel = false) {
    this.selected = selected;
    this.pendingEdit = editLabel ? selected : null;
    this.write(serializeFlowchart(model), { mutate: true });
    // A new node asks for its name right away.
    if (this.pendingEdit?.kind === "node") {
      const id = this.pendingEdit.id;
      this.pendingEdit = null;
      requestAnimationFrame(() => this.editNodeLabel(id));
    }
  }

  commitSource(text) {
    this.write(text, { mutate: false });
  }

  deleteDiagram() {
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

  destroy() {
    this.closeMenu();
    this.closeEditor();
  }
}

class DiagramWidget extends WidgetType {
  constructor(block) {
    super();
    this.block = block;
  }

  eq(other) {
    return other.block === this.block;
  }

  toDOM(view) {
    const wrap = el("div", "cm-ld-wrap");
    wrap.contentEditable = "false";
    wrap._controller = new DiagramController(view, wrap, this.block);
    return wrap;
  }

  // Keeps the selection and open editors while the source changes.
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

function buildDecorations(state) {
  const ranges = findMermaidFences(state.doc).map(({ from, to }) =>
    Decoration.replace({ widget: new DiagramWidget(state.sliceDoc(from, to)), block: true }).range(from, to)
  );
  return Decoration.set(ranges);
}

// Block decorations must come from a state field, not a view plugin.
export const liveDiagrams = StateField.define({
  create: (state) => buildDecorations(state),
  update: (decorations, tr) => (tr.docChanged ? buildDecorations(tr.state) : decorations),
  provide: (field) => EditorView.decorations.from(field),
});

// ---------- theme ----------

const ACCENT = "#2f81f7";

export const diagramTheme = EditorView.theme({
  ".cm-ld-wrap": {
    position: "relative",
    // The drawing is as wide as it is (zoom keeps its size), and without line
    // wrapping the editor sizes itself to its widest block. Inline-size
    // containment makes the widget contribute no width of its own: it takes
    // the editor's width and the stage inside scrolls instead.
    contain: "inline-size",
    minWidth: "0",
    maxWidth: "100%",
    // Breathing room on the right, so the frame does not touch the cell's edge.
    margin: "6px 12px 6px 0",
    border: "1px solid #30363d",
    borderRadius: "6px",
    backgroundColor: "#0d1117",
    "--pele-bg": "#0d1117",
    "--pele-fg": PALETTE.text,
    "--pele-muted": PALETTE.muted,
    "--pele-line": "#8b949e",
    "--pele-surface": "#161b22",
    "--pele-surface-alt": "#21262d",
    "--pele-border": "#484f58",
    "--pele-accent": ACCENT,
    "--pele-font": "inherit",
  },
  ".cm-ld-bar": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    borderBottom: "1px solid #21262d",
  },
  ".cm-ld-spacer": { flex: "1" },
  ".cm-ld-btn, .cm-ld-select": {
    padding: "2px 8px",
    border: "1px solid #30363d",
    borderRadius: "4px",
    backgroundColor: "#161b22",
    color: PALETTE.text,
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-ld-btn:hover, .cm-ld-select:hover": { backgroundColor: "#21262d" },
  ".cm-ld-btn.is-on": { borderColor: ACCENT, color: ACCENT },
  ".cm-ld-btn.is-danger": { color: "#f85149" },
  ".cm-ld-btn.is-danger:hover": { backgroundColor: "#f851491a", borderColor: "#f85149" },
  ".cm-ld-menu": {
    position: "absolute",
    zIndex: "5",
    display: "flex",
    flexDirection: "column",
    minWidth: "170px",
    padding: "4px",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
    boxShadow: "0 8px 24px rgba(1, 4, 9, 0.6)",
  },
  ".cm-ld-menu button": {
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
  ".cm-ld-menu button:hover": { backgroundColor: "#21262d" },
  ".cm-ld-stage": {
    position: "relative",
    overflow: "auto",
    maxHeight: `${STAGE_MAX_HEIGHT}px`,
    padding: "40px 16px 20px",
    outline: "none",
    textAlign: "center",
  },
  ".cm-ld-stage svg.pele": { display: "inline-block", verticalAlign: "top", overflow: "visible" },
  ".cm-ld-stage.is-zoomed, .cm-ld-stage.is-panning": { cursor: "grab" },
  ".cm-ld-stage.is-panning, .cm-ld-stage.is-panning *": { cursor: "grabbing", userSelect: "none" },
  ".cm-ld-zoom": { display: "inline-flex", gap: "2px", marginRight: "6px" },
  ".cm-ld-zoom-label": { minWidth: "44px", textAlign: "center" },
  ".cm-ld-help": { width: "24px", padding: "2px 0", textAlign: "center", borderRadius: "50%" },
  ".cm-ld-help-panel": { minWidth: "320px", padding: "8px 10px", gap: "2px" },
  ".cm-ld-help-title": { margin: "6px 0 2px", color: PALETTE.muted, fontSize: "11px", fontWeight: "600" },
  ".cm-ld-help-row": {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    fontSize: "12px",
    color: PALETTE.text,
  },
  ".cm-ld-help-keys": { flex: "0 0 112px", display: "inline-flex", flexWrap: "wrap", gap: "3px" },
  ".cm-ld-help-keys kbd": {
    padding: "0 5px",
    border: "1px solid #30363d",
    borderBottomWidth: "2px",
    borderRadius: "4px",
    backgroundColor: "#0d1117",
    font: "inherit",
    fontSize: "11px",
    color: PALETTE.text,
  },
  ".cm-ld-layer": { position: "absolute", left: "0", top: "0", width: "0", height: "0" },
  ".cm-ld-stage .pele-node": { cursor: "pointer" },
  ".cm-ld-stage .pele-node:hover > :not(text):not(svg)": { stroke: ACCENT },
  ".cm-ld-stage .pele-node.cm-ld-sel > :not(text):not(svg), .cm-ld-stage .pele-node.cm-ld-target > :not(text):not(svg)": {
    stroke: ACCENT,
    strokeWidth: "2.5px",
  },
  ".cm-ld-stage .pele-edge, .cm-ld-stage .pele-edge-label": { cursor: "pointer" },
  ".cm-ld-hit": { stroke: "transparent", strokeWidth: "14px", fill: "none", pointerEvents: "stroke" },
  ".cm-ld-stage .pele-edge:hover > path:not(.cm-ld-hit), .cm-ld-stage .pele-edge.cm-ld-sel > path:not(.cm-ld-hit)": {
    stroke: ACCENT,
  },
  ".cm-ld-stage .pele-edge.cm-ld-sel > path:not(.cm-ld-hit):not(.pele-marker)": { strokeWidth: "2.5px" },
  ".cm-ld-stage .pele-edge:hover > .pele-marker, .cm-ld-stage .pele-edge.cm-ld-sel > .pele-marker": { fill: ACCENT },
  ".cm-ld-tools": {
    position: "absolute",
    display: "flex",
    gap: "4px",
    padding: "3px",
    zIndex: "3",
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(1, 4, 9, 0.6)",
    whiteSpace: "nowrap",
  },
  ".cm-ld-handle": {
    position: "absolute",
    zIndex: "3",
    width: "14px",
    height: "14px",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    backgroundColor: "#0d1117",
    boxShadow: `0 0 0 2px ${ACCENT}`,
    cursor: "crosshair",
    touchAction: "none",
  },
  ".cm-ld-handle:hover": { backgroundColor: ACCENT },
  ".cm-ld-drag": {
    position: "absolute",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    overflow: "visible",
    pointerEvents: "none",
    stroke: ACCENT,
    strokeWidth: "2px",
    strokeDasharray: "5 4",
  },
  ".cm-ld-editor": {
    position: "absolute",
    zIndex: "4",
    boxSizing: "border-box",
    height: "28px",
    padding: "0 8px",
    border: `1px solid ${ACCENT}`,
    borderRadius: "4px",
    backgroundColor: "#0d1117",
    color: PALETTE.text,
    font: "inherit",
    fontSize: "13px",
    textAlign: "center",
    outline: "none",
  },
  ".cm-ld-message": {
    padding: "6px 10px",
    borderTop: "1px solid #21262d",
    color: PALETTE.muted,
    fontSize: "12px",
  },
  ".cm-ld-message.is-error": { color: "#f85149" },
  ".cm-ld-source": {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    padding: "8px 10px",
    border: "none",
    borderTop: "1px solid #21262d",
    backgroundColor: "#0d1117",
    color: PALETTE.text,
    fontFamily: "monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    resize: "vertical",
    outline: "none",
  },
  ".cm-ld-source[hidden], .cm-ld-message[hidden]": { display: "none" },
});

export const diagramExtensions = [liveDiagrams, diagramTheme];
