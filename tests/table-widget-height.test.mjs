import { mappedTableWidgetHeights } from '../src/table-widget-height.js';
import { assertEqual, test } from './lib/test-runner.mjs';

class TableWidget { constructor(height) { this.height = height; } }

test('table height estimates follow mapped positions through document changes', () => {
    const previous = { between(from, to, callback) {
        assertEqual(from, 0);
        assertEqual(to, 100);
        callback(10, 30, { spec: { widget: new TableWidget(536) } });
        callback(40, 60, { spec: { widget: new TableWidget(-1) } });
        callback(70, 80, { spec: { widget: {} } });
    } };
    const changes = { length: 100, mapPos(pos, assoc) { assertEqual(assoc, -1); return pos + 5; } };
    const heights = mappedTableWidgetHeights(previous, changes, TableWidget);
    assertEqual(heights.get(15), 536);
    assertEqual(heights.size, 1);
    assertEqual(mappedTableWidgetHeights(null, changes, TableWidget).size, 0);
});
