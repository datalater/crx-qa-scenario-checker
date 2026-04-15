const tests = [];

export function test(name, fn) {
    tests.push({ name, fn });
}

export function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

export function assertEqual(actual, expected, message = 'Values are not equal') {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

export async function run() {
    const startedAt = Date.now();
    let passed = 0;
    let failed = 0;

    for (const item of tests) {
        try {
            await item.fn();
            passed += 1;
            console.log(`PASS ${item.name}`);
        } catch (error) {
            failed += 1;
            console.error(`FAIL ${item.name}`);
            console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const elapsedMs = Date.now() - startedAt;
    const total = passed + failed;
    const summary = `RESULT total=${total} passed=${passed} failed=${failed} durationMs=${elapsedMs}`;

    if (failed > 0) {
        console.error(summary);
        process.exitCode = 1;
        return;
    }

    console.log(summary);
}
