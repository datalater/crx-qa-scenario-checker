/**
 * The ```ui block: a rough picture of a screen area written as text, where
 * each piece of content carries the role it plays.
 *
 *   @title(시간표 설정) --- @cta([삭제])
 *
 *   @role(content)   the role covers what is inside the parentheses
 *   @role"content"   the same with quotes, for content that has parentheses
 *   @role content    without either: up to the next @role, a `---`, or the line end
 *   ---              pushes what follows to the far side of the line
 *   [text]           a button; [[text]] an emphasized one
 *   {name}           a value filled in later
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
  ["---", "뒤따르는 내용을 줄의 반대쪽 끝으로 밀기"],
  ["[버튼]", "버튼"],
  ["[[버튼]]", "강조 버튼"],
  ["{변수}", "나중에 값이 들어갈 자리"],
  ["빈 줄", "세로 간격"],
  ['\\) \\" \\@ \\[', "기호를 글자 그대로 쓰기"],
];

const ROLE = /^@([A-Za-z][\w-]*)/;
const SHORTHAND_END = /(^|\s)(@[A-Za-z]|---(\s|$))/;

/** Thrown for a `@role(` or `@role"` whose closing mark is missing. */
export class UnclosedRoleError extends Error {}

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
 * One line as nodes:
 *   { type: "text", value } | { type: "button", value, primary } |
 *   { type: "var", name } | { type: "spacer" } | { type: "role", name, children }
 */
export function parseUiLine(source) {
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
    } else if (atWordStart(i) && (match = ROLE.exec(rest))) {
      flush();
      const open = i + match[0].length;
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
      nodes.push({ type: "role", name: match[1], children: parseUiLine(inner) });
    } else if ((match = /^\[\[([^[\]\n]+)\]\]/.exec(rest))) {
      flush();
      nodes.push({ type: "button", value: match[1], primary: true });
      i += match[0].length;
    } else if ((match = /^\[([^[\]\n]+)\]/.exec(rest))) {
      flush();
      nodes.push({ type: "button", value: match[1], primary: false });
      i += match[0].length;
    } else if ((match = /^\{([A-Za-z][\w.-]*)\}/.exec(rest))) {
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
      if (error instanceof UnclosedRoleError) return { type: "error", raw: line };
      throw error;
    }
  });
}

/** True when a `---` sits somewhere inside, so the piece must stretch. */
export function hasSpacer(nodes) {
  return nodes.some((node) => node.type === "spacer" || (node.type === "role" && hasSpacer(node.children)));
}
