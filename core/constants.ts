/**
 * @mirofish/core — Shared constants
 *
 * Source of truth for step names, event names, and defaults.
 */

/** The 7-step prediction pipeline names (1-indexed, matching CLI json-stream.js). */
export const STEP_NAMES: readonly string[] = [
  'unused',                // index 0 (unused, steps are 1-based)
  'ontology_extraction',   // Step 1
  'graph_build',           // Step 2
  'simulation_create',     // Step 3
  'simulation_prepare',    // Step 4
  'simulation_start',      // Step 5
  'simulation_poll',       // Step 6
  'report_generate',       // Step 7
] as const;

/** Total number of pipeline steps. */
export const TOTAL_STEPS = 7;

/** NDJSON event names. */
export const EVENTS = {
  RUN_START: 'run:start',
  STEP_START: 'step:start',
  STEP_PROGRESS: 'step:progress',
  STEP_DONE: 'step:done',
  RUN_DONE: 'run:done',
  RUN_ERROR: 'run:error',
  RUN_CANCELLED: 'run:cancelled',
} as const;

/** NDJSON payload version for forward compatibility. */
export const PAYLOAD_VERSION = 1;

/** Default poll intervals (ms). */
export const POLL_INTERVAL = 15_000;       // 15s for simulation status
export const REPORT_POLL_INTERVAL = 5_000; // 5s for report generation
export const MAX_POLL_MINUTES = 60;        // 1 hour max for simulation

/** Default seed text expansion threshold (chars). */
export const SEED_EXPAND_THRESHOLD = 200;

/** Default RunManager config values. */
export const DEFAULTS = {
  maxConcurrent: 2,
  runTimeout: 30 * 60 * 1000,    // 30 minutes
  dedupeWindow: 60 * 1000,       // 1 minute
  idempotencyTTL: 60 * 60 * 1000, // 1 hour
} as const;
