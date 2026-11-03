import { parse, register } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import {
    addEdge,
    addNode,
    analyzeFlowchart,
    deleteEdge,
    deleteNode,
    joinFence,
    nextNodeId,
    serializeFlowchart,
    setDirection,
    setTitle,
    titleOf,
    splitFence,
    updateEdge,
    updateNode
} from '../src/mermaid-flow.js';
import { assertDeepEqual, assertEqual, test } from './lib/test-runner.mjs';

register(flowchart);
const analyze = (source) => analyzeFlowchart(source, parse);

test('a plain flowchart is editable and reads shapes, labels and edge styles', () => {
    const { model, editable } = analyze('flowchart LR\n  A[시작] -->|네| B(둥근)\n  B -.-> C{분기}\n  C ==> D((원))\n  D --- A');
    assertEqual(editable, true);
    assertEqual(model.direction, 'LR');
    assertDeepEqual(model.nodes.map((n) => [n.id, n.text, n.shape]), [
        ['A', '시작', 'square'], ['B', '둥근', 'round'], ['C', '분기', 'diamond'], ['D', '원', 'circle']
    ]);
    assertDeepEqual(model.edges.map((e) => [e.from, e.to, e.text, e.style]), [
        ['A', 'B', '네', '-->'], ['B', 'C', '', '-.->'], ['C', 'D', '', '==>'], ['D', 'A', '', '---']
    ]);
});

test('serializing reads back as the same diagram', () => {
    const first = analyze('graph TB\n  A --> B\n  B -- 아니오 --> C[끝]');
    const again = analyze(serializeFlowchart(first.model));
    assertEqual(again.editable, true);
    assertDeepEqual(again.model.nodes, first.model.nodes);
    assertDeepEqual(again.model.edges.map(({ id, ...rest }) => rest), first.model.edges.map(({ id, ...rest }) => rest));
});

test('quotes in labels survive a round trip', () => {
    const { model } = analyze('flowchart TD\n  A["말 #quot;인용#quot;"] --> B');
    assertEqual(model.nodes[0].text, '말 "인용"');
    assertEqual(analyze(serializeFlowchart(model)).model.nodes[0].text, '말 "인용"');
});

test('syntax the model cannot hold is not GUI-editable', () => {
    assertEqual(analyze('flowchart TD\n  subgraph S\n    A --> B\n  end').editable, false);
    assertEqual(analyze('flowchart TD\n  subgraph S\n    A --> B\n  end\n  classDef x fill:#f00').editable, false);
    assertEqual(analyze('sequenceDiagram\n  A->>B: hi').editable, false);
});

const STYLED = [
    '---',
    'title: 상태 전이',
    '---',
    '%% 주석',
    'flowchart LR',
    '  A["초안"]:::ok --> B["검토"]',
    '  B --> C',
    '  C --> D',
    '  classDef ok fill:#1f6f43,stroke:#3fb950',
    '  style C fill:#333,stroke:#f00',
    '  linkStyle 1 stroke:#f00',
    '  linkStyle 2 stroke:#00f',
    '  click A "https://example.com" "tip"',
    '  class B ok'
].join('\n');

test('styling, classes, links, comments and front matter no longer switch editing off', () => {
    const result = analyze(STYLED);
    assertEqual(result.editable, true);
    assertDeepEqual(result.model.preamble, ['---', 'title: 상태 전이', '---', '%% 주석']);
    assertEqual(result.model.extras.length, 6);
    assertEqual(result.model.nodes[0].className, 'ok');
});

test('edits keep the passthrough lines and read back as the same styled diagram', () => {
    let { model } = analyze(STYLED);
    model = updateNode(model, 'A', { text: '초안 (수정)' });
    model = addNode(model, { from: 'D' }).model;
    const source = serializeFlowchart(model);
    assertEqual(source.startsWith('---\ntitle: 상태 전이\n---\n%% 주석\nflowchart LR'), true);
    assertEqual(source.includes('  A["초안 (수정)"]:::ok'), true);
    for (const line of model.extras) assertEqual(source.includes(`  ${line}`), true);
    assertEqual(analyze(source).editable, true);
});

test('deleting a node drops the style lines that name it', () => {
    const { model } = analyze(STYLED);
    const afterC = deleteNode(model, 'C');
    assertEqual(afterC.extras.some((line) => line.startsWith('style C')), false);
    // C had edges 1 and 2: both linkStyle lines go, nothing is renumbered onto the wrong edge.
    assertEqual(afterC.extras.some((line) => line.startsWith('linkStyle')), false);
    const afterA = deleteNode(model, 'A');
    assertEqual(afterA.extras.some((line) => line.startsWith('click A')), false);
    assertEqual(afterA.extras.includes('class B ok'), true);
    // a `class` line naming several nodes only loses the deleted one
    const shared = analyze('flowchart TD\n  A --> B\n  classDef x fill:#f00\n  class A,B x').model;
    assertDeepEqual(deleteNode(shared, 'A').extras, ['classDef x fill:#f00', 'class B x']);
});

test('deleting an edge renumbers linkStyle so each style stays on its edge', () => {
    const { model } = analyze(STYLED);
    const next = deleteEdge(model, 0);
    assertDeepEqual(next.extras.filter((line) => line.startsWith('linkStyle')), ['linkStyle 0 stroke:#f00', 'linkStyle 1 stroke:#00f']);
    assertEqual(analyze(serializeFlowchart(next)).editable, true);
    const mid = deleteEdge(model, 1);
    assertDeepEqual(mid.extras.filter((line) => line.startsWith('linkStyle')), ['linkStyle 1 stroke:#00f']);
});

test('an id that merely starts with a keyword is a node, not a passthrough line', () => {
    const { model, editable } = analyze('flowchart TD\n  classA --> styleB');
    assertEqual(editable, true);
    assertEqual(model.nodes.length, 2);
    assertEqual(model.extras.length, 0);
});

test('a source pele cannot parse reports an error', () => {
    const result = analyze('flowchart TD\n  A -->');
    assertEqual(result.editable, false);
    assertEqual(typeof result.error, 'string');
});

test('edits return new models', () => {
    let { model } = analyze('flowchart TD\n  A --> B');
    assertEqual(nextNodeId(model), 'C');
    const added = addNode(model, { from: 'B' });
    assertEqual(added.id, 'C');
    assertEqual(added.model.edges.length, 2);
    assertEqual(model.nodes.length, 2);
    model = addEdge(added.model, 'C', 'A');
    model = updateNode(model, 'C', { text: '분기', shape: 'diamond' });
    model = updateEdge(model, 1, { text: '예' });
    const source = serializeFlowchart(setDirection(model, 'LR'));
    assertEqual(source, [
        'flowchart LR', '  A', '  B', '  C{"분기"}', '  A --> B', '  B --> C', '  C --> A'
    ].join('\n').replace('  B --> C', '  B -->|"예"| C'));
    assertEqual(analyze(source).editable, true);
    const pruned = deleteNode(model, 'B');
    assertDeepEqual(pruned.edges.map((e) => [e.from, e.to]), [['C', 'A']]);
});

test('ids run A..Z, then N1, N2', () => {
    const nodes = Array.from({ length: 26 }, (_, i) => ({ id: String.fromCharCode(65 + i), text: '', shape: 'square' }));
    assertEqual(nextNodeId({ nodes }), 'N1');
    assertEqual(nextNodeId({ nodes: [...nodes, { id: 'N1' }] }), 'N2');
});

test('fence text splits into info and inner source', () => {
    assertDeepEqual(splitFence('```mermaid\nflowchart TD\n  A --> B\n```'), { info: 'mermaid', inner: 'flowchart TD\n  A --> B' });
    assertDeepEqual(splitFence('```mermaid\nflowchart TD'), { info: 'mermaid', inner: 'flowchart TD' });
    assertEqual(splitFence('  ```mermaid\nx\n```'), null);
    assertEqual(joinFence('flowchart TD'), '```mermaid\nflowchart TD\n```');
});

const withPreamble = (preamble) => ({ preamble, direction: 'TD', nodes: [], edges: [], extras: [] });

test('the title is read from the front matter', () => {
    assertEqual(titleOf(withPreamble([])), '');
    assertEqual(titleOf(withPreamble(['---', 'title: 주문 흐름', '---'])), '주문 흐름');
    assertEqual(titleOf(withPreamble(['---', 'title: "a: b #c"', '---'])), 'a: b #c');
    assertEqual(titleOf(withPreamble(['---', "title: 'it''s'", '---'])), "it's");
    assertEqual(titleOf(withPreamble(['---', 'config:', '  theme: dark', '---'])), '');
    assertEqual(titleOf(withPreamble(['---', 'title: |', '  long', '---'])), null);
});

test('setting a title adds, replaces and removes only the title line', () => {
    assertDeepEqual(setTitle(withPreamble([]), '새 제목').preamble, ['---', 'title: 새 제목', '---']);
    // directives and comments stay, and front matter has to come first
    assertDeepEqual(
        setTitle(withPreamble(['%%{init: {"theme":"dark"}}%%', '%% 메모']), '제목').preamble,
        ['---', 'title: 제목', '---', '%%{init: {"theme":"dark"}}%%', '%% 메모']
    );
    const withConfig = withPreamble(['---', 'config:', '  theme: dark', '---']);
    assertDeepEqual(setTitle(withConfig, 'T').preamble, ['---', 'title: T', 'config:', '  theme: dark', '---']);
    assertDeepEqual(setTitle(setTitle(withConfig, 'T'), '바뀜').preamble, ['---', 'title: 바뀜', 'config:', '  theme: dark', '---']);
    assertDeepEqual(setTitle(setTitle(withConfig, 'T'), '').preamble, withConfig.preamble);
    assertDeepEqual(setTitle(withPreamble(['---', 'title: x', '---']), '').preamble, []);
});

test('titles that YAML would misread are quoted, and read back unchanged', () => {
    for (const title of ['a: b', '# 샵', 'say "hi"', '- 목록', 'back\\slash', '[대괄호]']) {
        const model = setTitle(withPreamble([]), title);
        assertEqual(titleOf(model), title);
    }
    assertEqual(setTitle(withPreamble([]), '평범한 제목').preamble[1], 'title: 평범한 제목');
    assertEqual(setTitle(withPreamble([]), '줄\n바꿈').preamble[1], 'title: 줄 바꿈');
});

test('a diagram with a new title still reads as the same diagram', () => {
    const { model } = analyze('flowchart TD\n  A --> B');
    const source = serializeFlowchart(setTitle(model, '주문: 흐름'));
    const again = analyze(source);
    assertEqual(again.editable, true);
    assertEqual(titleOf(again.model), '주문: 흐름');
    assertEqual(parse(source).title, '주문: 흐름');
});
