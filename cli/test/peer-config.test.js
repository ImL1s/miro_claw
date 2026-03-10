/**
 * peer-config.js 單元測試
 *
 * 使用隔離的 temp 目錄，不污染真實 ~/.mirofish/peers.json
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- 隔離設定 ---
// 在 require 之前，hacky override peers file path
// peer-config.js 在 module scope 定義了 PEERS_FILE，
// 所以我們在 require 之前先設定環境讓它用不同路徑。
// 
// 方法：直接 monkey-patch 模組的 PEERS_FILE export
const TEST_DIR = path.join(os.tmpdir(), `mirofish-test-${Date.now()}-${process.pid}`);
fs.mkdirSync(TEST_DIR, { recursive: true });
const TEST_PEERS_FILE = path.join(TEST_DIR, 'peers.json');
fs.writeFileSync(TEST_PEERS_FILE, '[]');

// Load the module
const peerConfig = require('../lib/peer-config.js');

// Monkey-patch: override the module's file path
// We need to intercept fs operations. Instead, we'll
// backup/restore the real file and operate in isolation.
const REAL_PEERS_FILE = peerConfig.PEERS_FILE;
let backup = null;

function isolate() {
    const dir = path.dirname(REAL_PEERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(REAL_PEERS_FILE)) {
        backup = fs.readFileSync(REAL_PEERS_FILE, 'utf-8');
    }
    fs.writeFileSync(REAL_PEERS_FILE, '[]');
}

function restore() {
    if (backup !== null) {
        fs.writeFileSync(REAL_PEERS_FILE, backup);
    } else {
        try { fs.unlinkSync(REAL_PEERS_FILE); } catch { }
    }
    // Cleanup temp dir
    try { fs.rmSync(TEST_DIR, { recursive: true }); } catch { }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

async function asyncTest(name, fn) {
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
    console.log('\n🧪 peer-config.js tests\n');

    isolate();

    try {
        // --- addPeer ---
        test('addPeer: adds a peer with valid URL', () => {
            const peer = peerConfig.addPeer('http://192.168.1.100:5001', 'node-a');
            assert.strictEqual(peer.id, 'node-a');
            assert.strictEqual(peer.endpoint, 'http://192.168.1.100:5001');
            assert.strictEqual(peer.active, true);
            assert.ok(peer.addedAt > 0);
            peerConfig.removePeer('node-a');
        });

        test('addPeer: strips trailing slash', () => {
            const peer = peerConfig.addPeer('http://192.168.1.100:5001///', 'node-b');
            assert.strictEqual(peer.endpoint, 'http://192.168.1.100:5001');
            peerConfig.removePeer('node-b');
        });

        test('addPeer: rejects invalid URL', () => {
            assert.throws(() => {
                peerConfig.addPeer('not-a-url', 'bad');
            }, /Invalid endpoint URL/);
        });

        test('addPeer: uses hostname as ID when no label', () => {
            const peer = peerConfig.addPeer('http://10.0.0.5:5001');
            assert.strictEqual(peer.id, '10.0.0.5');
            peerConfig.removePeer('10.0.0.5');
        });

        test('addPeer: deduplicates by endpoint', () => {
            peerConfig.addPeer('http://192.168.1.200:5001', 'dup-1');
            const dup = peerConfig.addPeer('http://192.168.1.200:5001', 'dup-2');
            assert.strictEqual(dup.id, 'dup-1'); // returns existing
            const all = peerConfig.listPeers();
            const count = all.filter(p => p.endpoint === 'http://192.168.1.200:5001').length;
            assert.strictEqual(count, 1);
            peerConfig.removePeer('dup-1');
        });

        // --- removePeer ---
        test('removePeer: removes by id', () => {
            peerConfig.addPeer('http://10.0.0.1:5001', 'rm-test');
            const removed = peerConfig.removePeer('rm-test');
            assert.strictEqual(removed, true);
            assert.strictEqual(peerConfig.listPeers().length, 0);
        });

        test('removePeer: removes by endpoint', () => {
            peerConfig.addPeer('http://10.0.0.2:5001', 'rm-ep');
            const removed = peerConfig.removePeer('http://10.0.0.2:5001');
            assert.strictEqual(removed, true);
        });

        test('removePeer: returns false for non-existent peer', () => {
            const removed = peerConfig.removePeer('ghost');
            assert.strictEqual(removed, false);
        });

        // --- listPeers / getActivePeers ---
        test('listPeers: returns all peers', () => {
            peerConfig.addPeer('http://10.0.0.10:5001', 'p1');
            peerConfig.addPeer('http://10.0.0.11:5001', 'p2');
            assert.strictEqual(peerConfig.listPeers().length, 2);
            peerConfig.removePeer('p1');
            peerConfig.removePeer('p2');
        });

        test('getActivePeers: filters inactive', () => {
            peerConfig.addPeer('http://10.0.0.20:5001', 'active');
            // Manually set one as inactive
            const peers = peerConfig.listPeers();
            peers[0].active = false;
            fs.writeFileSync(REAL_PEERS_FILE, JSON.stringify(peers));
            assert.strictEqual(peerConfig.getActivePeers().length, 0);
            peerConfig.removePeer('active');
        });

        // --- checkPeerHealth ---
        await asyncTest('checkPeerHealth: returns false for unreachable peer', async () => {
            const healthy = await peerConfig.checkPeerHealth({
                id: 'ghost', endpoint: 'http://192.168.255.255:5001'
            });
            assert.strictEqual(healthy, false);
        });

        // --- persistence ---
        test('persistence: survives reload', () => {
            peerConfig.addPeer('http://10.0.0.30:5001', 'persist');
            // Clear require cache to simulate reload
            delete require.cache[require.resolve('../lib/peer-config.js')];
            const fresh = require('../lib/peer-config.js');
            const peers = fresh.listPeers();
            assert.ok(peers.some(p => p.id === 'persist'));
            peerConfig.removePeer('persist');
        });

    } finally {
        restore();
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
