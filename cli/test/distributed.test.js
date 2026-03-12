/**
 * Tests for --distributed flag parsing and predict options routing
 * 
 * RED → GREEN TDD:
 *   1. CLI should document --distributed flag
 *   2. CLI should document --workers flag
 *   3. predict() should accept distributed/workers opts
 *   4. Step 5 should route to distributed endpoint when distributed=true
 *   5. Step 6 should poll distributed status when distributed=true
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

describe('predict --distributed support', () => {
  // ── CLI flag parsing ──

  it('mirofish.js documents --distributed flag', () => {
    const cliSource = fs.readFileSync(require.resolve('../bin/mirofish.js'), 'utf-8');
    assert.ok(
      cliSource.includes('--distributed'),
      'CLI help should document --distributed flag'
    );
  });

  it('mirofish.js documents --workers flag', () => {
    const cliSource = fs.readFileSync(require.resolve('../bin/mirofish.js'), 'utf-8');
    assert.ok(
      cliSource.includes('--workers'),
      'CLI help should document --workers flag'
    );
  });

  it('mirofish.js passes distributed and workers opts to predict()', () => {
    const cliSource = fs.readFileSync(require.resolve('../bin/mirofish.js'), 'utf-8');
    // Verify that distributed: and workers: are passed in the predict() call opts
    assert.ok(
      cliSource.includes("distributed: args.includes('--distributed')"),
      'CLI should pass distributed flag to predict()'
    );
    assert.ok(
      cliSource.includes("workers: flags.workers"),
      'CLI should pass workers count to predict()'
    );
  });

  // ── predict.js routing ──

  it('predict.js accepts distributed and workers options', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes('const distributed = opts.distributed'),
      'predict() should extract distributed from opts'
    );
    assert.ok(
      predictSource.includes('const workers = opts.workers'),
      'predict() should extract workers from opts'
    );
  });

  it('Step 5 routes to distributed endpoint when distributed=true', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes('/api/simulation/distributed/start'),
      'Step 5 should call /api/simulation/distributed/start when distributed'
    );
    assert.ok(
      predictSource.includes('num_workers: workers'),
      'Step 5 should pass num_workers to distributed start endpoint'
    );
  });

  it('Step 6 polls distributed status endpoint when distributed=true', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes('/api/simulation/distributed/status'),
      'Step 6 should call /api/simulation/distributed/status when distributed'
    );
    assert.ok(
      predictSource.includes('progress_percent'),
      'Step 6 should read progress_percent from distributed status response'
    );
  });

  it('Non-distributed mode still uses original endpoints', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes("'/api/simulation/start'"),
      'Non-distributed Step 5 should still use /api/simulation/start'
    );
    assert.ok(
      predictSource.includes('/run-status'),
      'Non-distributed Step 6 should still use /run-status'
    );
  });
});
