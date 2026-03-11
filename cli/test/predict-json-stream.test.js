const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('predict --json-stream support', () => {
  it('wrapWithJsonStream returns a JsonStreamEmitter', () => {
    const { wrapWithJsonStream } = require('../lib/predict.js');
    const lines = [];
    const emitter = wrapWithJsonStream((line) => lines.push(line));

    assert.ok(emitter);
    assert.strictEqual(typeof emitter.runStart, 'function');
    assert.strictEqual(typeof emitter.stepStart, 'function');
    assert.strictEqual(typeof emitter.stepDone, 'function');
    assert.strictEqual(typeof emitter.runDone, 'function');
    assert.strictEqual(typeof emitter.runError, 'function');
  });

  it('mirofish.js parses --json-stream flag', () => {
    // Verify the flag exists in help text
    const fs = require('fs');
    const cliSource = fs.readFileSync(require.resolve('../bin/mirofish.js'), 'utf-8');
    assert.ok(cliSource.includes('--json-stream'), 'CLI should document --json-stream flag');
  });
});
