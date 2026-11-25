/**
 * The ```ui block: a rough picture of a screen area written as text, where
 * each piece of content carries the role it plays.
 *
 *   @title(시간표 설정) --- @cta([삭제])
 *
 *   @role(content)   the role covers what is inside the parentheses
 *   @role"content"   the same with quotes, for content that has parentheses
 *   @role content    without either: up to the next @role, a `---`, or the line end
 *   @role:when"…"    a directive: a condition or state the role appears in.
 *                    It runs from the colon to the opening `"` or `(`, spaces
 *                    included, so it needs one of them; more colons, more
 *                    directives
 *   ---              pushes what follows to the far side of the line
 *   --               starts the next column: the nth `--` of every line in the
 *                    block sits on the same vertical line
 *   [text]           a button; [[text]] an emphasized one
 *   {name}           a value filled in later (any name: {count}, {날짜})
 *   blank line       vertical space
 *   \n               a line break inside a piece of text
 *
 * A line holding only `@group-start-name` opens a group that `@group-end-name`
 * closes; the lines between are drawn inside a frame carrying that name. The
 * name may be left out, and then the group is called `group`, and it takes
 * directives like a role does: `@group-start-callout:에러일 때`.
 *
 * Roles nest (inside quotes, with parentheses: quotes cannot hold quotes),
 * and a role is only read at the start of a word, so the `@` in `a@b.com` is
 * text. `\` takes the next character literally.
 *
 * Parsing is pure, so it is tested without an editor.
 */

export const UI_FENCE_INFO = "ui";

/** What `/ui` inserts: enough to show the syntax, short enough to overwrite. */
export const EMPTY_UI_SKETCH = "@title(제목) --- [버튼]\n@description(설명)";

/**
 * The syntax as `[what to type, what it means]`, shown by the block's `?`.
 * Keep in step with parseUiLine below.
 */
export const UI_SYNTAX_HELP = [
  ["@역할(내용)", "괄호 안이 그 역할의 범위. 역할 안에 역할을 넣을 수 있음"],
  ['@역할"내용"', "따옴표 안이 범위. 내용에 괄호가 있을 때 편함"],
  ["@역할 내용", "둘 다 생략: 다음 @역할, ---, 줄 끝 중 먼저 나오는 곳까지"],
  ['@역할:조건"내용"', '조건·상태 표시. : 뒤부터 여는 " 나 ( 앞까지, 띄어쓰기 가능'],
  ["---", "뒤따르는 내용을 줄의 반대쪽 끝으로 밀기"],
  ["--", "다음 칸 시작. 모든 줄의 n번째 -- 가 같은 세로선에 놓임"],
  ["[버튼]", "버튼"],
  ["[[버튼]]", "강조 버튼"],
  ["{변수}", "나중에 값이 들어갈 자리"],
  ["빈 줄", "세로 간격"],
  ["\\n", "줄바꿈"],
  ["@group-start-이름", "그룹 열기. 이름 생략 가능(group), :조건 도 붙일 수 있음"],
  ["@group-end-이름", "그룹 닫기. 여는 이름과 같아야 함"],
  ['\\) \\" \\@ \\[', "기호를 글자 그대로 쓰기"],
];

const ROLE = /^@([A-Za-z][\w-]*)/;

// A line holding only a group marker: `@group-start-name:when`. The name
// runs to the first `:`, so it may hold dashes, spaces and any script;
// without one the group is simply called "group".
const GROUP_LINE = /^\s*@group-(start|end)(?=[-:\s]|$)(.*)$/;
const DEFAULT_GROUP_NAME = "group";
// A role without parentheses also stops at a column mark.
const SHORTHAND_END = /(^|\s)(@[A-Za-z]|---?(\s|$))/;

/**
 * Thrown for a line that cannot be read. `reason` is `unclosed` for a
 * `@role(` or `@role"` whose closing mark is missing, and `directive` for a
 * `@role:when` that is not followed by a scope.
 */
export class UnclosedRoleError extends Error {
  constructor(role, reason = "unclosed") {
    super(role);
    this.reason = reason;
  }
}

export const UI_ERROR_MESSAGES = {
  unclosed: "닫는 괄호나 따옴표가 없습니다",
  directive: '조건(:) 뒤에는 "내용" 이나 (내용) 이 와야 합니다',
  groupUnclosed: "@group-end 로 닫지 않았습니다",
  groupUnopened: "여는 @group-start 가 없습니다",
};

/**
 * A group marker line as `{ edge, name, directives }`, or null for any other
 * line. Directives work as they do on a role, and only the name pairs a
 * `@group-end` with its `@group-start`.
 */
export function parseGroupLine(line) {
  const match = GROUP_LINE.exec(String(line ?? ""));
  if (!match) return null;
  const rest = match[2];
  const parts = [""];
  for (let i = rest.startsWith("-") ? 1 : 0; i < rest.length; i += 1) {
    if (rest[i] === "\\" && i + 1 < rest.length) {
      parts[parts.length - 1] += rest[i + 1];
      i += 1;
    } else if (rest[i] === ":") parts.push("");
    else parts[parts.length - 1] += rest[i];
  }
  const [name, ...directives] = parts.map((part) => part.trim());
  return {
    edge: match[1],
    name: name || DEFAULT_GROUP_NAME,
    directives: directives.filter(Boolean)
  };
}

function matchingParen(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "\\") i += 1;
    else if (source[i] === "(") depth += 1;
    else if (source[i] === ")" && (depth -= 1) === 0) return i;
  }
  return -1;
}

function closingQuote(source, open) {
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === "\\") i += 1;
    else if (source[i] === '"') return i;
  }
  return -1;
}

/**
 * The directives after a role name, and where its scope opens. From the
 * colon at `from` they run to the first `"` or `(`; a colon in between
 * starts another one.
 */
function readDirectives(source, from, role) {
  const directives = [];
  let current = "";
  for (let i = from + 1; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\\" && i + 1 < source.length) {
      current += source[i + 1];
      i += 1;
    } else if (char === '"' || char === "(") {
      directives.push(current);
      return { directives: directives.map((item) => item.trim()).filter(Boolean), open: i };
    } else if (char === ":") {
      directives.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  throw new UnclosedRoleError(role, "directive");
}

/**
 * One line as nodes:
 *   { type: "text", value } | { type: "button", value, primary } |
 *   { type: "var", name } | { type: "spacer" } | { type: "column" } |
 *   { type: "role", name, children, directives? }
 *
 * A column mark only splits the line itself. Inside a role (`nested`) two
 * dashes are just text, since a role cannot straddle two columns.
 */
export function parseUiLine(source, nested = false) {
  const nodes = [];
  let text = "";
  const flush = () => {
    // Spaces around a piece are layout, so they go; a line break is content.
    const value = text.replace(/^[^\S\n]+|[^\S\n]+$/g, "");
    if (value.trim()) nodes.push({ type: "text", value });
    text = "";
  };
  const atWordStart = (i) => i === 0 || /[\s(]/.test(source[i - 1]);

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let match;
    if (source[i] === "\\" && i + 1 < source.length) {
      // `\n` is the one escape that stands for something: a line break.
      text += source[i + 1] === "n" ? "\n" : source[i + 1];
      i += 2;
    } else if (/^---(?=\s|$)/.test(rest) && (i === 0 || /\s/.test(source[i - 1]))) {
      flush();
      nodes.push({ type: "spacer" });
      i += 3;
    } else if (!nested && /^--(?=\s|$)/.test(rest) && (i === 0 || /\s/.test(source[i - 1]))) {
      flush();
      nodes.push({ type: "column" });
      i += 2;
    } else if (atWordStart(i) && (match = ROLE.exec(rest))) {
      flush();
      let open = i + match[0].length;
      let directives = [];
      if (source[open] === ":") ({ directives, open } = readDirectives(source, open, match[1]));
      let inner;
      if (source[open] === "(" || source[open] === '"') {
        const close = source[open] === "(" ? matchingParen(source, open) : closingQuote(source, open);
        if (close < 0) throw new UnclosedRoleError(match[1]);
        inner = source.slice(open + 1, close);
        i = close + 1;
      } else {
        const stop = SHORTHAND_END.exec(source.slice(open));
        const end = stop ? open + stop.index : source.length;
        inner = source.slice(open, end);
        i = end;
      }
      const role = { type: "role", name: match[1], children: parseUiLine(inner, true) };
      if (directives.length) role.directives = directives;
      nodes.push(role);
    } else if ((match = /^\[\[([^[\]\n]+)\]\]/.exec(rest))) {
      flush();
      nodes.push({ type: "button", value: match[1], primary: true });
      i += match[0].length;
    } else if ((match = /^\[([^[\]\n]+)\]/.exec(rest))) {
      flush();
      nodes.push({ type: "button", value: match[1], primary: false });
      i += match[0].length;
    } else if ((match = /^\{([^\s{}][^{}\n]*)\}/.exec(rest))) {
      flush();
      nodes.push({ type: "var", name: match[1] });
      i += match[0].length;
    } else {
      text += source[i];
      i += 1;
    }
  }
  flush();
  return nodes;
}

/**
 * The block as rows: `{ type: "line", nodes }`, `{ type: "gap" }` for a blank
 * line, or `{ type: "error", raw }` for a line that cannot be read. A broken
 * line never hides the lines around it.
 */
export function parseUiBlock(source) {
  const rows = String(source ?? "").split("\n").map((line) => {
    const group = parseGroupLine(line);
    if (group) {
      const row = { type: group.edge === "start" ? "groupStart" : "groupEnd", name: group.name, raw: line };
      // Only an opening marker says when its group appears.
      if (group.edge === "start" && group.directives.length) row.directives = group.directives;
      return row;
    }
    if (!line.trim()) return { type: "gap" };
    try {
      return { type: "line", nodes: parseUiLine(line) };
    } catch (error) {
      if (error instanceof UnclosedRoleError) return { type: "error", raw: line, reason: error.reason };
      throw error;
    }
  });
  return matchGroupRows(rows);
}

/**
 * Pairs the group markers and gives every row its `depth`. A marker with no
 * partner, or one closing another group's name, becomes an error row so the
 * rest of the block still draws.
 */
function matchGroupRows(rows) {
  const open = [];
  rows.forEach((row, index) => {
    if (row.type === "groupStart") {
      open.push(index);
      row.depth = open.length - 1;
      return;
    }
    if (row.type === "groupEnd") {
      // The nearest open group of that name; anything opened inside it was
      // left unclosed and is reported on its own line.
      const at = [...open].reverse().find(start => rows[start].name === row.name);
      if (at === undefined) {
        rows[index] = { type: "error", raw: row.raw, reason: "groupUnopened" };
        return;
      }
      while (open[open.length - 1] !== at) {
        const stray = open.pop();
        rows[stray] = { type: "error", raw: rows[stray].raw, reason: "groupUnclosed" };
      }
      open.pop();
      rows[at].endIndex = index;
      row.depth = open.length;
      row.startIndex = at;
      return;
    }
    row.depth = open.length;
  });
  open.forEach((start) => {
    rows[start] = { type: "error", raw: rows[start].raw, reason: "groupUnclosed" };
  });
  // A row inside a group that turned out to be broken is drawn at the depth
  // the remaining groups give it.
  let depth = 0;
  rows.forEach((row) => {
    if (row.type === "groupStart") {
      row.depth = depth;
      depth += 1;
    } else if (row.type === "groupEnd") {
      depth = Math.max(0, depth - 1);
      row.depth = depth;
    } else {
      row.depth = depth;
    }
  });
  return rows;
}

/**
 * A line's nodes as its columns: `A -- B --- C` is `[[A], [B, spacer, C]]`,
 * and a line starting with `--` has an empty first column.
 */
export function splitUiColumns(nodes) {
  const columns = [[]];
  nodes.forEach((node) => {
    if (node.type === "column") columns.push([]);
    else columns[columns.length - 1].push(node);
  });
  return columns;
}

/** How many columns the block needs: the most any of its lines uses. */
export function countUiColumns(rows) {
  return rows.reduce((most, row) => (
    row.type === "line" ? Math.max(most, splitUiColumns(row.nodes).length) : most
  ), 1);
}

/** True when a `---` sits somewhere inside, so the piece must stretch. */
export function hasSpacer(nodes) {
  return nodes.some((node) => node.type === "spacer" || (node.type === "role" && hasSpacer(node.children)));
}
