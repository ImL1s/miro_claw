/**
 * MiroFish P2P 通訊模組
 *
 * MVP: Gateway HTTP relay（直接用各節點的 MiroFish API）
 * 未來: 升級到 libp2p gossipsub
 *
 * 三個核心功能：
 * 1. broadcastSeed — 向所有 peers 廣播推演種子
 * 2. broadcastResult — 向所有 peers 廣播推演結果
 * 3. collectResults — 向所有 peers 收集指定主題的結果
 */

const { getActivePeers, checkPeerHealth } = require('./peer-config.js');
const os = require('os');

const HOSTNAME = os.hostname();

/**
 * 向 peer 發送 HTTP request
 */
async function peerRequest(peer, method, path, body) {
    const url = `${peer.endpoint}${path}`;
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        clearTimeout(timeout);
        return null;
    }
}

/**
 * 向所有 peers 廣播推演種子
 * 目前後端只記錄種子，不自動觸發推演（Phase 3.5 TODO）
 *
 * @param {string} topic - 推演主題
 * @param {object} config - { rounds, platform }
 * @returns {Promise<Array<{peer, success}>>}
 */
async function broadcastSeed(topic, config = {}) {
    const peers = getActivePeers();
    if (peers.length === 0) {
        console.log('   ⚠️  No peers configured. Use: mirofish peers add <endpoint>');
        return [];
    }

    console.log(`\n📡 Broadcasting seed to ${peers.length} peer(s)...`);
    console.log('   ℹ️  Peers will queue the seed. Auto-prediction not yet enabled.');

    const results = await Promise.allSettled(
        peers.map(async (peer) => {
            const healthy = await checkPeerHealth(peer);
            if (!healthy) {
                console.log(`   ❌ ${peer.id}: offline`);
                return { peer, success: false, error: 'offline' };
            }

            // 通知 peer 記錄種子
            // 注意：目前後端只記錄，不自動觸發推演（需要手動在 peer 上跑）
            const res = await peerRequest(peer, 'POST', '/api/p2p/predict', {
                topic,
                rounds: config.rounds || 20,
                platform: config.platform || 'parallel',
                origin_node: HOSTNAME,
            });

            if (res && res.success) {
                const status = res.data?.auto_predict
                    ? `🚀 ${peer.id}: prediction started`
                    : `📋 ${peer.id}: seed queued`;
                console.log(`   ${status}`);
                return { peer, success: true, autoPredicting: !!res.data?.auto_predict };
            } else {
                console.log(`   ❌ ${peer.id}: failed`);
                return { peer, success: false, error: res?.error || 'unknown' };
            }
        })
    );

    return results.map(r => r.status === 'fulfilled' ? r.value : { success: false });
}

/**
 * 向所有 peers 廣播推演結果
 * 
 * @param {string} topic - 推演主題
 * @param {string} simId - 本地 simulation ID
 * @param {object} reportData - 推演報告資料
 */
async function broadcastResult(topic, simId, reportData) {
    const peers = getActivePeers();
    if (peers.length === 0) return;

    console.log(`\n📡 Sharing result with ${peers.length} peer(s)...`);

    const result = {
        topic,
        simulation_id: simId,
        origin_node: HOSTNAME,
        report: reportData,
        timestamp: Date.now(),
    };

    await Promise.allSettled(
        peers.map(async (peer) => {
            const res = await peerRequest(peer, 'POST', '/api/p2p/result', result);
            if (res) {
                console.log(`   ✅ ${peer.id}: received`);
            } else {
                console.log(`   ⚠️  ${peer.id}: unreachable`);
            }
        })
    );
}

/**
 * 向所有 peers 收集指定主題的推演結果
 *
 * @param {string} topic - 推演主題
 * @returns {Promise<Array<{node, simId, report}>>}
 */
async function collectResults(topic) {
    const peers = getActivePeers();
    const results = [];

    console.log(`\n📥 Collecting results from ${peers.length} peer(s)...`);

    await Promise.allSettled(
        peers.map(async (peer) => {
            const res = await peerRequest(peer, 'GET',
                `/api/p2p/results?topic=${encodeURIComponent(topic)}`);
            if (res && res.success && res.data) {
                console.log(`   ✅ ${peer.id}: ${res.data.length} result(s)`);
                results.push(...res.data.map(r => ({
                    node: peer.id,
                    ...r,
                })));
            } else {
                console.log(`   ⚠️  ${peer.id}: no results`);
            }
        })
    );

    return results;
}

module.exports = {
    broadcastSeed,
    broadcastResult,
    collectResults,
};
