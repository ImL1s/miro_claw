// extensions/mirofish/src/tools.ts
import type { RunManager } from "./run-manager.js";

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
export function createMirofishTools(runManager: RunManager, log: Logger) {
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
      async execute({
        topic,
        rounds,
      }: {
        topic: string;
        rounds?: number;
      }): Promise<string> {
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

        // Spawn prediction
        const events: RunEvent[] = [];
        const result = runManager.spawn(topic, {
          onEvent(evt: unknown) {
            events.push(evt as RunEvent);
          },
        });

        if (!result) {
          return JSON.stringify({
            status: "error",
            message: "Failed to start prediction.",
          });
        }

        // Wait for completion with safety timeout
        return new Promise<string>((resolve) => {
          const safetyTimeout = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(JSON.stringify({
              status: "error",
              runId: result.runId,
              error: "timeout",
              message: "Prediction timed out (safety limit reached).",
            }));
          }, 35 * 60 * 1000); // 35 min safety net

          const checkInterval = setInterval(() => {
            const lastEvent = events[events.length - 1];
            if (!lastEvent) return;

            // Check for both field names (event or type) for robustness
            const eventName = (lastEvent as any).event || (lastEvent as any).type;

            if (eventName === "run:done") {
              clearInterval(checkInterval);
              clearTimeout(safetyTimeout);
              if (lastEvent.reportId) {
                runManager.cacheResult(hash, lastEvent.reportId);
              }
              resolve(
                JSON.stringify({
                  status: "completed",
                  runId: result.runId,
                  reportId: lastEvent.reportId,
                  simId: lastEvent.simId,
                  message: `Prediction complete. Report ID: "${lastEvent.reportId}".`,
                }),
              );
            }

            if (eventName === "run:error") {
              clearInterval(checkInterval);
              clearTimeout(safetyTimeout);
              resolve(
                JSON.stringify({
                  status: "error",
                  runId: result.runId,
                  error: lastEvent.error,
                  message: lastEvent.message || "Prediction failed.",
                }),
              );
            }
          }, 2000);
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
      async execute({ runId }: { runId: string }): Promise<string> {
        const runs = runManager.getActiveRuns();
        const run = runs.get(runId);

        if (!run) {
          return JSON.stringify({
            status: "not_found",
            message: `No active run with ID "${runId}".`,
          });
        }

        const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
        return JSON.stringify({
          status: "running",
          runId,
          topic: run.topic,
          elapsedSeconds: elapsed,
        });
      },
    },
  ];
}
