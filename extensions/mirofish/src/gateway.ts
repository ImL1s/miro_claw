// extensions/mirofish/src/gateway.ts
import type { RunManager } from "./run-manager.js";

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

/**
 * Register MiroFish Gateway RPC methods.
 * Methods: mirofish.predict, mirofish.status, mirofish.cancel, mirofish.list
 */
export function registerGatewayMethods(
  api: PluginApi,
  runManager: RunManager,
  log: Logger,
) {
  // mirofish.predict — start a prediction (returns immediately with runId)
  api.registerGatewayMethod("mirofish.predict", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const topic = params.topic as string;

    if (!topic) {
      respond(false, undefined, { message: "Missing required parameter: topic" });
      return;
    }

    const hash = runManager.questionHash(topic);
    const cached = runManager.getCachedResult(hash);
    if (cached) {
      respond(true, { status: "cached", reportId: cached });
      return;
    }

    if (!runManager.canSpawn()) {
      respond(false, undefined, { message: "Max concurrent predictions reached" });
      return;
    }

    const result = runManager.spawn(topic, {
      onEvent(evt: unknown) {
        const event = evt as Record<string, unknown>;
        if (event.event === "run:done" && event.reportId) {
          runManager.cacheResult(hash, event.reportId as string);
          log.info(`[MiroFish] RPC predict complete: ${event.reportId}`);
        }
      },
    });

    if (!result) {
      respond(false, undefined, { message: "Failed to spawn prediction" });
      return;
    }

    respond(true, { runId: result.runId, status: "started", topic });
  });

  // mirofish.status — check run status (or list all if no runId)
  api.registerGatewayMethod("mirofish.status", (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const runId = params.runId as string;

    if (runId) {
      const runs = runManager.getActiveRuns();
      const run = runs.get(runId);
      if (!run) {
        respond(true, { status: "not_found", runId });
      } else {
        respond(true, {
          status: "running",
          runId,
          topic: run.topic,
          elapsedSeconds: Math.round((Date.now() - run.startedAt) / 1000),
        });
      }
    } else {
      const runs = Array.from(runManager.getActiveRuns().entries()).map(([id, r]) => ({
        runId: id,
        topic: r.topic,
        elapsedSeconds: Math.round((Date.now() - r.startedAt) / 1000),
      }));
      respond(true, { runs, count: runs.length });
    }
  });

  // mirofish.cancel — cancel a running prediction
  api.registerGatewayMethod("mirofish.cancel", (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const runId = params.runId as string;
    if (!runId) {
      respond(false, undefined, { message: "Missing required parameter: runId" });
      return;
    }
    const cancelled = runManager.cancel(runId);
    respond(true, { cancelled, runId });
  });

  // mirofish.list — list all active runs
  api.registerGatewayMethod("mirofish.list", (opts: GatewayOpts) => {
    const { respond } = opts;
    const runs = Array.from(runManager.getActiveRuns().entries()).map(([id, r]) => ({
      runId: id,
      topic: r.topic,
      elapsedSeconds: Math.round((Date.now() - r.startedAt) / 1000),
    }));
    respond(true, { runs, count: runs.length });
  });

  log.info("[MiroFish] Registered gateway methods: mirofish.predict, mirofish.status, mirofish.cancel, mirofish.list");
}
