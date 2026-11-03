import { render, register } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import { exportSvg } from '../src/diagram-export.js';
import { assertEqual, test } from './lib/test-runner.mjs';

register(flowchart);
const { svg } = render('flowchart TD\n  A["시작"] -->|"네"| B', { fontSize: 13 });

test('exported svg carries its palette and no pele variable fallbacks', () => {
    const dark = exportSvg(svg, 'dark');
    assertEqual(/var\(--pele-/.test(dark), false);
    assertEqual(dark.includes('--_bg:#0d1117'), true);
    assertEqual(exportSvg(svg, 'light').includes('--_bg:#ffffff'), true);
});

test('exported svg paints a background the size of its viewBox', () => {
    const match = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const out = exportSvg(svg, 'dark');
    assertEqual(out.includes(`<rect x="0" y="0" width="${match[1]}" height="${match[2]}" fill="#0d1117"/>`), true);
    assertEqual(out.includes('max-width:100%'), false);
});

test('exported svg is still one svg element with a quoted font stack', () => {
    const out = exportSvg(svg);
    assertEqual(out.startsWith('<svg '), true);
    assertEqual(out.endsWith('</svg>'), true);
    assertEqual(/font-family:[^"]*&quot;Apple SD Gothic Neo&quot;/.test(out), true);
});
