/**
 * Draws a ui block (syntax: src/ui-sketch.js) as HTML. The same markup is
 * used by the live markdown widget and by the table cells, so a sketch looks
 * the same wherever it is written. Styles: styles/feature-ui-sketch.css.
 */
import { UI_ERROR_MESSAGES, countUiColumns, hasSpacer, parseUiBlock, splitUiColumns } from '../src/ui-sketch.js';

const escapeHtml = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const renderDirectives = directives => (directives || [])
    .map(directive => `<span class="ui-sketch__directive">${escapeHtml(directive)}</span>`)
    .join('');

function renderNode(node) {
    if (node.type === 'text') return `<span class="ui-sketch__text">${escapeHtml(node.value)}</span>`;
    if (node.type === 'spacer') return '<span class="ui-sketch__spacer"></span>';
    if (node.type === 'var') return `<span class="ui-sketch__var">${escapeHtml(node.name)}</span>`;
    if (node.type === 'button') {
        return `<span class="ui-sketch__button${node.primary ? ' is-primary' : ''}">${escapeHtml(node.value)}</span>`;
    }
    const classes = ['ui-sketch__role'];
    if (hasSpacer(node.children)) classes.push('has-spacer');
    if (node.children.some(child => child.type === 'role')) classes.push('is-group');
    // A directive says when or in what state the role appears; it sits beside
    // the name, set apart from it.
    const directives = renderDirectives(node.directives);
    return `<span class="${classes.join(' ')}">`
        + `<span class="ui-sketch__role-name">${escapeHtml(node.name)}${directives}</span>`
        + `<span class="ui-sketch__role-body">${node.children.map(renderNode).join('')}</span></span>`;
}

/**
 * The block is one grid, so a column starts at the same place on every line.
 * Each line's last column runs to the right edge: a line without any `--`
 * takes the full width, and `---` inside it still reaches the far side.
 *
 * A group is drawn as a frame behind the rows it holds, laid out in the same
 * grid, so the columns of its lines stay aligned with the rest of the block.
 */
export function renderUiSketchHtml(source) {
    const rows = parseUiBlock(source);
    const columnCount = countUiColumns(rows);
    const depth = rows.reduce((most, row) => Math.max(most, row.depth || 0), 0);
    // Frames come first so the lines are drawn over them.
    const frames = rows.map((row, index) => (row.type === 'groupStart' && row.endIndex !== undefined
        ? `<div class="ui-sketch__group" style="grid-row:${index + 1} / ${row.endIndex + 2};`
            + `grid-column:1 / -1;--ui-sketch-group-depth:${row.depth}"></div>`
        : '')).join('');
    const cells = rows.map((row, index) => {
        const gridRow = index + 1;
        if (row.type === 'groupStart') {
            return `<div class="ui-sketch__group-name" style="grid-row:${gridRow};grid-column:1 / -1">`
                + `${escapeHtml(row.name)}${renderDirectives(row.directives)}</div>`;
        }
        // The closing line is the frame's bottom edge and holds nothing.
        if (row.type === 'groupEnd') {
            return `<div class="ui-sketch__group-foot" style="grid-row:${gridRow};grid-column:1 / -1"></div>`;
        }
        if (row.type === 'gap') {
            return `<div class="ui-sketch__gap" style="grid-row:${gridRow};grid-column:1 / -1"></div>`;
        }
        if (row.type === 'error') {
            const message = escapeHtml(UI_ERROR_MESSAGES[row.reason] || UI_ERROR_MESSAGES.unclosed);
            return `<div class="ui-sketch__error" style="grid-row:${gridRow};grid-column:1 / -1"`
                + ` title="${message}" data-message="${message}">${escapeHtml(row.raw)}</div>`;
        }
        const columns = splitUiColumns(row.nodes);
        // On a line with a role, content without one sits below the level of
        // the role names, in whichever column it is.
        const lineClass = row.nodes.some(node => node.type === 'role') ? 'ui-sketch__line has-role' : 'ui-sketch__line';
        return columns.map((nodes, column) => {
            const gridColumn = column === columns.length - 1 ? `${column + 1} / -1` : String(column + 1);
            return `<div class="${lineClass}" style="grid-row:${gridRow};grid-column:${gridColumn}">`
                + `${nodes.map(renderNode).join('')}</div>`;
        }).join('');
    }).join('');
    // Every column but the last is as wide as its widest content.
    const template = `${'max-content '.repeat(columnCount - 1)}minmax(0, 1fr)`;
    return `<div class="ui-sketch" style="grid-template-columns:${template};--ui-sketch-depth:${depth}">`
        + `${frames}${cells}</div>`;
}

// A whole-line ```ui fence and its closing ```.
const UI_FENCE = /(?<=^|\n)```ui[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;

/**
 * Cell text as `{ type: 'text', value }` and `{ type: 'ui', source }` pieces
 * in order. A fence that is never closed stays text. The line break on either
 * side of a fence belongs to it, so the drawing leaves no empty line around.
 */
export function splitUiFences(text) {
    const input = String(text ?? '');
    const pieces = [];
    let cursor = 0;
    const pushText = (from, to) => {
        let value = input.slice(from, to);
        if (from > 0 && value.startsWith('\n')) value = value.slice(1);
        if (to < input.length && value.endsWith('\n')) value = value.slice(0, -1);
        if (value) pieces.push({ type: 'text', value });
    };
    for (const match of input.matchAll(UI_FENCE)) {
        pushText(cursor, match.index);
        pieces.push({ type: 'ui', source: match[1] });
        cursor = match.index + match[0].length;
    }
    pushText(cursor, input.length);
    return pieces;
}

/** True when `position` is inside a ```ui fence of `text` (closed or not). */
export function isInsideUiFence(text, position) {
    let inside = false;
    String(text ?? '').slice(0, position).split('\n').slice(0, -1).forEach((line) => {
        if (!inside && /^```ui[ \t]*$/.test(line)) inside = true;
        else if (inside && /^```[ \t]*$/.test(line)) inside = false;
    });
    return inside;
}
