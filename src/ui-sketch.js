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
  ['\\) \\" \\@ \\[', "기호를 글자 그대로 쓰기"],
];

const ROLE = /^@([A-Za-z][\w-]*)/;
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
};

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
    if (text.trim()) nodes.push({ type: "text", value: text.trim() });
    text = "";
  };
  const atWordStart = (i) => i === 0 || /[\s(]/.test(source[i - 1]);

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let match;
    if (source[i] === "\\" && i + 1 < source.length) {
      text += source[i + 1];
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
  return String(source ?? "").split("\n").map((line) => {
    if (!line.trim()) return { type: "gap" };
    try {
      return { type: "line", nodes: parseUiLine(line) };
    } catch (error) {
      if (error instanceof UnclosedRoleError) return { type: "error", raw: line, reason: error.reason };
      throw error;
    }
  });
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
