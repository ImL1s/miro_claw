/**
 * p2p.js 單元測試（TDD）
 *
 * 用 mock fetch 測試廣播/收集邏輯，不需要真實 peer。
 * 每個 test 都有獨立的 setup/teardown，不互相污染。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const peerConfig = require('../lib/peer-config.js');

// --- Mock fetch ---
const originalFetch = global.fetch;
let fetchCalls = [];

function mockFetch(responses = {}) {
    fetchCalls = [];
    global.fetch = async (url, opts) => {
        fetchCalls.push({ url, opts });
        const key = Object.keys(responses).find(k => url.includes(k));
        if (key) {
            const resp = responses[key];
            return {
                ok: resp.ok !== false,
                json: async () => resp.body || {},
            };
        }
        throw new Error('ECONNREFUSED');
    };
}

function restoreFetch() {
    global.fetch = originalFetch;
}

// --- Peer isolation ---
// Backup the real peers.json ONCE, write test peers, restore at end
const PEERS_FILE = peerConfig.PEERS_FILE;
let peersBackup = null;

function backupPeers() {
    const dir = path.dirname(PEERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(PEERS_FILE)) {
        peersBackup = fs.readFileSync(PEERS_FILE, 'utf-8');
    }
}

function writeTwoPeers() {
    // Write a clean slate with 2 mock peers
    const peers = [
        { id: 'mock-a', endpoint: 'http://10.0.0.1:5001', label: 'mock-a', addedAt: Date.now(), active: true },
        { id: 'mock-b', endpoint: 'http://10.0.0.2:5001', label: 'mock-b', addedAt: Date.now(), active: true },
    ];
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function writeNoPeers() {
    fs.writeFileSync(PEERS_FILE, '[]');
}

function restorePeers() {
    if (peersBackup !== null) {
        fs.writeFileSync(PEERS_FILE, peersBackup);
    } else {
        try { fs.unlinkSync(PEERS_FILE); } catch { }
    }
}

// Fresh require
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
    } finally {
        // Always restore fetch + peers between tests
        restoreFetch();
    }
}

async function runTests() {
    console.log('\n🧪 p2p.js tests\n');

    backupPeers();

    try {
        const p2p = loadP2P();

        // --- broadcastSeed ---
        await test('broadcastSeed: sends to all healthy peers', async () => {
            writeTwoPeers();
            mockFetch({
                '/health': { ok: true, body: { status: 'ok' } },
                '/api/p2p/predict': { ok: true, body: { success: true, data: {} } },
            });

            const results = await p2p.broadcastSeed('test topic', { rounds: 5 });
            assert.strictEqual(results.length, 2, 'should have 2 results');
            assert.ok(results.every(r => r.success), 'all should succeed');
            const predictCalls = fetchCalls.filter(c => c.url.includes('/api/p2p/predict'));
            assert.strictEqual(predictCalls.length, 2);
        });

        await test('broadcastSeed: skips unhealthy peers', async () => {
            writeTwoPeers();
            let healthCallCount = 0;
            fetchCalls = [];
            global.fetch = async (url) => {
                fetchCalls.push({ url });
                if (url.includes('/health')) {
                    healthCallCount++;
                    if (healthCallCount === 1) return { ok: true, json: async () => ({}) };
                    throw new Error('ECONNREFUSED');
                }
                if (url.includes('/api/p2p/predict')) {
                    return { ok: true, json: async () => ({ success: true, data: { simulation_id: 'sim_1' } }) };
                }
                throw new Error('unexpected');
            };

            const results = await p2p.broadcastSeed('topic');
            const successes = results.filter(r => r.success);
            assert.strictEqual(successes.length, 1, 'only 1 should succeed');
        });

        await test('broadcastSeed: returns empty array when no peers', async () => {
            writeNoPeers(); // isolated — no manual add/remove/re-add
            const results = await p2p.broadcastSeed('topic');
            assert.strictEqual(results.length, 0);
        });

        // --- broadcastResult ---
        await test('broadcastResult: sends result to all peers', async () => {
            writeTwoPeers();
            mockFetch({
                '/api/p2p/result': { ok: true, body: { success: true } },
            });

            await p2p.broadcastResult('topic', 'sim_local', { outline: { title: 'Test' } });
            const resultCalls = fetchCalls.filter(c => c.url.includes('/api/p2p/result'));
            assert.strictEqual(resultCalls.length, 2);
            const body = JSON.parse(resultCalls[0].opts.body);
            assert.strictEqual(body.topic, 'topic');
            assert.strictEqual(body.simulation_id, 'sim_local');
        });

        await test('broadcastResult: handles unreachable peers gracefully', async () => {
            writeTwoPeers();
            mockFetch({}); // all throw
            await p2p.broadcastResult('topic', 'sim_x', {}); // should not throw
        });

        // --- collectResults ---
        await test('collectResults: collects from all peers', async () => {
            writeTwoPeers();
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
            writeTwoPeers();
            mockFetch({
                '/api/p2p/results': { ok: true, body: { success: true, data: [] } },
            });
            const results = await p2p.collectResults('topic');
            assert.strictEqual(results.length, 0);
        });

        await test('collectResults: handles peer errors gracefully', async () => {
            writeTwoPeers();
            mockFetch({}); // all throw
            const results = await p2p.collectResults('topic');
            assert.strictEqual(results.length, 0);
        });

    } finally {
        restoreFetch();
        restorePeers();
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
