import { getChecklistAlertConfig } from "../modules/checklist-alerts.js";

// Only inline-code nodes are alert tokens; fenced code and plain text stay literal.
export function findAlertTokens(text, tree, { skipTables = false } = {}) {
  const tokens = [];
  tree.iterate({ enter(node) {
    if (skipTables && node.name === "Table") return false;
    if (node.name !== "InlineCode") return;
    const match = /^`([^`\n]+)`$/.exec(text.slice(node.from, node.to));
    const config = match && getChecklistAlertConfig(match[1]);
    if (config) tokens.push({ from: node.from, to: node.to, config });
  } });
  return tokens;
}
