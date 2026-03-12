/**
 * NDJSON Event Protocol — MiroFish CLI <-> OpenClaw Extension 通訊模組（零依賴）
 *
 * Emits and parses newline-delimited JSON events for structured progress reporting.
 */
const crypto = require('crypto');

const STEP_NAMES = [
    'ontology_extraction',
    'graph_build',
    'simulation_create',
    'simulation_prepare',
    'simulation_start',
    'simulation_poll',
    'report_generate',
];

class JsonStreamEmitter {
    /**
     * @param {(line: string) => void} writeLine — called with each JSON line to emit
     */
    constructor(writeLine) {
        this._writeLine = writeLine;
        this._runId = null;
    }

    get runId() {
        return this._runId;
    }

    /** Emit a raw event object (adds ts + runId automatically) */
    _emit(event) {
        const line = JSON.stringify({
            ...event,
            ts: new Date().toISOString(),
            runId: this._runId,
        });
        this._writeLine(line);
    }

    /** Start a new run. Generates a unique runId. */
    runStart({ topic }) {
        this._runId = crypto.randomUUID();
        this._emit({
            event: 'run:start',
            topic,
            payloadVersion: 1,
            totalSteps: STEP_NAMES.length,
        });
    }

    /** Signal that a step has begun. */
    stepStart(step, name) {
        this._emit({ event: 'step:start', step, name: name || STEP_NAMES[step - 1] });
    }

    /** Report incremental progress within a step. */
    stepProgress(step, progress, message) {
        this._emit({ event: 'step:progress', step, progress, message });
    }

    /** Signal that a step has completed with a result. */
    stepDone(step, result) {
        this._emit({ event: 'step:done', step, result });
    }

    /** Signal that the entire run completed successfully. */
    runDone({ reportId, simId }) {
        this._emit({ event: 'run:done', reportId, simId });
    }

    /** Signal a fatal error during a run. */
    runError(step, error, message) {
        this._emit({ event: 'run:error', step, error, message });
    }
}

/**
 * Creates an NDJSON parser that buffers chunked input and emits parsed events.
 *
 * Non-JSON lines (e.g. human-readable emoji output) are silently ignored.
 *
 * @param {(event: object) => void} onEvent — called for each valid JSON object
 * @returns {{ feed(chunk: string): void }}
 */
function parseNDJSON(onEvent) {
    let buffer = '';

    return {
        feed(chunk) {
            buffer += chunk;
            const lines = buffer.split('\n');
            // Keep the last (potentially incomplete) segment in the buffer
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('{')) continue;
                try {
                    const obj = JSON.parse(trimmed);
                    onEvent(obj);
                } catch {
                    // Not valid JSON — skip
                }
            }
        },
    };
}

module.exports = {
    JsonStreamEmitter,
    parseNDJSON,
    STEP_NAMES,
};
