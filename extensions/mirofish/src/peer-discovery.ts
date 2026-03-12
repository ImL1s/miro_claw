/**
 * P2P Peer Discovery via Gateway
 *
 * Registers the local MiroFish node as a service provider with the Gateway,
 * and periodically discovers other MiroFish nodes on the network.
 *
 * Discovered peers are persisted to ~/.mirofish/peers.json with source: "auto".
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface GatewayOpts {
  params: Record<string, unknown>;
  respond: (ok: boolean, payload?: unknown, error?: { message: string }) => void;
}

interface PluginApi {
  registerGatewayMethod: (method: string, handler: (opts: GatewayOpts) => Promise<void> | void) => void;
}

interface DiscoveredPeer {
  id: string;
  endpoint: string;
  source: "auto" | "manual";
  discoveredAt: number;
  lastSeen: number;
  active: boolean;
}

const PEERS_PATH = join(homedir(), ".mirofish", "peers.json");
const AUTO_PEER_TTL = 10 * 60 * 1000;  // 10 minutes — auto peers expire
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Register peer discovery Gateway methods and start heartbeat.
 */
export function registerPeerDiscovery(
  api: PluginApi,
  config: Record<string, unknown>,
  log: Logger,
) {
  const localEndpoint = (config.localEndpoint as string) || `http://localhost:${(config.backendPort as number) || 5001}`;
  const nodeId = (config.nodeId as string) || `node-${Date.now().toString(36)}`;

  // Known nodes registry (in-memory)
  const knownNodes = new Map<string, { nodeId: string; endpoint: string; lastSeen: number }>();

  // Register self
  knownNodes.set(nodeId, {
    nodeId,
    endpoint: localEndpoint,
    lastSeen: Date.now(),
  });

  // mirofish.discover — return all known MiroFish nodes
  api.registerGatewayMethod("mirofish.discover", (opts: GatewayOpts) => {
    const { respond } = opts;

    // Clean expired nodes
    const now = Date.now();
    for (const [id, node] of knownNodes) {
      if (now - node.lastSeen > AUTO_PEER_TTL && id !== nodeId) {
        knownNodes.delete(id);
      }
    }

    const nodes = Array.from(knownNodes.values()).map(n => ({
      nodeId: n.nodeId,
      endpoint: n.endpoint,
      lastSeen: n.lastSeen,
      isSelf: n.nodeId === nodeId,
    }));

    respond(true, { nodes, count: nodes.length });
  });

  // mirofish.heartbeat — other nodes call this to register themselves
  api.registerGatewayMethod("mirofish.heartbeat", (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const peerNodeId = params.nodeId as string;
    const peerEndpoint = params.endpoint as string;

    if (!peerNodeId || !peerEndpoint) {
      respond(false, undefined, { message: "Missing nodeId or endpoint" });
      return;
    }

    // Validate endpoint URL
    try {
      const url = new URL(peerEndpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        respond(false, undefined, { message: "Invalid endpoint protocol" });
        return;
      }
    } catch {
      respond(false, undefined, { message: "Invalid endpoint URL" });
      return;
    }

    knownNodes.set(peerNodeId, {
      nodeId: peerNodeId,
      endpoint: peerEndpoint,
      lastSeen: Date.now(),
    });

    // Write to peers.json for CLI consumption
    syncAutoPeersToDisk(knownNodes, nodeId, log);

    log.info(`[MiroFish] Heartbeat from ${peerNodeId} (${peerEndpoint})`);
    respond(true, { registered: true, totalNodes: knownNodes.size });
  });

  // Periodic cleanup of expired auto peers
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, node] of knownNodes) {
      if (now - node.lastSeen > AUTO_PEER_TTL && id !== nodeId) {
        knownNodes.delete(id);
        changed = true;
      }
    }
    if (changed) {
      syncAutoPeersToDisk(knownNodes, nodeId, log);
    }
  }, HEARTBEAT_INTERVAL);
  cleanupInterval.unref();

  log.info(`[MiroFish] Peer discovery registered (nodeId: ${nodeId}, endpoint: ${localEndpoint})`);
  log.info("[MiroFish] Registered gateway methods: mirofish.discover, mirofish.heartbeat");
}

/**
 * Sync auto-discovered peers to ~/.mirofish/peers.json.
 * Preserves manual peers, updates/adds auto peers, removes expired ones.
 */
function syncAutoPeersToDisk(
  knownNodes: Map<string, { nodeId: string; endpoint: string; lastSeen: number }>,
  selfNodeId: string,
  log: Logger,
) {
  try {
    const dir = join(homedir(), ".mirofish");
    mkdirSync(dir, { recursive: true });

    // Read existing peers
    let existingPeers: DiscoveredPeer[] = [];
    try {
      const raw = readFileSync(PEERS_PATH, "utf-8");
      existingPeers = JSON.parse(raw);
    } catch {
      // No existing file or invalid JSON
    }

    // Keep manual peers, replace auto peers
    const manualPeers = existingPeers.filter(p => p.source !== "auto");
    const autoPeers: DiscoveredPeer[] = [];

    for (const [id, node] of knownNodes) {
      if (id === selfNodeId) continue; // Don't add self

      autoPeers.push({
        id,
        endpoint: node.endpoint,
        source: "auto",
        discoveredAt: node.lastSeen,
        lastSeen: node.lastSeen,
        active: true,
      });
    }

    const allPeers = [...manualPeers, ...autoPeers];
    writeFileSync(PEERS_PATH, JSON.stringify(allPeers, null, 2));

    log.info(`[MiroFish] Synced peers to disk: ${manualPeers.length} manual + ${autoPeers.length} auto`);
  } catch (err) {
    log.error(`[MiroFish] Failed to sync peers to disk: ${err}`);
  }
}
