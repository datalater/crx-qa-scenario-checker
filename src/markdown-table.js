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

// ---------- pasting a table from the clipboard ----------

/**
 * Tab-separated text -> rows of cell text. Handles what spreadsheets and
 * Notion put on the clipboard:
 *  - `"quoted ""cells"""` that may hold tabs and line breaks (Sheets, Excel);
 *  - unquoted line breaks inside a cell (Notion): a row with fewer cells than
 *    the header continues in the next line, and a line without any tab
 *    continues the previous row's last cell.
 */
export function parseTsv(text) {
  const source = text.replace(/\r\n?/g, "\n");
  const lines = [];
  let row = [];

  // A quoted cell runs to a closing quote that is followed by a separator.
  const readQuoted = (start) => {
    let cell = "";
    for (let j = start + 1; j < source.length; j++) {
      if (source[j] !== '"') cell += source[j];
      else if (source[j + 1] === '"') cell += source[j++];
      else {
        const next = source[j + 1];
        return next === undefined || next === "\t" || next === "\n" ? { cell, end: j + 1 } : null;
      }
    }
    return null;
  };

  let i = 0;
  while (i <= source.length) {
    const quoted = source[i] === '"' ? readQuoted(i) : null;
    let end = quoted?.end;
    if (!quoted) {
      end = i;
      while (end < source.length && source[end] !== "\t" && source[end] !== "\n") end++;
    }
    row.push(quoted ? quoted.cell : source.slice(i, end));
    if (source[end] !== "\t") {
      lines.push(row);
      row = [];
    }
    i = end + 1;
  }

  const width = (lines.find((cells) => cells.some((cell) => cell.trim())) || []).length;
  const rows = [];
  let open = false; // the last row still waits for the rest of its cells
  for (const cells of lines) {
    if (cells.length === 1 && !cells[0].trim()) continue;
    const last = rows[rows.length - 1];
    if (open) {
      last[last.length - 1] += "\n" + cells[0];
      last.push(...cells.slice(1));
    } else if (cells.length === 1 && width > 1 && last) {
      last[last.length - 1] += "\n" + cells[0];
    } else {
      rows.push([...cells]);
    }
    open = rows[rows.length - 1].length < width;
  }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

/**
 * Rows of cell text -> GFM table source, or null when the rows do not look
 * like a table: it needs a header and a row, two columns, and a header that
 * is not just indentation.
 */
export function tableSourceFromRows(rows) {
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((row) => row.length));
  if (width < 2) return null;
  const [header] = rows;
  if (!header[0] || header.filter(Boolean).length < 2) return null;
  const pad = (row) => [...row, ...Array(width - row.length).fill("")];
  return serializeTable({
    header: pad(header),
    align: Array(width).fill("--"),
    rows: rows.slice(1).map(pad),
  });
}

/** Clipboard plain text -> table source, or null when it is not tabular. */
export function tableSourceFromText(text) {
  if (!text || !text.includes("\t")) return null;
  return tableSourceFromRows(parseTsv(text));
}

const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6"]);

function cellTextFromElement(cell) {
  let out = "";
  const walk = (node) => {
    if (node.nodeType === 3) out += node.nodeValue.replace(/\s+/g, " ");
    else if (node.nodeName === "BR") out += "\n";
    else if (node.nodeType === 1) {
      const block = BLOCK_TAGS.has(node.nodeName);
      if (block && out && !out.endsWith("\n")) out += "\n";
      node.childNodes.forEach(walk);
      if (block && !out.endsWith("\n")) out += "\n";
    }
  };
  cell.childNodes.forEach(walk);
  return out
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Clipboard HTML -> table source, only when the HTML is one table and nothing
 * else (a table copied from Notion, Docs, a web page). Copying a page section
 * that merely contains a table is left to the plain-text paste.
 */
export function tableSourceFromHtml(html, ParserImpl = globalThis.DOMParser) {
  if (!html || !/<table[\s>]/i.test(html) || !ParserImpl) return null;
  const doc = new ParserImpl().parseFromString(html, "text/html");
  const tables = doc.querySelectorAll("table");
  if (tables.length !== 1) return null;
  const table = tables[0];
  const rest = doc.body.cloneNode(true);
  rest.querySelectorAll("table").forEach((node) => node.remove());
  if (rest.textContent.trim()) return null;
  const rows = [...table.querySelectorAll("tr")].map((tr) =>
    [...tr.children]
      .filter((cell) => cell.nodeName === "TD" || cell.nodeName === "TH")
      .map(cellTextFromElement)
  );
  return tableSourceFromRows(rows.filter((row) => row.length));
}

/** What a paste of `{ html, text }` becomes, or null to paste as usual. */
export function tableSourceFromClipboard({ html, text }, ParserImpl) {
  return tableSourceFromHtml(html, ParserImpl) || tableSourceFromText(text);
}

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
export function planTableInsertion(line, from, to, table = EMPTY_TABLE) {
  const rest = line.text.slice(0, from - line.from) + line.text.slice(to - line.from);
  const before = !rest.trim()
    ? (line.hasPrev && !line.prevBlank ? "\n" : "")
    : "\n\n";
  const after = line.hasNext && !line.nextBlank ? "\n" : "";

  if (!rest.trim()) {
    return {
      changes: [{ from: line.from, to: line.to, insert: before + table + after }],
      tableFrom: line.from + before.length,
    };
  }
  return {
    changes: [
      { from, to, insert: "" },
      { from: line.to, to: line.to, insert: before + table + after },
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
