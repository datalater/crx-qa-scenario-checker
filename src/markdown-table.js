/**
 * GFM table text <-> cell model, kept free of CodeMirror so it can be tested
 * in Node.
 *
 * A cell's line breaks are stored as `<br>`: GFM has no other way to put a
 * line break inside a cell, and every renderer (GitHub, Notion) shows `<br>`
 * as one.
 */

const BR_PATTERN = /<br\s*\/?>/gi;

/** One table line -> raw cell strings. `\|` stays escaped. */
export function splitTableRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === "|") {
      current += "\\|";
      i++;
      continue;
    }
    if (text[i] === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += text[i];
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Stored cell markdown -> the text shown and edited in a cell. */
export function cellTextFromMarkdown(raw) {
  return raw.replace(BR_PATTERN, "\n").replace(/\\\|/g, "|");
}

/** Edited cell text -> stored cell markdown. Trailing line breaks are dropped. */
export function cellMarkdownFromText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\n+$/, "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

/**
 * Table source -> `{ header, align, rows }`, every row padded to the widest
 * one. `align` keeps the delimiter cells as written (`--`, `:-:`, ...).
 */
export function parseTable(source) {
  const lines = source.split("\n").filter((line) => line.trim());
  const header = splitTableRow(lines[0] || "").map(cellTextFromMarkdown);
  const align = splitTableRow(lines[1] || "");
  const rows = lines.slice(2).map((line) => splitTableRow(line).map(cellTextFromMarkdown));
  const width = Math.max(header.length, ...rows.map((row) => row.length));
  const pad = (row, fill) => [...row, ...Array(width - row.length).fill(fill)].slice(0, width);
  return {
    header: pad(header, ""),
    align: pad(align, "--").map((cell) => cell || "--"),
    rows: rows.map((row) => pad(row, "")),
  };
}

/** Cell model -> table source, one `| a | b |` line per row, no padding. */
export function serializeTable({ header, align, rows }) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [
    line(header.map(cellMarkdownFromText)),
    line(align),
    ...rows.map((row) => line(row.map(cellMarkdownFromText))),
  ].join("\n");
}

export const EMPTY_TABLE = "|  |  |\n| -- | -- |\n|  |  |";

// Column and row edits. Each returns a new model; at least one column stays,
// because a table without columns is no longer a table.

export function insertColumn(model, at) {
  const splice = (row, fill) => [...row.slice(0, at), fill, ...row.slice(at)];
  return {
    header: splice(model.header, ""),
    align: splice(model.align, "--"),
    rows: model.rows.map((row) => splice(row, "")),
  };
}

export function deleteColumn(model, at) {
  if (model.header.length <= 1) return model;
  const drop = (row) => row.filter((_, index) => index !== at);
  return { header: drop(model.header), align: drop(model.align), rows: model.rows.map(drop) };
}

export function insertRow(model, at) {
  const row = Array(model.header.length).fill("");
  return { ...model, rows: [...model.rows.slice(0, at), row, ...model.rows.slice(at)] };
}

export function deleteRow(model, at) {
  return { ...model, rows: model.rows.filter((_, index) => index !== at) };
}

/**
 * Where `/table` puts a new table, given the command's line. The command text
 * (`from`-`to`) is removed. Blank lines are added around the table only where
 * needed: a table glued to a paragraph is not parsed as a table.
 *
 * `line` is `{ text, from, to, prevBlank, nextBlank, hasPrev, hasNext }` for
 * the command's line. Returns CodeMirror-style `changes` plus the table's
 * start in the new document.
 */
export function planTableInsertion(line, from, to) {
  const rest = line.text.slice(0, from - line.from) + line.text.slice(to - line.from);
  const before = !rest.trim()
    ? (line.hasPrev && !line.prevBlank ? "\n" : "")
    : "\n\n";
  const after = line.hasNext && !line.nextBlank ? "\n" : "";

  if (!rest.trim()) {
    return {
      changes: [{ from: line.from, to: line.to, insert: before + EMPTY_TABLE + after }],
      tableFrom: line.from + before.length,
    };
  }
  return {
    changes: [
      { from, to, insert: "" },
      { from: line.to, to: line.to, insert: before + EMPTY_TABLE + after },
    ],
    tableFrom: line.to - (to - from) + before.length,
  };
}

/**
 * Range to delete for a table spanning `from`-`to` (whole lines), so that no
 * double blank line is left where it was. `around` is
 * `{ docLength, prev, next }`, where `prev`/`next` are the neighbouring lines
 * as `{ from, to, blank }` or null.
 */
export function planTableDeletion(from, to, { docLength, prev, next }) {
  if (next) {
    // Take the table and its line break; if blank lines sat on both sides,
    // take one of them too.
    let end = to + 1;
    if (next.blank && prev?.blank) end = Math.min(next.to + 1, docLength);
    return { from, to: end };
  }
  // Last lines of the document: take the line break before the table, and the
  // blank line before it as well.
  if (!prev) return { from, to };
  return { from: prev.blank && prev.from > 0 ? prev.from - 1 : prev.to, to };
}
