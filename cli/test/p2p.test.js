/**
 * p2p.js 單元測試（TDD）
 *
 * 用 mock fetch 測試廣播/收集邏輯，不需要真實 peer
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const peerConfig = require('../lib/peer-config.js');

// --- Mock setup ---
// 存原始 fetch，測完還原
const originalFetch = global.fetch;
let fetchCalls = [];
let fetchResponses = {};

function mockFetch(responses = {}) {
    fetchCalls = [];
    fetchResponses = responses;
    global.fetch = async (url, opts) => {
        fetchCalls.push({ url, opts });
        const key = Object.keys(fetchResponses).find(k => url.includes(k));
        if (key) {
            const resp = fetchResponses[key];
            return {
                ok: resp.ok !== false,
                json: async () => resp.body || {},
            };
        }
        // Default: connection refused
        throw new Error('ECONNREFUSED');
    };
}

function restoreFetch() {
    global.fetch = originalFetch;
}

// Backup and setup test peers
const origPeersFile = peerConfig.PEERS_FILE;
let peersBackup = null;

function setupTestPeers() {
    const dir = path.dirname(origPeersFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(origPeersFile)) {
        peersBackup = fs.readFileSync(origPeersFile, 'utf-8');
    }
    fs.writeFileSync(origPeersFile, '[]');
    peerConfig.addPeer('http://10.0.0.1:5001', 'mock-a');
    peerConfig.addPeer('http://10.0.0.2:5001', 'mock-b');
}

function restoreTestPeers() {
    if (peersBackup !== null) {
        fs.writeFileSync(origPeersFile, peersBackup);
    } else {
        try { fs.unlinkSync(origPeersFile); } catch { }
    }
}

// Fresh require to avoid stale module cache
function loadP2P() {
    delete require.cache[require.resolve('../lib/p2p.js')];
    return require('../lib/p2p.js');
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

async function runTests() {
    console.log('\n🧪 p2p.js tests\n');

    setupTestPeers();

    try {
        const p2p = loadP2P();

        // --- broadcastSeed ---
        await test('broadcastSeed: sends to all healthy peers', async () => {
            mockFetch({
                '/health': { ok: true, body: { status: 'ok' } },
                '/api/p2p/predict': { ok: true, body: { success: true, data: { simulation_id: 'sim_remote' } } },
            });

            const results = await p2p.broadcastSeed('test topic', { rounds: 5 });
            assert.strictEqual(results.length, 2, 'should have 2 results');
            assert.ok(results.every(r => r.success), 'all should succeed');
            // Check that /api/p2p/predict was called
            const predictCalls = fetchCalls.filter(c => c.url.includes('/api/p2p/predict'));
            assert.strictEqual(predictCalls.length, 2);
        });

        await test('broadcastSeed: skips unhealthy peers', async () => {
            let healthCallCount = 0;
            global.fetch = async (url) => {
                fetchCalls.push({ url });
                if (url.includes('/health')) {
                    healthCallCount++;
                    // First peer healthy, second unhealthy
                    if (healthCallCount === 1) return { ok: true, json: async () => ({}) };
                    throw new Error('ECONNREFUSED');
                }
                if (url.includes('/api/p2p/predict')) {
                    return { ok: true, json: async () => ({ success: true, data: { simulation_id: 'sim_1' } }) };
                }
                throw new Error('unexpected');
            };
            fetchCalls = [];

            const results = await p2p.broadcastSeed('topic');
            const successes = results.filter(r => r.success);
            assert.strictEqual(successes.length, 1, 'only 1 should succeed');
        });

        await test('broadcastSeed: returns empty array when no peers', async () => {
            // Clear peers
            peerConfig.removePeer('mock-a');
            peerConfig.removePeer('mock-b');

            const results = await p2p.broadcastSeed('topic');
            assert.strictEqual(results.length, 0);

            // Re-add peers for remaining tests
            peerConfig.addPeer('http://10.0.0.1:5001', 'mock-a');
            peerConfig.addPeer('http://10.0.0.2:5001', 'mock-b');
        });

        // --- broadcastResult ---
        await test('broadcastResult: sends result to all peers', async () => {
            mockFetch({
                '/api/p2p/result': { ok: true, body: { success: true } },
            });

            await p2p.broadcastResult('topic', 'sim_local', { outline: { title: 'Test' } });
            const resultCalls = fetchCalls.filter(c => c.url.includes('/api/p2p/result'));
            assert.strictEqual(resultCalls.length, 2);
            // Check body contains the right data
            const body = JSON.parse(resultCalls[0].opts.body);
            assert.strictEqual(body.topic, 'topic');
            assert.strictEqual(body.simulation_id, 'sim_local');
        });

        await test('broadcastResult: handles unreachable peers gracefully', async () => {
            mockFetch({}); // all requests will throw ECONNREFUSED
            // Should not throw
            await p2p.broadcastResult('topic', 'sim_x', {});
        });

        // --- collectResults ---
        await test('collectResults: collects from all peers', async () => {
            mockFetch({
                '/api/p2p/results': {
                    ok: true,
                    body: {
                        success: true,
                        data: [{ simulation_id: 'sim_r1', report: { status: 'completed' } }],
                    },
                },
            });

            const results = await p2p.collectResults('topic');
            assert.strictEqual(results.length, 2, 'should get results from 2 peers');
            assert.ok(results[0].node, 'should have node attribution');
        });

        await test('collectResults: handles empty results', async () => {
            mockFetch({
                '/api/p2p/results': { ok: true, body: { success: true, data: [] } },
            });

            const results = await p2p.collectResults('topic');
            assert.strictEqual(results.length, 0);
        });

        await test('collectResults: handles peer errors gracefully', async () => {
            mockFetch({}); // all throw
            const results = await p2p.collectResults('topic');
            assert.strictEqual(results.length, 0);
        });

    } finally {
        restoreFetch();
        restoreTestPeers();
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
