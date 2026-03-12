/**
 * RunManager — Process Lifecycle Management
 *
 * Manages CLI child processes with dedupe, idempotency,
 * timeout, and orphan cleanup.
 */

import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────

export interface RunManagerConfig {
  maxConcurrent: number;    // max parallel CLI processes
  runTimeout: number;       // ms, kill process after this
  dedupeWindow: number;     // ms, reject same messageId within window
  idempotencyTTL: number;   // ms, return cached reportId for same question hash
  cliBin: string;           // path to mirofish CLI binary
  log: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export interface SpawnOpts {
  onEvent: (event: unknown) => void;
  rounds?: number;
}

export interface ActiveRun {
  runId: string;
  process: ChildProcess | null;
  topic: string;
  startedAt: number;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  killTimer: ReturnType<typeof setTimeout> | null;
  cancelled?: boolean;
}

export interface RunManager {
  canSpawn(): boolean;
  checkDedupe(messageId: string): boolean;
  questionHash(question: string): string;
  cacheResult(hash: string, reportId: string): void;
  getCachedResult(hash: string): string | null;
  spawn(topic: string, opts: SpawnOpts): { runId: string } | null;
  cancel(runId: string): boolean;
  cleanup(): void;
  getActiveRuns(): Map<string, ActiveRun>;
  getCompletedRun(runId: string): CompletedRun | null;
  _activeRuns: Map<string, ActiveRun>;
}

// ── Internal cache entry types ─────────────────────────────────

interface DedupeEntry {
  timestamp: number;
}

interface CacheEntry {
  reportId: string;
  timestamp: number;
}

export interface CompletedRun {
  runId: string;
  topic: string;
  simId: string;
  reportId: string;
  completedAt: number;
  status?: "completed" | "cancelled" | "error";
}

// ── Factory ────────────────────────────────────────────────────

export function createRunManager(config: RunManagerConfig): RunManager {
  const {
    maxConcurrent,
    runTimeout,
    dedupeWindow,
    idempotencyTTL,
    cliBin,
    log,
  } = config;

  const activeRuns = new Map<string, ActiveRun>();
  const completedRuns = new Map<string, CompletedRun>();
  const MAX_COMPLETED = 20;
  const dedupeMap = new Map<string, DedupeEntry>();
  const resultCache = new Map<string, CacheEntry>();

  // Sweep expired entries every 60s; unref so it won't keep the process alive.
  const sweepInterval = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of dedupeMap) {
      if (now - entry.timestamp > dedupeWindow) {
        dedupeMap.delete(key);
      }
    }

    for (const [key, entry] of resultCache) {
      if (now - entry.timestamp > idempotencyTTL) {
        resultCache.delete(key);
      }
    }
  }, 60_000);
  sweepInterval.unref();

  // ── Helpers ────────────────────────────────────────────────

  function canSpawn(): boolean {
    return activeRuns.size < maxConcurrent;
  }

  function checkDedupe(messageId: string): boolean {
    const entry = dedupeMap.get(messageId);
    const now = Date.now();

    if (entry && now - entry.timestamp < dedupeWindow) {
      return false; // blocked
    }

    dedupeMap.set(messageId, { timestamp: now });
    return true; // allowed
  }

  function questionHash(question: string): string {
    const normalized = question.trim().toLowerCase();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  function cacheResult(hash: string, reportId: string): void {
    resultCache.set(hash, { reportId, timestamp: Date.now() });
  }

  function getCachedResult(hash: string): string | null {
    const entry = resultCache.get(hash);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > idempotencyTTL) {
      resultCache.delete(hash);
      return null;
    }

    return entry.reportId;
  }

  function spawnRun(
    topic: string,
    opts: SpawnOpts,
  ): { runId: string } | null {
    if (!canSpawn()) {
      log.info("[RunManager] At capacity, cannot spawn new run");
      return null;
    }

    const tempRunId = `run-${Date.now()}`;
    let currentRunId = tempRunId;

    const args = ["predict", topic, "--json-stream"];
    if (opts.rounds) args.push(`--rounds=${opts.rounds}`);

    const child = cpSpawn(cliBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const run: ActiveRun = {
      runId: tempRunId,
      process: child,
      topic,
      startedAt: Date.now(),
      timeoutTimer: null,
      killTimer: null,
    };

    activeRuns.set(tempRunId, run);

    // Timeout: SIGTERM after runTimeout, SIGKILL 5s later
    run.timeoutTimer = setTimeout(() => {
      log.info(`[RunManager] Run ${currentRunId} timed out, sending SIGTERM`);
      child.kill("SIGTERM");

      run.killTimer = setTimeout(() => {
        log.info(
          `[RunManager] Run ${currentRunId} still alive, sending SIGKILL`,
        );
        child.kill("SIGKILL");
      }, 5_000);
    }, runTimeout);

    // Parse stdout as NDJSON
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;

          // When run:start event arrives with a real runId, keep BOTH keys
          // so callers using the temp runId (from RPC response) still find the run.
          if (
            event.event === "run:start" &&
            typeof event.runId === "string" &&
            event.runId !== currentRunId
          ) {
            const realRunId = event.runId;
            currentRunId = realRunId;
            // Keep temp key as primary, add real key as alias
            activeRuns.set(realRunId, run);
          }

          // Track completed runs so status queries work after process exit
          if (event.event === "run:done") {
            const completed: CompletedRun = {
              runId: currentRunId,
              topic,
              simId: (event.simId as string) || "",
              reportId: (event.reportId as string) || "",
              completedAt: Date.now(),
              status: "completed",
            };
            completedRuns.set(tempRunId, completed);
            if (typeof event.runId === "string" && event.runId !== tempRunId) {
              completedRuns.set(event.runId, completed);
            }
            // Evict oldest if over limit
            if (completedRuns.size > MAX_COMPLETED * 2) {
              const entries = [...completedRuns.entries()]
                .sort((a, b) => a[1].completedAt - b[1].completedAt);
              for (let i = 0; i < entries.length - MAX_COMPLETED; i++) {
                completedRuns.delete(entries[i][0]);
              }
            }
          }

          opts.onEvent(event);
        } catch {
          log.error(
            `[RunManager] Failed to parse NDJSON line: ${trimmed}`,
          );
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      log.error(`[RunManager] stderr (${currentRunId}): ${chunk.toString()}`);
    });

    // Helper: delete both temp and alias keys for this run
    const cleanupRun = () => {
      for (const [key, val] of activeRuns) {
        if (val === run) activeRuns.delete(key);
      }
    };

    // On child exit, clean up
    child.on("close", (code: number | null) => {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      if (run.killTimer) clearTimeout(run.killTimer);
      cleanupRun();
      if (run.cancelled) {
        log.info(`[MiroFish] Run ${tempRunId} cancelled`);
        // Store cancelled run so status queries return "cancelled" instead of "not_found"
        const cancelled: CompletedRun = {
          runId: currentRunId,
          topic,
          simId: "",
          reportId: "",
          completedAt: Date.now(),
          status: "cancelled",
        };
        completedRuns.set(tempRunId, cancelled);
        if (currentRunId !== tempRunId) {
          completedRuns.set(currentRunId, cancelled);
        }
        opts.onEvent({ event: "run:cancelled", runId: tempRunId });
      } else if (code !== 0) {
        log.error(`[MiroFish] Run ${tempRunId} exited with code ${code}`);
        // Store errored run for status queries
        const errored: CompletedRun = {
          runId: currentRunId,
          topic,
          simId: "",
          reportId: "",
          completedAt: Date.now(),
          status: "error",
        };
        completedRuns.set(tempRunId, errored);
        if (currentRunId !== tempRunId) {
          completedRuns.set(currentRunId, errored);
        }
        opts.onEvent({ event: "run:error", runId: tempRunId, error: "exit", message: `Process exited with code ${code}` });
      }
      log.info(`[RunManager] Run ${tempRunId} exited`);
    });

    child.on("error", (err: Error) => {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      cleanupRun();
      const errorEvent = { event: "run:error", runId: tempRunId, error: "spawn", message: err.message };
      opts.onEvent(errorEvent);
    });

    return { runId: tempRunId };
  }

  function cancel(runId: string): boolean {
    const run = activeRuns.get(runId);
    if (!run?.process) return false;

    log.info(`[MiroFish] Cancelling run ${runId}`);
    run.cancelled = true;
    if (run.timeoutTimer) clearTimeout(run.timeoutTimer);

    // Store cancelled run immediately (don't wait for close event)
    const cancelled: CompletedRun = {
      runId: run.runId,
      topic: run.topic,
      simId: "",
      reportId: "",
      completedAt: Date.now(),
      status: "cancelled",
    };
    // Store under all keys that point to this run
    for (const [key, val] of activeRuns) {
      if (val === run) {
        completedRuns.set(key, cancelled);
        activeRuns.delete(key);
      }
    }

    run.process.kill("SIGTERM");
    const proc = run.process;
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    }, 5000);

    return true;
  }

  function cleanup(): void {
    clearInterval(sweepInterval);

    for (const [runId, run] of activeRuns) {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      if (run.killTimer) clearTimeout(run.killTimer);
      if (run.process && !run.process.killed) {
        run.process.kill("SIGKILL");
      }
      log.info(`[RunManager] Cleanup: killed run ${runId}`);
    }

    activeRuns.clear();
    completedRuns.clear();
    dedupeMap.clear();
    resultCache.clear();
  }

  function getActiveRuns(): Map<string, ActiveRun> {
    return activeRuns;
  }

  function getCompletedRun(runId: string): CompletedRun | null {
    return completedRuns.get(runId) ?? null;
  }

  // ── Public interface ───────────────────────────────────────

  return {
    canSpawn,
    checkDedupe,
    questionHash,
    cacheResult,
    getCachedResult,
    spawn: spawnRun,
    cancel,
    cleanup,
    getActiveRuns,
    getCompletedRun,
    _activeRuns: activeRuns,
  };
}
