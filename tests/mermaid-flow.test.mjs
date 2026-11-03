import { parse, register } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import {
    addEdge,
    addNode,
    analyzeFlowchart,
    deleteNode,
    joinFence,
    nextNodeId,
    serializeFlowchart,
    setDirection,
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
    assertEqual(analyze('flowchart TD\n  A --> B\n  classDef x fill:#f00\n  class A x').editable, false);
    assertEqual(analyze('flowchart TD\n  A --> B\n  style A fill:#f00').editable, false);
    assertEqual(analyze('sequenceDiagram\n  A->>B: hi').editable, false);
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
