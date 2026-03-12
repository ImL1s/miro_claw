/**
 * @mirofish/core — Shared type definitions
 *
 * Source of truth for CLI ↔ Extension NDJSON protocol types.
 */

// ── NDJSON Event Protocol ──────────────────────────────────────

export interface RunStartEvent {
  event: 'run:start';
  runId: string;
  topic: string;
  payloadVersion: number;
  totalSteps: number;
  ts: number;
}

export interface StepStartEvent {
  event: 'step:start';
  runId: string;
  step: number;
  name: string;
  ts: number;
}

export interface StepProgressEvent {
  event: 'step:progress';
  runId: string;
  step: number;
  progress: number;   // 0.0 ~ 1.0
  detail?: string;
  ts: number;
}

export interface StepDoneEvent {
  event: 'step:done';
  runId: string;
  step: number;
  name: string;
  data?: Record<string, unknown>;
  ts: number;
}

export interface RunDoneEvent {
  event: 'run:done';
  runId: string;
  reportId: string;
  simId: string;
  ts: number;
}

export interface RunErrorEvent {
  event: 'run:error';
  runId: string;
  step: number;
  error: string;
  message: string;
  ts: number;
}

export interface RunCancelledEvent {
  event: 'run:cancelled';
  runId: string;
  ts: number;
}

/** Union type for all possible NDJSON events. */
export type RunEvent =
  | RunStartEvent
  | StepStartEvent
  | StepProgressEvent
  | StepDoneEvent
  | RunDoneEvent
  | RunErrorEvent
  | RunCancelledEvent;

// ── Run States ─────────────────────────────────────────────────

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'cached'
  | 'busy'
  | 'not_found';

// ── Prediction Result ──────────────────────────────────────────

export interface PredictionResult {
  status: RunStatus;
  runId?: string;
  reportId?: string;
  simId?: string;
  topic?: string;
  message?: string;
  activeRuns?: number;
  elapsedSeconds?: number;
}
