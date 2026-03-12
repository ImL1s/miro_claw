// extensions/mirofish/src/tools.ts
import type { RunManager } from "./run-manager.js";
import type { ChatSessionManager } from "./chat-session.js";
import {
  chatWithAgent,
  interviewAgent,
  getReport,
  getReportSummary,
} from "./backend-client.js";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Shape of NDJSON events emitted by the CLI process. */
interface RunEvent {
  type?: string;
  event?: string;
  runId?: string;
  reportId?: string;
  simId?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Create MiroFish agent tools for OpenClaw.
 * The LLM invokes these as function calls (Path C).
 */
export function createMirofishTools(
  runManager: RunManager,
  log: Logger,
  chatSessions: ChatSessionManager,
) {
  return [
    {
      name: "mirofish_predict",
      description:
        "Run a MiroFish multi-agent prediction simulation. " +
        "55 AI agents simulate social media discussions (Twitter/Reddit) about a given topic, " +
        "then generate a consensus prediction report. Takes 10-30 minutes.",
      parameters: {
        type: "object" as const,
        properties: {
          topic: {
            type: "string",
            description:
              "The prediction topic or scenario to simulate, e.g. '如果比特幣突破15萬美元'",
          },
          rounds: {
            type: "number",
            description:
              "Number of simulation rounds (default: 20, recommended: 10-20 for testing, 30-40 for production)",
          },
        },
        required: ["topic"],
      },
      async execute(
        _toolCallId: string,
        { topic, rounds }: { topic: string; rounds?: number },
      ): Promise<string> {
        log.info(
          `[mirofish_predict] topic="${topic}" rounds=${rounds ?? 20}`,
        );

        // Check idempotency cache
        const hash = runManager.questionHash(topic);
        const cached = runManager.getCachedResult(hash);
        if (cached) {
          return JSON.stringify({
            status: "cached",
            reportId: cached,
            message: `This topic was recently predicted. Report ID: ${cached}.`,
          });
        }

        // Check capacity
        if (!runManager.canSpawn()) {
          return JSON.stringify({
            status: "busy",
            message: "Maximum concurrent predictions reached. Try again later.",
            activeRuns: runManager.getActiveRuns().size,
          });
        }

        // Spawn prediction (non-blocking — return runId immediately)
        const result = runManager.spawn(topic, {
          onEvent(evt: unknown) {
            const event = evt as RunEvent;
            if (event.event === "run:done" && event.reportId) {
              runManager.cacheResult(hash, event.reportId);
              log.info(`[mirofish_predict] complete: reportId=${event.reportId}`);
            }
          },
        });

        if (!result) {
          return JSON.stringify({
            status: "error",
            message: "Failed to start prediction.",
          });
        }

        return JSON.stringify({
          status: "started",
          runId: result.runId,
          topic,
          message: `Prediction started (run ID: ${result.runId}). Use mirofish_status tool with this runId to check progress. Takes 10-30 minutes.`,
        });
      },
    },
    {
      name: "mirofish_status",
      description: "Check the status of an active MiroFish prediction run.",
      parameters: {
        type: "object" as const,
        properties: {
          runId: {
            type: "string",
            description: "The run ID returned by mirofish_predict",
          },
        },
        required: ["runId"],
      },
      async execute(_toolCallId: string, { runId }: { runId: string }): Promise<string> {
        // Layer 1: Active runs
        const runs = runManager.getActiveRuns();
        const run = runs.get(runId);

        if (run) {
          const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
          return JSON.stringify({
            status: "running",
            runId,
            topic: run.topic,
            elapsedSeconds: elapsed,
          });
        }

        // Layer 2: Completed/cancelled/errored runs
        const completed = runManager.getCompletedRun(runId);
        if (completed) {
          const runStatus = completed.status || "completed";
          if (runStatus === "cancelled") {
            return JSON.stringify({
              status: "cancelled",
              runId,
              topic: completed.topic,
              message: `Prediction was cancelled.`,
            });
          }
          if (runStatus === "error") {
            return JSON.stringify({
              status: "error",
              runId,
              topic: completed.topic,
              message: `Prediction failed.`,
            });
          }
          return JSON.stringify({
            status: "completed",
            runId,
            topic: completed.topic,
            simId: completed.simId,
            reportId: completed.reportId,
            message: `Prediction completed. Report ID: ${completed.reportId}, Sim ID: ${completed.simId}`,
          });
        }

        return JSON.stringify({
          status: "not_found",
          message: `No run with ID "${runId}" found (active or recent).`,
        });
      },
    },

    // --- Phase 3: Interactive tools ---

    {
      name: "mirofish_chat",
      description:
        "Chat with the MiroFish Report Agent about a completed simulation. " +
        "Ask follow-up questions about predictions, trends, agent opinions, etc. " +
        "The Agent has access to the knowledge graph and simulation data to answer intelligently.",
      parameters: {
        type: "object" as const,
        properties: {
          simId: {
            type: "string",
            description:
              "The simulation ID (e.g. 'sim_2a3892a4724e'). Get this from prediction results.",
          },
          message: {
            type: "string",
            description:
              "Your question for the Report Agent, e.g. '看多看空比例是多少？' or 'Which agents disagreed the most?'",
          },
        },
        required: ["simId", "message"],
      },
      async execute(
        _toolCallId: string,
        { simId, message }: { simId: string; message: string },
      ): Promise<string> {
        log.info(`[mirofish_chat] simId=${simId} message="${message.slice(0, 50)}..."`);

        try {
          const history = chatSessions.getHistory(simId);
          const result = await chatWithAgent(simId, message, history);

          if (!result.success || !result.data) {
            return JSON.stringify({
              status: "error",
              message: result.error || "Report Agent chat failed",
            });
          }

          chatSessions.addUserMessage(simId, message);
          chatSessions.addAssistantMessage(simId, result.data.response);

          return JSON.stringify({
            status: "ok",
            response: result.data.response,
            sources: result.data.sources || [],
            toolCalls: result.data.tool_calls || [],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`[mirofish_chat] error: ${msg}`);
          return JSON.stringify({
            status: "error",
            message: `Chat failed: ${msg}. Is the MiroFish backend running?`,
          });
        }
      },
    },
    {
      name: "mirofish_interview",
      description:
        "Interview a specific AI agent from a MiroFish simulation. " +
        "Each simulation has ~55 agents with distinct personas. " +
        "Use this to ask a particular agent about their reasoning and opinions.",
      parameters: {
        type: "object" as const,
        properties: {
          simId: {
            type: "string",
            description: "The simulation ID",
          },
          agentId: {
            type: "number",
            description: "The agent ID (0-54) to interview",
          },
          question: {
            type: "string",
            description: "The question to ask the agent",
          },
        },
        required: ["simId", "agentId", "question"],
      },
      async execute(
        _toolCallId: string,
        { simId, agentId, question }: { simId: string; agentId: number; question: string },
      ): Promise<string> {
        log.info(`[mirofish_interview] simId=${simId} agentId=${agentId}`);

        try {
          const result = await interviewAgent(simId, agentId, question);

          if (!result.success || !result.data) {
            return JSON.stringify({
              status: "error",
              message: result.error || "Interview failed",
            });
          }

          return JSON.stringify({
            status: "ok",
            agentId,
            response: result.data.response,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`[mirofish_interview] error: ${msg}`);
          return JSON.stringify({
            status: "error",
            message: `Interview failed: ${msg}`,
          });
        }
      },
    },
    {
      name: "mirofish_report",
      description:
        "Get the prediction report for a completed simulation. " +
        "Returns a summary or full markdown report. Use 'summary' format for chat display.",
      parameters: {
        type: "object" as const,
        properties: {
          simId: {
            type: "string",
            description: "The simulation ID",
          },
          format: {
            type: "string",
            description:
              "Output format: 'summary' (first ~2000 chars, good for chat) or 'full' (complete report)",
          },
        },
        required: ["simId"],
      },
      async execute(
        _toolCallId: string,
        { simId, format }: { simId: string; format?: string },
      ): Promise<string> {
        log.info(`[mirofish_report] simId=${simId} format=${format || "summary"}`);

        try {
          if (format === "full") {
            const result = await getReport(simId);
            if (!result.success || !result.data) {
              return JSON.stringify({
                status: "error",
                message: result.error || "Report not found",
              });
            }
            return JSON.stringify({
              status: "ok",
              reportId: result.data.report_id,
              content: result.data.markdown_content,
            });
          }

          // Default: summary
          const summary = await getReportSummary(simId);
          if (!summary) {
            return JSON.stringify({
              status: "error",
              message: `No report found for simulation ${simId}. The simulation may still be running.`,
            });
          }

          return JSON.stringify({
            status: "ok",
            reportId: summary.reportId,
            content: summary.summary,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`[mirofish_report] error: ${msg}`);
          return JSON.stringify({
            status: "error",
            message: `Report retrieval failed: ${msg}`,
          });
        }
      },
    },
  ];
}
