/**
 * Mermaid flowchart <-> editable graph model, kept free of the DOM and of
 * CodeMirror so it can be tested in Node.
 *
 * Reading goes through pele's parser (passed in as `parse`), so every syntax
 * pele understands is understood here. Writing is ours and canonical, so a
 * diagram is only GUI-editable when writing its model back reads as the same
 * diagram: anything the model cannot hold (subgraphs, styles, classes, links,
 * unusual shapes, ...) makes `analyzeFlowchart` say so, and the view then
 * falls back to editing the source instead of silently dropping it.
 */

export const DIRECTIONS = ["TD", "LR", "BT", "RL"];
export const DIRECTION_ARROWS = { TD: "↓", LR: "→", BT: "↑", RL: "←" };

/** shape -> [open, close] around a quoted label. Order = order in the shape menu. */
export const SHAPES = {
  square: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  diamond: ["{", "}"],
  circle: ["((", "))"],
  hexagon: ["{{", "}}"],
};

export const SHAPE_LABELS = {
  square: "사각형",
  round: "둥근 사각형",
  stadium: "타원",
  diamond: "분기 (마름모)",
  circle: "원",
  hexagon: "육각형",
};

/** pele's edge (type, stroke) -> arrow. */
const ARROWS = {
  "arrow_point/normal": "-->",
  "arrow_point/dotted": "-.->",
  "arrow_point/thick": "==>",
  "arrow_open/normal": "---",
};
const ARROW_KEYS = Object.fromEntries(Object.entries(ARROWS).map(([key, arrow]) => [arrow, key]));

export const EDGE_STYLES = Object.keys(ARROW_KEYS);
export const EDGE_STYLE_LABELS = {
  "-->": "화살표",
  "---": "선",
  "-.->": "점선 화살표",
  "==>": "굵은 화살표",
};

export const NEW_NODE_TEXT = "새 노드";

// pele keeps entity escapes like `#quot;` in its own private form until it renders.
const ESCAPED_QUOTE = /ﬂ°quot¶ß/g;
const readText = (text) => (text ?? "").replace(ESCAPED_QUOTE, '"');
const writeText = (text) => text.replace(/"/g, "#quot;").replace(/\r?\n/g, "<br>");

export const EMPTY_FLOWCHART = 'flowchart TD\n  A["시작"] --> B["끝"]';

/** Model -> canonical source: nodes first, then one line per edge. */
export function serializeFlowchart(model) {
  const lines = [`flowchart ${model.direction}`];
  for (const node of model.nodes) {
    const [open, close] = SHAPES[node.shape] || SHAPES.square;
    const bare = node.shape === "square" && node.text === node.id;
    lines.push(bare ? `  ${node.id}` : `  ${node.id}${open}"${writeText(node.text)}"${close}`);
  }
  for (const edge of model.edges) {
    const label = edge.text ? `|"${writeText(edge.text)}"|` : "";
    lines.push(`  ${edge.from} ${edge.style}${label} ${edge.to}`);
  }
  return lines.join("\n");
}

function modelFromParsed(parsed) {
  const direction = parsed.direction === "TB" || !parsed.direction ? "TD" : parsed.direction;
  return {
    direction,
    nodes: [...parsed.nodes.values()].map((node) => ({
      id: node.id,
      text: readText(node.text ?? node.id),
      shape: node.type || "square",
    })),
    edges: parsed.edges.map((edge) => ({
      from: edge.start,
      to: edge.end,
      text: readText(edge.text),
      style: ARROWS[`${edge.type}/${edge.stroke}`] || "-->",
      id: edge.id,
    })),
  };
}

/** What two parses must agree on for a round trip to count as lossless. */
function signature(parsed) {
  return JSON.stringify({
    direction: parsed.direction === "TB" || !parsed.direction ? "TD" : parsed.direction,
    nodes: [...parsed.nodes.values()].map((node) => [node.id, node.text ?? node.id, node.type || "square"]),
    edges: parsed.edges.map((edge) => [edge.start, edge.end, edge.text, edge.type, edge.stroke]),
  });
}

function unsupportedReason(parsed) {
  if (!["flowchart", "graph"].includes(parsed.mermaidType) && parsed.type !== "flowchart") {
    return "flowchart가 아닌 다이어그램";
  }
  if (parsed.subgraphs.length) return "subgraph";
  if (parsed.classes.size) return "classDef 스타일";
  if (parsed.tooltips?.size) return "tooltip";
  if (parsed.title) return "제목";
  for (const node of parsed.nodes.values()) {
    if (node.styles?.length || node.classes?.length) return "노드 스타일";
    if (node.link || node.icon || node.img || node.form || node.pos || Object.keys(node.props || {}).length) return "노드 링크/아이콘";
    if (!SHAPES[node.type || "square"]) return `지원하지 않는 모양 (${node.type})`;
  }
  for (const edge of parsed.edges) {
    if (!ARROWS[`${edge.type}/${edge.stroke}`]) return "지원하지 않는 간선 모양";
    if (edge.style?.length || edge.classes?.length) return "간선 스타일";
    if (edge.isUserDefinedId || edge.animate || edge.length > 1) return "간선 옵션";
  }
  return null;
}

/**
 * `{ model, editable, reason, error }` for a source text. `parse` is pele's.
 * A model is returned even when not editable (the view may still show it).
 */
export function analyzeFlowchart(source, parse) {
  let parsed;
  try {
    parsed = parse(source);
  } catch (error) {
    return { model: null, editable: false, reason: null, error: error.message || String(error) };
  }
  if (parsed.type !== "flowchart") {
    return { model: null, editable: false, reason: "flowchart가 아닌 다이어그램", error: null };
  }
  const model = modelFromParsed(parsed);
  let reason = unsupportedReason(parsed);
  if (!reason) {
    try {
      if (signature(parse(serializeFlowchart(model))) !== signature(parsed)) reason = "소스를 그대로 옮길 수 없는 문법";
    } catch {
      reason = "소스를 그대로 옮길 수 없는 문법";
    }
  }
  return { model, editable: !reason, reason, error: null };
}

// ---------- edits: each returns a new model ----------

/** Next free id: A..Z, then N1, N2, ... */
export function nextNodeId(model) {
  const used = new Set(model.nodes.map((node) => node.id));
  for (let code = 65; code <= 90; code++) {
    const id = String.fromCharCode(code);
    if (!used.has(id)) return id;
  }
  let n = 1;
  while (used.has(`N${n}`)) n++;
  return `N${n}`;
}

/** Adds a node; with `from`, also an edge from that node to it. */
export function addNode(model, { from = null, text = NEW_NODE_TEXT, shape = "square" } = {}) {
  const id = nextNodeId(model);
  const next = {
    ...model,
    nodes: [...model.nodes, { id, text, shape }],
    edges: from ? [...model.edges, { from, to: id, text: "", style: "-->" }] : model.edges,
  };
  return { model: next, id };
}

export function addEdge(model, from, to) {
  return { ...model, edges: [...model.edges, { from, to, text: "", style: "-->" }] };
}

export function deleteNode(model, id) {
  return {
    ...model,
    nodes: model.nodes.filter((node) => node.id !== id),
    edges: model.edges.filter((edge) => edge.from !== id && edge.to !== id),
  };
}

export function deleteEdge(model, index) {
  return { ...model, edges: model.edges.filter((_, i) => i !== index) };
}

export function updateNode(model, id, patch) {
  return { ...model, nodes: model.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) };
}

export function updateEdge(model, index, patch) {
  return { ...model, edges: model.edges.map((edge, i) => (i === index ? { ...edge, ...patch } : edge)) };
}

export function setDirection(model, direction) {
  return { ...model, direction };
}

// ---------- the ```mermaid fence ----------

/** `{ info, inner }` of a fenced block's text, or null when it is not a plain ``` fence. */
export function splitFence(block) {
  const lines = block.split("\n");
  const open = /^```(\S*)\s*$/.exec(lines[0]);
  if (!open) return null;
  const closed = lines.length > 1 && /^```\s*$/.test(lines[lines.length - 1]);
  return { info: open[1], inner: lines.slice(1, closed ? -1 : undefined).join("\n") };
}

export const joinFence = (inner, info = "mermaid") => `\`\`\`${info}\n${inner}\n\`\`\``;
