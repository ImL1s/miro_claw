/**
 * MiroFish x OpenClaw Extension
 *
 * Thin shell that:
 * 1. Registers agent tools (Path C)
 * 2. Registers message hooks (Path B)
 * 3. Registers gateway RPC methods (control plane)
 * 4. Serves Canvas HTML for report visualization
 *
 * All business logic delegated to mirofish-cli child process.
 */

import { createRunManager } from "./src/run-manager.js";
import { createMirofishTools } from "./src/tools.js";
import { createMessageHook } from "./src/hooks.js";
import { registerGatewayMethods } from "./src/gateway.js";
import { registerCanvasRoute } from "./src/canvas-route.js";
import { createProgressBroadcaster } from "./src/progress-broadcaster.js";
import { registerPeerDiscovery } from "./src/peer-discovery.js";
import { ChatSessionManager } from "./src/chat-session.js";

// Minimal type definitions (will be replaced by openclaw SDK types later)
interface PluginApi {
  id: string;
  logger: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  pluginConfig?: Record<string, unknown>;
  registerTool: (tool: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHook: (events: string | string[], handler: (...args: any[]) => any, opts?: { name?: string; description?: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerGatewayMethod: (method: string, handler: (opts: any) => any) => void;
  registerHttpRoute: (params: unknown) => void;
  registerService: (service: {
    id: string;
    start: (ctx: unknown) => void | Promise<void>;
    stop?: (ctx: unknown) => void | Promise<void>;
  }) => void;
}

const plugin = {
  id: "mirofish",
  name: "MiroFish Prediction Engine",
  description:
    "55-agent social simulation prediction engine with P2P consensus",
  version: "0.1.0",

  register(api: PluginApi) {
    const log = api.logger;
    const config = (api.pluginConfig || {}) as Record<string, unknown>;

    const runManager = createRunManager({
      maxConcurrent: (config.maxConcurrent as number) || 2,
      runTimeout: (config.runTimeout as number) || 30 * 60 * 1000,
      dedupeWindow: (config.dedupeWindow as number) || 60 * 1000,
      idempotencyTTL: (config.idempotencyTTL as number) || 60 * 60 * 1000,
      cliBin: (config.cliBin as string) || "mirofish",
      log,
    });

    // Chat session manager (shared by tools and gateway)
    const chatSessions = new ChatSessionManager();

    // Path C: Agent tools
    const tools = createMirofishTools(runManager, log, chatSessions);
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // Path B: Message hook
    const hook = createMessageHook(runManager, config, log);
    api.registerHook("agent_end", hook, { name: "mirofish-auto-predict" });

    // Gateway RPC methods (pass config for Discord webhook etc.)
    registerGatewayMethods(api, runManager, log, config, chatSessions);

    // SSE Progress Broadcaster (real-time event push)
    const broadcaster = createProgressBroadcaster(log);
    broadcaster.registerRoute(api);

    // Wire RunManager events to SSE broadcaster
    const origSpawn = runManager.spawn.bind(runManager);
    (runManager as unknown as Record<string, unknown>).spawn = (
      topic: string,
      opts: { onEvent: (evt: unknown) => void; rounds?: number },
    ) => {
      const origOnEvent = opts.onEvent;
      const wrappedOpts = {
        ...opts,
        onEvent(evt: unknown) {
          origOnEvent(evt);
          // Broadcast to SSE subscribers
          const event = evt as Record<string, unknown>;
          const runId = (event.runId as string) || "unknown";
          broadcaster.broadcast(runId, event);
        },
      };
      return origSpawn(topic, wrappedOpts);
    };

    // Canvas route
    registerCanvasRoute(api, config, log);

    // P2P Peer Discovery
    registerPeerDiscovery(api, config, log);

    // Service lifecycle
    api.registerService({
      id: "mirofish-run-manager",
      start() {
        log.info("[MiroFish] Extension loaded. RunManager ready.");
      },
      stop() {
        runManager.cleanup();
        broadcaster.closeAll();
        chatSessions.clearAll();
        log.info("[MiroFish] RunManager stopped, orphan processes cleaned.");
      },
    });
  },
};

export default plugin;
