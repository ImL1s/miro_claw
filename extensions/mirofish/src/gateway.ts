// extensions/mirofish/src/gateway.ts
import type { RunManager } from "./run-manager.js";
import type { ChatSessionManager } from "./chat-session.js";
import {
  chatWithAgent,
  interviewAgent,
  getReport,
  getReportSummary,
  getLatestSimulationId,
  getSimulationAgents,
  getSimulationPosts,
  checkEnvAlive,
} from "./backend-client.js";

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
 * Send a message to a Discord webhook URL (fire-and-forget).
 */
async function notifyDiscord(webhookUrl: string, content: string, log: Logger) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      log.info("[MiroFish] Discord notification sent");
    } else {
      log.error(`[MiroFish] Discord webhook failed: ${res.status}`);
    }
  } catch (err) {
    log.error(`[MiroFish] Discord webhook error: ${err}`);
  }
}

/**
 * Push a message to OpenClaw Gateway message endpoint (for TG/other channels).
 */
async function pushToGateway(message: string, log: Logger) {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18787";
  try {
    const res = await fetch(`${gatewayUrl}/api/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      log.info("[MiroFish] Gateway message pushed (TG/channels)");
    }
  } catch {
    // Silent — gateway push is best-effort
  }
}

/**
 * Fetch report summary and send enriched completion notification.
 */
async function sendCompletionNotification(
  topic: string,
  simId: string,
  reportId: string,
  discordWebhook: string,
  log: Logger,
) {
  let summaryText = "";
  try {
    const summary = await getReportSummary(simId as string, 500);
    if (summary) {
      summaryText = summary.summary
        .split("\n")
        .map((line: string) => `> ${line}`)
        .join("\n");
    }
  } catch {
    log.info("[MiroFish] Could not fetch report summary for notification");
  }

  const msg = [
    `🐟 **MiroFish 推演完成**`,
    `> **主題:** ${topic}`,
    `> **Report ID:** \`${reportId}\``,
    `> **Simulation:** \`${simId}\``,
    "",
    summaryText ? `📋 **報告摘要:**\n${summaryText}\n` : "",
    `💬 **繼續追問:** 直接在此頻道輸入問題即可與 Report Agent 對話`,
  ]
    .filter(Boolean)
    .join("\n");

  if (discordWebhook) {
    notifyDiscord(discordWebhook, msg, log);
  }

  // Also push to Gateway for TG and other channels
  pushToGateway(msg, log);
}

/**
 * Register MiroFish Gateway RPC methods.
 * Phase 1: mirofish.predict, mirofish.status, mirofish.cancel, mirofish.list
 * Phase 3: mirofish.chat, mirofish.interview, mirofish.report
 */
export function registerGatewayMethods(
  api: PluginApi,
  runManager: RunManager,
  log: Logger,
  config?: Record<string, unknown>,
  chatSessions?: ChatSessionManager,
) {
  const discordWebhook = process.env.MIROFISH_DISCORD_WEBHOOK || (config?.discordWebhook as string) || "";

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

          // Enriched completion notification with report summary
          sendCompletionNotification(
            topic,
            (event.simId as string) || "",
            event.reportId as string,
            discordWebhook,
            log,
          );
        }
        if (event.event === "run:cancelled" && discordWebhook) {
          notifyDiscord(discordWebhook, `🛑 **MiroFish 推演已取消**\n> **主題:** ${topic}`, log);
        }
        if (event.event === "run:error" && discordWebhook) {
          const msg = `⚠️ **MiroFish 推演失敗**\n> **主題:** ${topic}\n> **錯誤:** ${event.message || "unknown"}`;
          notifyDiscord(discordWebhook, msg, log);
        }
      },
    });

    if (!result) {
      respond(false, undefined, { message: "Failed to spawn prediction" });
      return;
    }

    // Notify Discord that prediction started
    if (discordWebhook) {
      notifyDiscord(discordWebhook, `🐟 **MiroFish 推演啟動**\n> **主題:** ${topic}\n> **Run ID:** \`${result.runId}\``, log);
    }

    respond(true, { runId: result.runId, status: "started", topic });
  });

  // mirofish.status — check run status (or list all if no runId)
  api.registerGatewayMethod("mirofish.status", (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const runId = params.runId as string;

    if (runId) {
      // Layer 1: Active runs
      const runs = runManager.getActiveRuns();
      const run = runs.get(runId);
      if (run) {
        respond(true, {
          status: "running",
          runId,
          topic: run.topic,
          elapsedSeconds: Math.round((Date.now() - run.startedAt) / 1000),
        });
        return;
      }

      // Layer 2: Completed/cancelled/errored runs
      const completed = runManager.getCompletedRun(runId);
      if (completed) {
        const runStatus = completed.status || "completed";
        if (runStatus === "cancelled") {
          respond(true, { status: "cancelled", runId, topic: completed.topic });
          return;
        }
        if (runStatus === "error") {
          respond(true, { status: "error", runId, topic: completed.topic });
          return;
        }
        respond(true, {
          status: "completed",
          runId,
          topic: completed.topic,
          simId: completed.simId,
          reportId: completed.reportId,
        });
        return;
      }

      respond(true, { status: "not_found", runId });
    } else {
      const seen = new Set<unknown>();
      const runs: Record<string, unknown>[] = [];
      for (const [id, r] of runManager.getActiveRuns()) {
        if (seen.has(r)) continue;
        seen.add(r);
        runs.push({
          runId: id,
          topic: r.topic,
          status: "running",
          elapsedSeconds: Math.round((Date.now() - r.startedAt) / 1000),
        });
      }
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

  // mirofish.list — list all active runs (deduplicated by run object identity)
  api.registerGatewayMethod("mirofish.list", (opts: GatewayOpts) => {
    const { respond } = opts;
    const seen = new Set<unknown>();
    const runs: { runId: string; topic: string; elapsedSeconds: number }[] = [];
    for (const [id, r] of runManager.getActiveRuns()) {
      if (seen.has(r)) continue;
      seen.add(r);
      runs.push({
        runId: id,
        topic: r.topic,
        elapsedSeconds: Math.round((Date.now() - r.startedAt) / 1000),
      });
    }
    respond(true, { runs, count: runs.length });
  });

  // --- Phase 3: Interactive RPC methods ---

  // mirofish.chat — chat with Report Agent
  api.registerGatewayMethod("mirofish.chat", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const simId = params.simId as string;
    const message = params.message as string;

    if (!simId || !message) {
      respond(false, undefined, { message: "Missing required parameters: simId, message" });
      return;
    }

    try {
      const history = chatSessions ? chatSessions.getHistory(simId) : [];
      const result = await chatWithAgent(simId, message, history);

      if (!result.success || !result.data) {
        respond(false, undefined, { message: result.error || "Chat failed" });
        return;
      }

      if (chatSessions) chatSessions.addUserMessage(simId, message);
      if (chatSessions) chatSessions.addAssistantMessage(simId, result.data.response);

      respond(true, {
        response: result.data.response,
        sources: result.data.sources || [],
        toolCalls: result.data.tool_calls || [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      respond(false, undefined, { message: `Chat error: ${msg}` });
    }
  });

  // mirofish.interview — interview a specific simulation agent
  api.registerGatewayMethod("mirofish.interview", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const simId = params.simId as string;
    const agentId = params.agentId as number;
    const question = params.question as string;

    if (!simId || agentId === undefined || !question) {
      respond(false, undefined, { message: "Missing required parameters: simId, agentId, question" });
      return;
    }

    try {
      const result = await interviewAgent(simId, agentId, question);

      if (!result.success || !result.data) {
        respond(false, undefined, { message: result.error || "Interview failed" });
        return;
      }

      respond(true, {
        agentId,
        response: result.data.response,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      respond(false, undefined, { message: `Interview error: ${msg}` });
    }
  });

  // mirofish.report — get prediction report
  api.registerGatewayMethod("mirofish.report", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    let resolvedSimId = params.simId as string | undefined;
    const format = (params.format as string) || "summary";

    // Auto-resolve latest simulation if simId not provided
    if (!resolvedSimId) {
      const latestId = await getLatestSimulationId();
      if (!latestId) {
        respond(false, undefined, { message: "No completed simulations found. Run a prediction first." });
        return;
      }
      resolvedSimId = latestId;
      log.info(`[mirofish.report] auto-resolved to latest simId=${resolvedSimId}`);
    }
    const simId: string = resolvedSimId;

    try {
      if (format === "full") {
        const result = await getReport(simId);
        if (!result.success || !result.data) {
          respond(false, undefined, { message: result.error || "Report not found" });
          return;
        }
        respond(true, {
          simId,
          reportId: result.data.report_id,
          content: result.data.markdown_content,
        });
      } else {
        const summary = await getReportSummary(simId);
        if (!summary) {
          respond(false, undefined, { message: `No report for simulation ${simId}` });
          return;
        }
        respond(true, {
          simId,
          reportId: summary.reportId,
          content: summary.summary,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      respond(false, undefined, { message: `Report error: ${msg}` });
    }
  });

  // mirofish.agents — list agent profiles for a simulation
  api.registerGatewayMethod("mirofish.agents", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    let resolvedSimId = params.simId as string | undefined;
    const platform = (params.platform as string) || "reddit";

    if (!resolvedSimId) {
      const latestId = await getLatestSimulationId();
      if (!latestId) {
        respond(false, undefined, { message: "No completed simulations found." });
        return;
      }
      resolvedSimId = latestId;
    }
    const simId: string = resolvedSimId;

    try {
      const [agentsResult, envResult] = await Promise.all([
        getSimulationAgents(simId, platform),
        checkEnvAlive(simId),
      ]);

      if (!agentsResult.success || !agentsResult.agents) {
        respond(false, undefined, { message: agentsResult.error || "Could not fetch agents" });
        return;
      }

      respond(true, {
        simId,
        interviewAvailable: envResult.alive,
        agentCount: agentsResult.agents.length,
        agents: agentsResult.agents,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      respond(false, undefined, { message: `Agents error: ${msg}` });
    }
  });

  // mirofish.posts — get simulation posts
  api.registerGatewayMethod("mirofish.posts", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    let resolvedSimId = params.simId as string | undefined;
    const platform = (params.platform as string) || "twitter";
    const limit = Math.min((params.limit as number) || 20, 50);

    if (!resolvedSimId) {
      const latestId = await getLatestSimulationId();
      if (!latestId) {
        respond(false, undefined, { message: "No completed simulations found." });
        return;
      }
      resolvedSimId = latestId;
    }
    const simId: string = resolvedSimId;

    try {
      const result = await getSimulationPosts(simId, platform, limit);

      if (!result.success || !result.posts) {
        respond(false, undefined, { message: result.error || "Could not fetch posts" });
        return;
      }

      respond(true, {
        simId,
        platform,
        total: result.total,
        returned: result.posts.length,
        posts: result.posts,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      respond(false, undefined, { message: `Posts error: ${msg}` });
    }
  });

  log.info("[MiroFish] Registered gateway methods: mirofish.predict, .status, .cancel, .list, .chat, .interview, .report, .agents, .posts");
}
