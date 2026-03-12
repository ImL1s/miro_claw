/**
 * json-stream.js 單元測試
 *
 * 測試 NDJSON event protocol 的 emitter 與 parser。
 * 使用 node:test runner (Node 18+)。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { JsonStreamEmitter, parseNDJSON, STEP_NAMES } = require('../lib/json-stream.js');

describe('JsonStreamEmitter', () => {
    it('emits run:start with runId, payloadVersion, totalSteps', () => {
        const lines = [];
        const emitter = new JsonStreamEmitter((line) => lines.push(line));

        emitter.runStart({ topic: 'Bitcoin 150k scenario' });

        assert.strictEqual(lines.length, 1);
        const evt = JSON.parse(lines[0]);
        assert.strictEqual(evt.event, 'run:start');
        assert.strictEqual(evt.topic, 'Bitcoin 150k scenario');
        assert.strictEqual(evt.payloadVersion, 1);
        assert.strictEqual(evt.totalSteps, 7);
        assert.ok(evt.runId, 'should have a runId');
        assert.ok(evt.ts, 'should have a timestamp');
        // runId should be a valid UUID v4 format
        assert.match(evt.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        // runId getter should match
        assert.strictEqual(emitter.runId, evt.runId);
    });

    it('emits step:start, step:progress, step:done in sequence', () => {
        const lines = [];
        const emitter = new JsonStreamEmitter((line) => lines.push(line));
        emitter.runStart({ topic: 'test' });
        const runId = emitter.runId;

        emitter.stepStart(0, 'ontology_extraction');
        emitter.stepProgress(0, 0.5, 'Extracting entities...');
        emitter.stepDone(0, { ontologyId: 'ont_123' });

        assert.strictEqual(lines.length, 4); // run:start + 3 step events

        const start = JSON.parse(lines[1]);
        assert.strictEqual(start.event, 'step:start');
        assert.strictEqual(start.step, 0);
        assert.strictEqual(start.name, 'ontology_extraction');
        assert.strictEqual(start.runId, runId);

        const progress = JSON.parse(lines[2]);
        assert.strictEqual(progress.event, 'step:progress');
        assert.strictEqual(progress.step, 0);
        assert.strictEqual(progress.progress, 0.5);
        assert.strictEqual(progress.message, 'Extracting entities...');
        assert.strictEqual(progress.runId, runId);

        const done = JSON.parse(lines[3]);
        assert.strictEqual(done.event, 'step:done');
        assert.strictEqual(done.step, 0);
        assert.deepStrictEqual(done.result, { ontologyId: 'ont_123' });
        assert.strictEqual(done.runId, runId);
    });

    it('emits run:done with reportId and simId', () => {
        const lines = [];
        const emitter = new JsonStreamEmitter((line) => lines.push(line));
        emitter.runStart({ topic: 'test' });

        emitter.runDone({ reportId: 'rpt_456', simId: 'sim_789' });

        assert.strictEqual(lines.length, 2);
        const evt = JSON.parse(lines[1]);
        assert.strictEqual(evt.event, 'run:done');
        assert.strictEqual(evt.reportId, 'rpt_456');
        assert.strictEqual(evt.simId, 'sim_789');
        assert.strictEqual(evt.runId, emitter.runId);
    });

    it('emits run:error with step and error message', () => {
        const lines = [];
        const emitter = new JsonStreamEmitter((line) => lines.push(line));
        emitter.runStart({ topic: 'test' });

        emitter.runError(3, 'TIMEOUT', 'Simulation timed out after 5 minutes');

        assert.strictEqual(lines.length, 2);
        const evt = JSON.parse(lines[1]);
        assert.strictEqual(evt.event, 'run:error');
        assert.strictEqual(evt.step, 3);
        assert.strictEqual(evt.error, 'TIMEOUT');
        assert.strictEqual(evt.message, 'Simulation timed out after 5 minutes');
        assert.strictEqual(evt.runId, emitter.runId);
    });
});

describe('STEP_NAMES', () => {
    it('has exactly 7 step names', () => {
        assert.strictEqual(STEP_NAMES.length, 7);
        assert.deepStrictEqual(STEP_NAMES, [
            'ontology_extraction',
            'graph_build',
            'simulation_create',
            'simulation_prepare',
            'simulation_start',
            'simulation_poll',
            'report_generate',
        ]);
    });
});

describe('parseNDJSON', () => {
    it('parses buffered chunks correctly', () => {
        const events = [];
        const parser = parseNDJSON((evt) => events.push(evt));

        // Simulate chunked input that splits across line boundaries
        const line1 = JSON.stringify({ event: 'run:start', runId: 'abc' });
        const line2 = JSON.stringify({ event: 'step:start', step: 0 });

        // Feed in chunks that split mid-line
        const full = line1 + '\n' + line2 + '\n';
        const mid = Math.floor(full.length / 2);
        parser.feed(full.slice(0, mid));
        parser.feed(full.slice(mid));

        assert.strictEqual(events.length, 2);
        assert.strictEqual(events[0].event, 'run:start');
        assert.strictEqual(events[0].runId, 'abc');
        assert.strictEqual(events[1].event, 'step:start');
        assert.strictEqual(events[1].step, 0);
    });

    it('ignores non-JSON lines', () => {
        const events = [];
        const parser = parseNDJSON((evt) => events.push(evt));

        const input = [
            '🔍 Extracting ontology...',
            JSON.stringify({ event: 'step:start', step: 0 }),
            '  ✅ Done in 3.2s',
            '',
            '>>> some debug output',
            JSON.stringify({ event: 'step:done', step: 0, result: {} }),
            'All finished!',
        ].join('\n') + '\n';

        parser.feed(input);

        assert.strictEqual(events.length, 2);
        assert.strictEqual(events[0].event, 'step:start');
        assert.strictEqual(events[1].event, 'step:done');
    });

    it('handles incomplete trailing data without emitting', () => {
        const events = [];
        const parser = parseNDJSON((evt) => events.push(evt));

        // Feed a partial line (no trailing newline)
        parser.feed('{"event":"run:sta');
        assert.strictEqual(events.length, 0);

        // Complete the line
        parser.feed('rt","runId":"x"}\n');
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].event, 'run:start');
    });
});
