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

/**
 * Model -> source: what came before the header (front matter, directives,
 * comments), the header, nodes, one line per edge, then the lines the model
 * does not hold (classDef, class, style, linkStyle, click, comments), as they
 * were.
 */
export function serializeFlowchart(model) {
  const lines = [...(model.preamble || []), `flowchart ${model.direction}`];
  for (const node of model.nodes) {
    const [open, close] = SHAPES[node.shape] || SHAPES.square;
    const bare = node.shape === "square" && node.text === node.id;
    const tag = node.className ? `:::${node.className}` : "";
    lines.push(bare ? `  ${node.id}${tag}` : `  ${node.id}${open}"${writeText(node.text)}"${close}${tag}`);
  }
  for (const edge of model.edges) {
    const label = edge.text ? `|"${writeText(edge.text)}"|` : "";
    lines.push(`  ${edge.from} ${edge.style}${label} ${edge.to}`);
  }
  for (const extra of model.extras || []) lines.push(`  ${extra}`);
  return lines.join("\n");
}

// Lines that style or annotate the diagram without being part of its graph.
// `class`/`style`/`click` need the space: `classA --> B` is an edge.
const EXTRA_LINE = /^\s*(classDef|class|style|linkStyle|click|%%)(\s|$)/;
const HEADER_LINE = /^\s*(flowchart|graph)\b/i;

/** Source -> `{ preamble, header, extras, rest }`, or null without a flowchart header. */
function splitSource(source) {
  const lines = source.split("\n");
  const at = lines.findIndex((line) => HEADER_LINE.test(line));
  if (at < 0) return null;
  const body = lines.slice(at + 1);
  return {
    preamble: lines.slice(0, at),
    header: lines[at],
    extras: body.filter((line) => EXTRA_LINE.test(line)).map((line) => line.trim()),
    rest: body.filter((line) => !EXTRA_LINE.test(line)),
  };
}

function modelFromParsed(parsed, parts, fullEdgeIds) {
  const direction = parsed.direction === "TB" || !parsed.direction ? "TD" : parsed.direction;
  return {
    direction,
    preamble: parts.preamble,
    extras: parts.extras,
    nodes: [...parsed.nodes.values()].map((node) => ({
      id: node.id,
      text: readText(node.text ?? node.id),
      shape: node.type || "square",
      className: node.classes?.[0] || "",
    })),
    edges: parsed.edges.map((edge, index) => ({
      from: edge.start,
      to: edge.end,
      text: readText(edge.text),
      style: ARROWS[`${edge.type}/${edge.stroke}`] || "-->",
      id: fullEdgeIds[index],
    })),
  };
}

/** What two parses must agree on for a round trip to count as lossless. */
function signature(parsed) {
  const sorted = (list) => [...(list || [])].sort();
  return JSON.stringify({
    title: parsed.title ?? null,
    direction: parsed.direction === "TB" || !parsed.direction ? "TD" : parsed.direction,
    nodes: [...parsed.nodes.values()].map((node) => [
      node.id,
      node.text ?? node.id,
      node.type || "square",
      sorted(node.classes),
      node.styles || [],
      node.link ?? null,
    ]),
    edges: parsed.edges.map((edge) => [
      edge.start,
      edge.end,
      edge.text,
      edge.type,
      edge.stroke,
      edge.style || [],
      sorted(edge.classes),
    ]),
    classes: [...(parsed.classes || [])].map(([id, def]) => [id, def.styles, def.textStyles]).sort(),
    tooltips: [...(parsed.tooltips || [])].sort(),
  });
}

/** Why the graph part (without the passthrough lines) cannot be edited, or null. */
function unsupportedReason(parsed) {
  if (parsed.type !== "flowchart") return "flowchart가 아닌 다이어그램";
  if (parsed.subgraphs.length) return "subgraph";
  for (const node of parsed.nodes.values()) {
    if ((node.classes?.length || 0) > 1) return "노드 클래스 여러 개";
    if (node.styles?.length) return "노드 스타일";
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
 *
 * The lines the model does not hold (styles, classes, links, comments, front
 * matter) travel in `model.preamble` / `model.extras` and are written back
 * as they were, so they no longer switch the GUI off. Editable still means
 * lossless: the written-back source must read as the very same diagram,
 * styles included, or the reason says why not.
 */
export function analyzeFlowchart(source, parse) {
  let full;
  try {
    full = parse(source);
  } catch (error) {
    return { model: null, editable: false, reason: null, error: error.message || String(error) };
  }
  if (full.type !== "flowchart") {
    return { model: null, editable: false, reason: "flowchart가 아닌 다이어그램", error: null };
  }
  const parts = splitSource(source);
  if (!parts) return { model: null, editable: false, reason: "flowchart 머리말을 찾지 못함", error: null };

  let graph;
  try {
    graph = parse([parts.header, ...parts.rest].join("\n"));
  } catch {
    return { model: null, editable: false, reason: "소스를 나눌 수 없는 문법", error: null };
  }
  let reason = unsupportedReason(graph);
  if (!reason && graph.edges.length !== full.edges.length) reason = "소스를 나눌 수 없는 문법";
  const model = modelFromParsed(graph, parts, full.edges.map((edge) => edge.id));
  if (!reason) {
    try {
      if (signature(parse(serializeFlowchart(model))) !== signature(full)) reason = "소스를 그대로 옮길 수 없는 문법";
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
    nodes: [...model.nodes, { id, text, shape, className: "" }],
    edges: from ? [...model.edges, { from, to: id, text: "", style: "-->" }] : model.edges,
  };
  return { model: next, id };
}

export function addEdge(model, from, to) {
  return { ...model, edges: [...model.edges, { from, to, text: "", style: "-->" }] };
}

/** `class A,B name` / `style A ...` / `click A ...` lines without `id`; lines left empty go away. */
function dropNodeFromExtras(extras, id) {
  const out = [];
  for (const line of extras) {
    const match = /^(class|style|click)\s+(\S+)(.*)$/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    const [, keyword, target, rest] = match;
    if (keyword === "class") {
      const ids = target.split(",").filter((item) => item !== id);
      if (ids.length) out.push(`class ${ids.join(",")}${rest}`);
    } else if (target !== id) {
      out.push(line);
    }
  }
  return out;
}

/**
 * `linkStyle` counts edges by position, so removing edges renumbers the rest:
 * indexes of removed edges are dropped, later ones move up.
 */
function dropEdgesFromExtras(extras, removed) {
  if (!removed.length) return extras;
  const out = [];
  for (const line of extras) {
    const match = /^linkStyle\s+([\d,\s]+?)(\s+.*)$/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    const kept = match[1]
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((index) => !removed.includes(index))
      .map((index) => index - removed.filter((gone) => gone < index).length);
    if (kept.length) out.push(`linkStyle ${kept.join(",")}${match[2]}`);
  }
  return out;
}

export function deleteNode(model, id) {
  const removed = model.edges.flatMap((edge, index) => (edge.from === id || edge.to === id ? [index] : []));
  return {
    ...model,
    nodes: model.nodes.filter((node) => node.id !== id),
    edges: model.edges.filter((edge) => edge.from !== id && edge.to !== id),
    extras: dropEdgesFromExtras(dropNodeFromExtras(model.extras || [], id), removed),
  };
}

export function deleteEdge(model, index) {
  return {
    ...model,
    edges: model.edges.filter((_, i) => i !== index),
    extras: dropEdgesFromExtras(model.extras || [], [index]),
  };
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

// ---------- title (front matter) ----------

/** `{ start, end }` of the front matter block in the lines before the header, or null. */
function frontMatterRange(preamble) {
  const start = preamble.findIndex((line) => line.trim());
  if (start < 0 || preamble[start].trim() !== "---") return null;
  const end = preamble.findIndex((line, i) => i > start && line.trim() === "---");
  return end < 0 ? null : { start, end };
}

const TITLE_LINE = /^title:\s*(.*)$/;

function parseYamlScalar(raw) {
  const text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

/** A title written on one line stays plain when YAML would read it back the same. */
function writeYamlScalar(text) {
  const plain = /^[^\s"'#:&*!|>%@`[\]{},?-]/.test(text) && !/[:#\\]|\s$/.test(text.slice(1)) && !/\s$/.test(text);
  return plain ? text : `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The diagram title from the front matter: "" when there is none, `null` when it
 * is written in a form that cannot be edited safely (a block scalar like `|`).
 */
export function titleOf(model) {
  const range = frontMatterRange(model.preamble || []);
  if (!range) return "";
  const lines = model.preamble;
  for (let i = range.start + 1; i < range.end; i++) {
    const match = TITLE_LINE.exec(lines[i]);
    if (!match) continue;
    if (/^[|>]/.test(match[1].trim())) return null;
    return parseYamlScalar(match[1]);
  }
  return "";
}

/**
 * Sets (or with "" removes) the title. Only the `title:` line changes: other
 * front matter keys, directives and comments stay as they are, and an emptied
 * front matter block goes away.
 */
export function setTitle(model, title) {
  const text = title.replace(/\s*\r?\n\s*/g, " ").trim();
  const lines = [...(model.preamble || [])];
  const range = frontMatterRange(lines);
  const line = text ? `title: ${writeYamlScalar(text)}` : null;

  if (!range) {
    if (line) lines.unshift("---", line, "---");
    return { ...model, preamble: lines };
  }
  const at = lines.findIndex((l, i) => i > range.start && i < range.end && TITLE_LINE.test(l));
  if (at >= 0) {
    if (line) lines[at] = line;
    else lines.splice(at, 1);
  } else if (line) {
    lines.splice(range.start + 1, 0, line);
  }
  const after = frontMatterRange(lines);
  if (after && lines.slice(after.start + 1, after.end).every((l) => !l.trim())) {
    lines.splice(after.start, after.end - after.start + 1);
  }
  return { ...model, preamble: lines };
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
