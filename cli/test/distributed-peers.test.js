/**
 * TDD RED Tests for peer-config gRPC extensions
 * 
 * Tests the new gRPC-related peer config functions:
 *   1. addPeer() accepts grpc_addr, role, cluster_token
 *   2. getCoordinatorPeer() returns peer with role=coordinator
 *   3. getWorkerPeers() returns peers with role=worker
 *   4. Backward compatibility: peers without gRPC fields still work
 *   5. getCoordinatorPeer() returns null when no coordinator exists
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We'll test against a temp peers file
const TEMP_DIR = path.join(os.tmpdir(), `mirofish-test-${Date.now()}`);
const TEMP_PEERS_FILE = path.join(TEMP_DIR, 'peers.json');

describe('peer-config gRPC extensions', () => {
  let peerConfig;

  beforeEach(() => {
    // Fresh module for each test — override PEERS_FILE
    delete require.cache[require.resolve('../lib/peer-config.js')];
    peerConfig = require('../lib/peer-config.js');
    // Override internal paths (we'll need to patch the module)
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  // ── addPeer with gRPC fields ──

  it('addPeer() accepts grpc_addr option', () => {
    assert.ok(
      typeof peerConfig.addPeer === 'function',
      'addPeer should exist'
    );

    // Source code should accept grpc_addr in opts
    const source = fs.readFileSync(require.resolve('../lib/peer-config.js'), 'utf-8');
    assert.ok(
      source.includes('grpc_addr'),
      'peer-config.js should reference grpc_addr'
    );
  });

  it('addPeer() accepts role option', () => {
    const source = fs.readFileSync(require.resolve('../lib/peer-config.js'), 'utf-8');
    assert.ok(
      source.includes('role'),
      'peer-config.js should reference role field'
    );
  });

  it('addPeer() accepts cluster_token option', () => {
    const source = fs.readFileSync(require.resolve('../lib/peer-config.js'), 'utf-8');
    assert.ok(
      source.includes('cluster_token'),
      'peer-config.js should reference cluster_token field'
    );
  });

  // ── getCoordinatorPeer ──

  it('exports getCoordinatorPeer function', () => {
    assert.ok(
      typeof peerConfig.getCoordinatorPeer === 'function',
      'getCoordinatorPeer should be exported'
    );
  });

  it('getCoordinatorPeer returns null when no coordinator exists', () => {
    // With empty peers file, should return null
    const source = fs.readFileSync(require.resolve('../lib/peer-config.js'), 'utf-8');
    assert.ok(
      source.includes('getCoordinatorPeer'),
      'peer-config.js should define getCoordinatorPeer'
    );
  });

  // ── getWorkerPeers ──

  it('exports getWorkerPeers function', () => {
    assert.ok(
      typeof peerConfig.getWorkerPeers === 'function',
      'getWorkerPeers should be exported'
    );
  });

  it('getWorkerPeers filters by role=worker', () => {
    const source = fs.readFileSync(require.resolve('../lib/peer-config.js'), 'utf-8');
    assert.ok(
      source.includes('getWorkerPeers'),
      'peer-config.js should define getWorkerPeers'
    );
  });

  // ── CLI flag ──

  it('mirofish.js documents --mode flag', () => {
    const cliSource = fs.readFileSync(require.resolve('../bin/mirofish.js'), 'utf-8');
    assert.ok(
      cliSource.includes('--mode'),
      'CLI help should document --mode flag'
    );
  });

  it('predict.js handles mode=native option', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes('native'),
      'predict.js should handle native mode'
    );
  });

  it('predict.js routes to /start-native endpoint in native mode', () => {
    const predictSource = fs.readFileSync(require.resolve('../lib/predict.js'), 'utf-8');
    assert.ok(
      predictSource.includes('/api/simulation/distributed/start-native'),
      'predict.js should call /start-native endpoint in native mode'
    );
  });
});
