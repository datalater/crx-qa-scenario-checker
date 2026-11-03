import { clampScale, fitScale, scaleAfterWheel, scrollAfterZoom } from '../src/diagram-zoom.js';
import { assertEqual, test } from './lib/test-runner.mjs';

test('scale stays within limits', () => {
    assertEqual(clampScale(0.01), 0.25);
    assertEqual(clampScale(99), 3);
    assertEqual(clampScale(1.5), 1.5);
});

test('fit shrinks a large diagram to the box and never enlarges a small one', () => {
    assertEqual(fitScale({ width: 400, height: 200 }, { width: 200, height: 400 }), 0.5);
    assertEqual(fitScale({ width: 400, height: 800 }, { width: 400, height: 400 }), 0.5);
    assertEqual(fitScale({ width: 100, height: 50 }, { width: 400, height: 400 }), 1);
    assertEqual(fitScale({ width: 10000, height: 50 }, { width: 100, height: 400 }), 0.25);
});

test('zooming keeps the point under the pointer in place', () => {
    const next = scrollAfterZoom({ scrollLeft: 100, scrollTop: 40 }, { x: 50, y: 20 }, 1, 2);
    // content point (150, 60) moves to (300, 120); the pointer is still at (50, 20) on screen.
    assertEqual(next.scrollLeft, 250);
    assertEqual(next.scrollTop, 100);
});

test('wheel up zooms in, wheel down zooms out', () => {
    assertEqual(scaleAfterWheel(1, -10) > 1, true);
    assertEqual(scaleAfterWheel(1, 10) < 1, true);
});
