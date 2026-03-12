import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  STEP_NAMES,
  TOTAL_STEPS,
  EVENTS,
  PAYLOAD_VERSION,
  DEFAULTS,
  POLL_INTERVAL,
  REPORT_POLL_INTERVAL,
  MAX_POLL_MINUTES,
  SEED_EXPAND_THRESHOLD,
} from '../index.js';
import type { RunEvent, RunStatus, PredictionResult } from '../index.js';

describe('@mirofish/core', () => {
  it('STEP_NAMES has TOTAL_STEPS + 1 entries (0-indexed placeholder)', () => {
    assert.strictEqual(STEP_NAMES.length, TOTAL_STEPS + 1);
    assert.strictEqual(STEP_NAMES[0], 'unused');
    assert.strictEqual(STEP_NAMES[1], 'ontology_extraction');
    assert.strictEqual(STEP_NAMES[7], 'report_generate');
  });

  it('EVENTS has all expected event names', () => {
    assert.strictEqual(EVENTS.RUN_START, 'run:start');
    assert.strictEqual(EVENTS.RUN_DONE, 'run:done');
    assert.strictEqual(EVENTS.RUN_ERROR, 'run:error');
    assert.strictEqual(EVENTS.RUN_CANCELLED, 'run:cancelled');
    assert.strictEqual(EVENTS.STEP_START, 'step:start');
    assert.strictEqual(EVENTS.STEP_PROGRESS, 'step:progress');
    assert.strictEqual(EVENTS.STEP_DONE, 'step:done');
  });

  it('PAYLOAD_VERSION is 1', () => {
    assert.strictEqual(PAYLOAD_VERSION, 1);
  });

  it('DEFAULTS has expected shape', () => {
    assert.strictEqual(DEFAULTS.maxConcurrent, 2);
    assert.ok(DEFAULTS.runTimeout > 0);
    assert.ok(DEFAULTS.dedupeWindow > 0);
    assert.ok(DEFAULTS.idempotencyTTL > 0);
  });

  it('poll constants are positive numbers', () => {
    assert.ok(POLL_INTERVAL > 0);
    assert.ok(REPORT_POLL_INTERVAL > 0);
    assert.ok(MAX_POLL_MINUTES > 0);
    assert.ok(SEED_EXPAND_THRESHOLD > 0);
  });

  it('RunEvent type compiles correctly', () => {
    // Type-level test: verify the union type compiles
    const startEvent: RunEvent = {
      event: 'run:start',
      runId: 'test-123',
      topic: 'test',
      payloadVersion: 1,
      totalSteps: 7,
      ts: Date.now(),
    };
    assert.strictEqual(startEvent.event, 'run:start');

    const doneEvent: RunEvent = {
      event: 'run:done',
      runId: 'test-123',
      reportId: 'rpt-1',
      simId: 'sim-1',
      ts: Date.now(),
    };
    assert.strictEqual(doneEvent.event, 'run:done');
  });

  it('RunStatus and PredictionResult types compile', () => {
    const status: RunStatus = 'running';
    assert.strictEqual(status, 'running');

    const result: PredictionResult = {
      status: 'completed',
      reportId: 'rpt-1',
      simId: 'sim-1',
      topic: 'test',
    };
    assert.strictEqual(result.status, 'completed');
  });
});
