# MiroFish × OpenClaw Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate MiroFish prediction engine into OpenClaw as a Hybrid extension — CLI as execution host, Extension as thin shell — supporting 3 coexisting paths (A: pure CLI, B: message-triggered + Canvas, C: direct API tool).

**Architecture:** CLI (`mirofish-cli`) remains the sole business logic carrier for MVP. A new OpenClaw extension (`extensions/mirofish/`) registers tools, hooks, gateway methods, and HTTP routes. Communication between Extension and CLI uses NDJSON event protocol over child process stdout. Extension fetches full data (reports, graphs) directly from MiroFish Backend API using IDs returned in events.

**Tech Stack:** Node.js (CLI, zero-dependency), TypeScript (OpenClaw extension), NDJSON streaming protocol, WebSocket JSON-RPC (Gateway), HTML/CSS/JS (Canvas A2UI)

**Repo layout:**
```
miro_claw/
├── cli/                          # mirofish-cli (npm package)
│   ├── bin/mirofish.js           # CLI entry point
│   └── lib/
│       ├── predict.js            # 7-step pipeline
│       ├── json-stream.js        # NEW: NDJSON event emitter
│       ├── api.js                # HTTP client
│       ├── canvas.js             # Local dashboard server
│       ├── notify.js             # Notifications
│       └── p2p.js                # P2P broadcast
├── extensions/mirofish/          # NEW: OpenClaw extension
│   ├── index.ts                  # Plugin entry (registerTool/Hook/Gateway/Route)
│   ├── src/
│   │   ├── run-manager.ts        # Child process lifecycle
│   │   ├── tools.ts              # Agent tool definitions
│   │   ├── hooks.ts              # Message hook + dedupe
│   │   ├── gateway.ts            # RPC method handlers
│   │   └── canvas-route.ts       # A2UI report rendering
│   ├── canvas/                   # Canvas HTML assets
│   │   └── index.html
│   ├── package.json
│   └── tsconfig.json
├── skills/mirofish-predict/      # EXISTING: OpenClaw skill (Path A)
│   └── SKILL.md
└── backend/                      # MiroFish Python backend (:5001)
```

---

## Task 1: NDJSON Event Protocol Module

**Files:**
- Create: `cli/lib/json-stream.js`
- Test: `cli/test/json-stream.test.js`

The NDJSON protocol is the **only contract** between Extension and CLI. Events carry IDs, not full data.

**Step 1: Write the failing test**

```javascript
// cli/test/json-stream.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { JsonStreamEmitter, EVENTS, parseNDJSON } = require('../lib/json-stream.js');

describe('JsonStreamEmitter', () => {
  it('emits run:start with runId, payloadVersion, totalSteps', () => {
    const lines = [];
    const emitter = new JsonStreamEmitter((line) => lines.push(line));

    emitter.runStart({ topic: 'BTC突破15萬' });

    assert.strictEqual(lines.length, 1);
    const evt = JSON.parse(lines[0]);
    assert.strictEqual(evt.event, 'run:start');
    assert.strictEqual(evt.payloadVersion, 1);
    assert.strictEqual(evt.totalSteps, 7);
    assert.ok(evt.runId);
    assert.ok(evt.ts);
  });

  it('emits step:start, step:progress, step:done in sequence', () => {
    const lines = [];
    const emitter = new JsonStreamEmitter((line) => lines.push(line));
    emitter.runStart({ topic: 'test' });

    emitter.stepStart(1, 'ontology_extraction');
    emitter.stepProgress(1, 0.5, '提取中...');
    emitter.stepDone(1, { ontologyId: 'ont-123' });

    const events = lines.map(l => JSON.parse(l));
    assert.strictEqual(events[1].event, 'step:start');
    assert.strictEqual(events[1].step, 1);
    assert.strictEqual(events[1].name, 'ontology_extraction');
    assert.strictEqual(events[2].event, 'step:progress');
    assert.strictEqual(events[2].progress, 0.5);
    assert.strictEqual(events[3].event, 'step:done');
    assert.deepStrictEqual(events[3].result, { ontologyId: 'ont-123' });
  });

  it('emits run:done with reportId', () => {
    const lines = [];
    const emitter = new JsonStreamEmitter((line) => lines.push(line));
    emitter.runStart({ topic: 'test' });

    emitter.runDone({ reportId: 'rpt-456', simId: 'sim-789' });

    const evt = JSON.parse(lines[1]);
    assert.strictEqual(evt.event, 'run:done');
    assert.strictEqual(evt.reportId, 'rpt-456');
    assert.strictEqual(evt.simId, 'sim-789');
  });

  it('emits run:error with step and error message', () => {
    const lines = [];
    const emitter = new JsonStreamEmitter((line) => lines.push(line));
    emitter.runStart({ topic: 'test' });

    emitter.runError(3, 'timeout', 'Graph build timeout after 30min');

    const evt = JSON.parse(lines[1]);
    assert.strictEqual(evt.event, 'run:error');
    assert.strictEqual(evt.step, 3);
    assert.strictEqual(evt.error, 'timeout');
  });
});

describe('parseNDJSON', () => {
  it('parses buffered NDJSON chunks correctly', () => {
    const events = [];
    const parser = parseNDJSON((evt) => events.push(evt));

    // Simulate chunked input
    parser.feed('{"event":"run:start","runId":"abc"}\n{"even');
    parser.feed('t":"step:start","step":1}\n');

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].event, 'run:start');
    assert.strictEqual(events[1].event, 'step:start');
  });

  it('ignores non-JSON lines (human-readable output)', () => {
    const events = [];
    const parser = parseNDJSON((evt) => events.push(evt));

    parser.feed('📋 Step 1/7: Creating project...\n');
    parser.feed('{"event":"step:start","step":1}\n');
    parser.feed('   ✅ Done\n');

    assert.strictEqual(events.length, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test cli/test/json-stream.test.js`
Expected: FAIL with "Cannot find module '../lib/json-stream.js'"

**Step 3: Write minimal implementation**

```javascript
// cli/lib/json-stream.js
/**
 * MiroFish NDJSON Event Protocol v1
 *
 * Contract between CLI and OpenClaw Extension.
 * Events carry IDs only — Extension fetches full data from Backend API.
 */
const crypto = require('crypto');

const STEP_NAMES = [
  'ontology_extraction',    // Step 1
  'graph_build',            // Step 2
  'simulation_create',      // Step 3
  'simulation_prepare',     // Step 4
  'simulation_start',       // Step 5
  'simulation_poll',        // Step 6
  'report_generate',        // Step 7
];

class JsonStreamEmitter {
  /**
   * @param {(line: string) => void} writeLine - output function (e.g. process.stdout.write)
   */
  constructor(writeLine) {
    this._write = writeLine;
    this._runId = null;
  }

  _emit(obj) {
    obj.ts = Date.now();
    if (this._runId) obj.runId = this._runId;
    this._write(JSON.stringify(obj));
  }

  runStart({ topic }) {
    this._runId = crypto.randomUUID();
    this._emit({
      event: 'run:start',
      payloadVersion: 1,
      totalSteps: 7,
      topic,
    });
  }

  stepStart(step, name) {
    this._emit({ event: 'step:start', step, name: name || STEP_NAMES[step - 1] });
  }

  stepProgress(step, progress, message) {
    const obj = { event: 'step:progress', step, progress };
    if (message) obj.message = message;
    this._emit(obj);
  }

  stepDone(step, result) {
    this._emit({ event: 'step:done', step, result: result || {} });
  }

  runDone({ reportId, simId }) {
    this._emit({ event: 'run:done', reportId, simId });
  }

  runError(step, error, message) {
    this._emit({ event: 'run:error', step, error, message });
  }

  get runId() { return this._runId; }
}

/**
 * NDJSON parser — handles chunked input, ignores non-JSON lines.
 * @param {(event: object) => void} onEvent
 * @returns {{ feed: (chunk: string) => void }}
 */
function parseNDJSON(onEvent) {
  let buffer = '';

  return {
    feed(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed[0] !== '{') continue;
        try {
          onEvent(JSON.parse(trimmed));
        } catch {
          // not valid JSON — skip (human-readable output)
        }
      }
    },
  };
}

module.exports = { JsonStreamEmitter, parseNDJSON, STEP_NAMES };
```

**Step 4: Run test to verify it passes**

Run: `node --test cli/test/json-stream.test.js`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add cli/lib/json-stream.js cli/test/json-stream.test.js
git commit -m "feat(cli): add NDJSON event protocol module for extension communication"
```

---

## Task 2: Wire `--json-stream` into CLI predict pipeline

**Files:**
- Modify: `cli/lib/predict.js` (entire file — add conditional NDJSON output)
- Modify: `cli/bin/mirofish.js:94-128` (parse `--json-stream` flag)
- Test: `cli/test/predict-json-stream.test.js`

**Step 1: Write the failing test**

```javascript
// cli/test/predict-json-stream.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseNDJSON } = require('../lib/json-stream.js');

describe('predict --json-stream integration', () => {
  it('wrapWithJsonStream returns emitter and output lines', () => {
    // This tests the wrapper function that predict.js will use
    const { wrapWithJsonStream } = require('../lib/predict.js');

    const lines = [];
    const emitter = wrapWithJsonStream((line) => lines.push(line));

    assert.ok(emitter);
    assert.strictEqual(typeof emitter.runStart, 'function');
    assert.strictEqual(typeof emitter.stepStart, 'function');
    assert.strictEqual(typeof emitter.stepDone, 'function');
    assert.strictEqual(typeof emitter.runDone, 'function');
    assert.strictEqual(typeof emitter.runError, 'function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test cli/test/predict-json-stream.test.js`
Expected: FAIL with "wrapWithJsonStream is not a function"

**Step 3: Modify `cli/lib/predict.js`**

Add at the top of the file, after existing requires:

```javascript
const { JsonStreamEmitter } = require('./json-stream.js');
```

Add this helper function before `predict()`:

```javascript
/**
 * Create a JSON stream emitter for --json-stream mode.
 * @param {(line: string) => void} [writeLine] - defaults to stdout
 * @returns {JsonStreamEmitter}
 */
function wrapWithJsonStream(writeLine) {
    return new JsonStreamEmitter(writeLine || ((line) => process.stdout.write(line + '\n')));
}
```

Inside `predict()` function, add `opts.jsonStream` parameter handling. At the very start of `predict()`:

```javascript
const jsonStream = opts.jsonStream ? wrapWithJsonStream() : null;
if (jsonStream) jsonStream.runStart({ topic: seedText });
```

Then instrument each step. For each Step N, add before the step:
```javascript
if (jsonStream) jsonStream.stepStart(N);
```

And after the step succeeds, add:
```javascript
if (jsonStream) jsonStream.stepDone(N, { /* relevant ID */ });
```

Wrap the entire function body in try-catch for `jsonStream.runError()`:
```javascript
try {
    // ... existing steps ...
    if (jsonStream) jsonStream.runDone({ reportId: reportData.id, simId });
} catch (err) {
    if (jsonStream) jsonStream.runError(currentStep, err.code || 'error', err.message);
    throw err;
}
```

Add to `module.exports`:
```javascript
module.exports = { predict, formatReport, wrapWithJsonStream };
```

**Step 4: Modify `cli/bin/mirofish.js:94-128`**

In the `predict` case, add flag parsing:

```javascript
case 'predict': {
    const topic = sub;
    if (!topic) {
        console.error('Usage: mirofish predict "推演主題"');
        process.exit(1);
    }
    const flags = parseFlags(args.slice(2));
    const p2pMode = args.includes('--p2p');
    const p2pReplyOnly = args.includes('--p2p-reply-only');
    const jsonStreamMode = args.includes('--json-stream');  // ← ADD THIS

    // ... existing p2p broadcast code ...

    const result = await predict(topic, {
        rounds: flags.rounds ? parseInt(flags.rounds) : 20,
        platform: flags.platform || 'parallel',
        canvas: args.includes('--canvas'),
        canvasPort: flags.port ? parseInt(flags.port) : 18790,
        jsonStream: jsonStreamMode,  // ← ADD THIS
    });

    // ... rest unchanged ...
}
```

Also add to the `usage()` help text:
```
    --json-stream                   Output NDJSON events (for extension integration)
```

**Step 5: Run test to verify it passes**

Run: `node --test cli/test/predict-json-stream.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add cli/lib/predict.js cli/bin/mirofish.js cli/test/predict-json-stream.test.js
git commit -m "feat(cli): wire --json-stream flag into predict pipeline"
```

---

## Task 3: OpenClaw Extension Scaffolding

**Files:**
- Create: `extensions/mirofish/package.json`
- Create: `extensions/mirofish/tsconfig.json`
- Create: `extensions/mirofish/index.ts`

This is the entry point. It wires together all submodules.

**Step 1: Create package.json**

```json
{
  "name": "@mirofish/openclaw-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["index.ts", "src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: Create extension entry point**

```typescript
// extensions/mirofish/index.ts
/**
 * MiroFish × OpenClaw Extension
 *
 * Thin shell that:
 * 1. Registers agent tools (Path C)
 * 2. Registers message hooks (Path B)
 * 3. Registers gateway RPC methods (control plane)
 * 4. Serves Canvas HTML for report visualization
 *
 * All business logic delegated to mirofish-cli child process.
 */

// Note: OpenClawPluginApi type comes from the openclaw plugin SDK.
// For development, we define a minimal subset inline.
// In production, import from "openclaw/plugin-sdk/core".

import { createRunManager } from "./src/run-manager.js";
import { createMirofishTools } from "./src/tools.js";
import { createMessageHook } from "./src/hooks.js";
import { registerGatewayMethods } from "./src/gateway.js";
import { registerCanvasRoute } from "./src/canvas-route.js";

interface PluginApi {
  id: string;
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  pluginConfig?: Record<string, unknown>;
  registerTool: (tool: unknown) => void;
  registerHook: (events: string | string[], handler: (...args: unknown[]) => unknown) => void;
  registerGatewayMethod: (method: string, handler: (opts: unknown) => Promise<void> | void) => void;
  registerHttpRoute: (params: unknown) => void;
  registerService: (service: { id: string; start: (ctx: unknown) => void | Promise<void>; stop?: (ctx: unknown) => void | Promise<void> }) => void;
}

const plugin = {
  id: "mirofish",
  name: "MiroFish Prediction Engine",
  description: "55-agent social simulation prediction engine with P2P consensus",
  version: "0.1.0",

  register(api: PluginApi) {
    const log = api.logger;
    const config = (api.pluginConfig || {}) as Record<string, unknown>;

    // Shared RunManager for all paths
    const runManager = createRunManager({
      maxConcurrent: (config.maxConcurrent as number) || 2,
      runTimeout: (config.runTimeout as number) || 30 * 60 * 1000,
      dedupeWindow: (config.dedupeWindow as number) || 60 * 1000,
      idempotencyTTL: (config.idempotencyTTL as number) || 60 * 60 * 1000,
      cliBin: (config.cliBin as string) || "mirofish",
      log,
    });

    // Path C: Agent tool
    const tools = createMirofishTools(runManager, log);
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // Path B: Message hook
    const hook = createMessageHook(runManager, config, log);
    api.registerHook("agent_end", hook);

    // Control plane: Gateway RPC methods
    registerGatewayMethods(api, runManager, log);

    // Canvas: Report visualization
    registerCanvasRoute(api, config, log);

    // Service lifecycle
    api.registerService({
      id: "mirofish-run-manager",
      start() {
        log.info("[MiroFish] Extension loaded. RunManager ready.");
      },
      stop() {
        runManager.cleanup();
        log.info("[MiroFish] RunManager stopped, orphan processes cleaned.");
      },
    });
  },
};

export default plugin;
```

**Step 4: Verify TypeScript compiles**

Run: `cd extensions/mirofish && npm install && npx tsc --noEmit`
Expected: Errors for missing `src/*.ts` files (expected — we create them in subsequent tasks)

**Step 5: Commit**

```bash
git add extensions/mirofish/
git commit -m "feat(extension): scaffold OpenClaw MiroFish extension entry point"
```

---

## Task 4: RunManager — Process Lifecycle

**Files:**
- Create: `extensions/mirofish/src/run-manager.ts`
- Test: `extensions/mirofish/src/__tests__/run-manager.test.ts`

The RunManager spawns/tracks/kills CLI child processes and provides dedupe + idempotency.

**Step 1: Write the failing test**

```typescript
// extensions/mirofish/src/__tests__/run-manager.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import { createRunManager } from "../run-manager.js";

const noop = { info: () => {}, error: () => {} };

describe("RunManager", () => {
  it("spawn returns runId and tracks active run", () => {
    const rm = createRunManager({
      maxConcurrent: 2,
      runTimeout: 5000,
      dedupeWindow: 1000,
      idempotencyTTL: 5000,
      cliBin: "echo", // won't actually run predict
      log: noop,
    });

    // Test dedupe key generation
    const key1 = rm.questionHash("BTC突破15萬");
    const key2 = rm.questionHash("BTC突破15萬");
    const key3 = rm.questionHash("ETH merge完成");
    assert.strictEqual(key1, key2);
    assert.notStrictEqual(key1, key3);
  });

  it("rejects when maxConcurrent reached", () => {
    const rm = createRunManager({
      maxConcurrent: 1,
      runTimeout: 60000,
      dedupeWindow: 100,
      idempotencyTTL: 100,
      cliBin: "sleep", // long-running placeholder
      log: noop,
    });

    // Simulate an active run
    rm._activeRuns.set("fake-run", { process: null, topic: "test", startedAt: Date.now() });

    const result = rm.canSpawn();
    assert.strictEqual(result, false);
  });

  it("dedupe blocks same messageId within window", () => {
    const rm = createRunManager({
      maxConcurrent: 2,
      runTimeout: 60000,
      dedupeWindow: 1000,
      idempotencyTTL: 60000,
      cliBin: "echo",
      log: noop,
    });

    const ok1 = rm.checkDedupe("msg-001");
    const ok2 = rm.checkDedupe("msg-001");
    assert.strictEqual(ok1, true);  // first time: allowed
    assert.strictEqual(ok2, false); // within window: blocked
  });

  it("idempotency returns cached reportId for same question hash", () => {
    const rm = createRunManager({
      maxConcurrent: 2,
      runTimeout: 60000,
      dedupeWindow: 1000,
      idempotencyTTL: 60000,
      cliBin: "echo",
      log: noop,
    });

    const hash = rm.questionHash("BTC突破15萬");
    rm.cacheResult(hash, "rpt-cached-123");

    const cached = rm.getCachedResult(hash);
    assert.strictEqual(cached, "rpt-cached-123");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd extensions/mirofish && npx tsx --test src/__tests__/run-manager.test.ts`
Expected: FAIL with "Cannot find module '../run-manager.js'"

**Step 3: Write implementation**

```typescript
// extensions/mirofish/src/run-manager.ts
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";

export interface RunManagerConfig {
  maxConcurrent: number;
  runTimeout: number;      // ms
  dedupeWindow: number;    // ms
  idempotencyTTL: number;  // ms
  cliBin: string;          // path to mirofish CLI binary
  log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export interface ActiveRun {
  process: ChildProcess | null;
  topic: string;
  startedAt: number;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface RunEvent {
  event: string;
  runId?: string;
  step?: number;
  name?: string;
  progress?: number;
  message?: string;
  result?: Record<string, unknown>;
  reportId?: string;
  simId?: string;
  error?: string;
  ts?: number;
  [key: string]: unknown;
}

type EventCallback = (event: RunEvent) => void;

export interface RunManager {
  canSpawn(): boolean;
  checkDedupe(messageId: string): boolean;
  questionHash(question: string): string;
  cacheResult(hash: string, reportId: string): void;
  getCachedResult(hash: string): string | null;
  spawn(topic: string, opts: SpawnOpts): { runId: string; events: ReadableStream<RunEvent> } | null;
  cancel(runId: string): boolean;
  cleanup(): void;
  getActiveRuns(): Map<string, ActiveRun>;
  // Exposed for testing
  _activeRuns: Map<string, ActiveRun>;
}

interface SpawnOpts {
  rounds?: number;
  messageId?: string;
  onEvent?: EventCallback;
}

export function createRunManager(config: RunManagerConfig): RunManager {
  const activeRuns = new Map<string, ActiveRun>();
  const dedupeMap = new Map<string, number>(); // messageId → timestamp
  const resultCache = new Map<string, { reportId: string; cachedAt: number }>();
  const { maxConcurrent, runTimeout, dedupeWindow, idempotencyTTL, cliBin, log } = config;

  // Periodic cleanup of expired dedupe/cache entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of dedupeMap) {
      if (now - ts > dedupeWindow) dedupeMap.delete(key);
    }
    for (const [key, entry] of resultCache) {
      if (now - entry.cachedAt > idempotencyTTL) resultCache.delete(key);
    }
  }, 60_000);
  cleanupInterval.unref?.();

  function questionHash(question: string): string {
    return createHash("sha256").update(question.trim().toLowerCase()).digest("hex").slice(0, 16);
  }

  function canSpawn(): boolean {
    return activeRuns.size < maxConcurrent;
  }

  function checkDedupe(messageId: string): boolean {
    const now = Date.now();
    const prev = dedupeMap.get(messageId);
    if (prev && now - prev < dedupeWindow) {
      return false; // blocked
    }
    dedupeMap.set(messageId, now);
    return true; // allowed
  }

  function cacheResult(hash: string, reportId: string): void {
    resultCache.set(hash, { reportId, cachedAt: Date.now() });
  }

  function getCachedResult(hash: string): string | null {
    const entry = resultCache.get(hash);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > idempotencyTTL) {
      resultCache.delete(hash);
      return null;
    }
    return entry.reportId;
  }

  function spawnRun(
    topic: string,
    opts: SpawnOpts,
  ): { runId: string; events: ReadableStream<RunEvent> } | null {
    if (!canSpawn()) {
      log.info(`[MiroFish] Max concurrent runs (${maxConcurrent}) reached. Rejecting.`);
      return null;
    }

    const args = ["predict", topic, "--json-stream"];
    if (opts.rounds) args.push(`--rounds=${opts.rounds}`);

    const child = spawn(cliBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Generate runId from first NDJSON event or fallback
    let runId = `run-${Date.now()}`;
    let ndjsonBuffer = "";

    const run: ActiveRun = {
      process: child,
      topic,
      startedAt: Date.now(),
    };

    // Timeout
    run.timeoutTimer = setTimeout(() => {
      log.error(`[MiroFish] Run ${runId} timed out after ${runTimeout / 1000}s. Killing.`);
      cancelRun(runId);
    }, runTimeout);

    activeRuns.set(runId, run);

    // Parse stdout NDJSON
    child.stdout?.on("data", (chunk: Buffer) => {
      ndjsonBuffer += chunk.toString();
      const lines = ndjsonBuffer.split("\n");
      ndjsonBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed[0] !== "{") continue;
        try {
          const event: RunEvent = JSON.parse(trimmed);
          // Capture runId from first event
          if (event.event === "run:start" && event.runId) {
            const oldId = runId;
            runId = event.runId;
            activeRuns.delete(oldId);
            activeRuns.set(runId, run);
          }
          opts.onEvent?.(event);
        } catch {
          // Not JSON, skip
        }
      }
    });

    // Handle exit
    child.on("close", (code) => {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      activeRuns.delete(runId);

      if (code !== 0) {
        log.error(`[MiroFish] Run ${runId} exited with code ${code}`);
        opts.onEvent?.({ event: "run:error", runId, error: "exit", message: `Process exited with code ${code}` });
      }
    });

    child.on("error", (err) => {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      activeRuns.delete(runId);
      log.error(`[MiroFish] Run ${runId} process error: ${err.message}`);
      opts.onEvent?.({ event: "run:error", runId, error: "spawn", message: err.message });
    });

    // Note: we don't return ReadableStream for MVP, onEvent callback is sufficient
    return { runId, events: null as unknown as ReadableStream<RunEvent> };
  }

  function cancelRun(runId: string): boolean {
    const run = activeRuns.get(runId);
    if (!run || !run.process) return false;

    log.info(`[MiroFish] Cancelling run ${runId}`);
    run.process.kill("SIGTERM");

    // Force kill after 5s
    setTimeout(() => {
      try {
        run.process?.kill("SIGKILL");
      } catch {
        // Already dead
      }
      activeRuns.delete(runId);
    }, 5000);

    return true;
  }

  function cleanup(): void {
    clearInterval(cleanupInterval);
    for (const [runId, run] of activeRuns) {
      if (run.timeoutTimer) clearTimeout(run.timeoutTimer);
      try {
        run.process?.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    activeRuns.clear();
    dedupeMap.clear();
    resultCache.clear();
  }

  return {
    canSpawn,
    checkDedupe,
    questionHash,
    cacheResult,
    getCachedResult,
    spawn: spawnRun,
    cancel: cancelRun,
    cleanup,
    getActiveRuns: () => activeRuns,
    _activeRuns: activeRuns,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd extensions/mirofish && npx tsx --test src/__tests__/run-manager.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add extensions/mirofish/src/run-manager.ts extensions/mirofish/src/__tests__/run-manager.test.ts
git commit -m "feat(extension): implement RunManager with dedupe, idempotency, and timeout"
```

---

## Task 5: Agent Tool Definition (Path C)

**Files:**
- Create: `extensions/mirofish/src/tools.ts`

This registers `mirofish-predict` as an agent tool that OpenClaw's LLM can invoke directly.

**Step 1: Write the tool definition**

```typescript
// extensions/mirofish/src/tools.ts
import type { RunManager, RunEvent } from "./run-manager.js";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
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
            description: "The prediction topic or scenario to simulate, e.g. '如果比特幣突破15萬美元'",
          },
          rounds: {
            type: "number",
            description: "Number of simulation rounds (default: 20, recommended: 10-20 for testing, 30-40 for production)",
          },
        },
        required: ["topic"],
      },
      async execute({ topic, rounds }: { topic: string; rounds?: number }): Promise<string> {
        // Check idempotency cache
        const hash = runManager.questionHash(topic);
        const cached = runManager.getCachedResult(hash);
        if (cached) {
          return JSON.stringify({
            status: "cached",
            reportId: cached,
            message: `This topic was recently predicted. Report ID: ${cached}. Use mirofish.getReport to view it.`,
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
          rounds: rounds || 20,
          onEvent(evt) {
            events.push(evt);
          },
        });

        if (!result) {
          return JSON.stringify({ status: "error", message: "Failed to start prediction." });
        }

        // Wait for completion (with timeout awareness — RunManager handles the hard timeout)
        return new Promise<string>((resolve) => {
          const checkInterval = setInterval(() => {
            const lastEvent = events[events.length - 1];
            if (!lastEvent) return;

            if (lastEvent.event === "run:done") {
              clearInterval(checkInterval);
              // Cache result
              if (lastEvent.reportId) {
                runManager.cacheResult(hash, lastEvent.reportId);
              }
              resolve(JSON.stringify({
                status: "completed",
                runId: result.runId,
                reportId: lastEvent.reportId,
                simId: lastEvent.simId,
                message: `Prediction complete. Use mirofish.getReport with reportId "${lastEvent.reportId}" to view the full report.`,
              }));
            }

            if (lastEvent.event === "run:error") {
              clearInterval(checkInterval);
              resolve(JSON.stringify({
                status: "error",
                runId: result.runId,
                error: lastEvent.error,
                message: lastEvent.message || "Prediction failed.",
              }));
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
            message: `No active run with ID "${runId}". It may have completed or been cancelled.`,
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
```

**Step 2: Commit**

```bash
git add extensions/mirofish/src/tools.ts
git commit -m "feat(extension): add mirofish_predict and mirofish_status agent tools (Path C)"
```

---

## Task 6: Message Hook (Path B)

**Files:**
- Create: `extensions/mirofish/src/hooks.ts`

Listens for agent responses that suggest a prediction is needed, then auto-triggers.

**Step 1: Write implementation**

```typescript
// extensions/mirofish/src/hooks.ts
import type { RunManager } from "./run-manager.js";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface HookConfig {
  /** Keywords that trigger auto-prediction (default: ["推演", "預測", "模擬"]) */
  triggerKeywords?: string[];
  /** Whether Path B auto-trigger is enabled (default: false — opt-in) */
  autoTrigger?: boolean;
}

/**
 * Create a message hook for Path B — auto-trigger predictions from chat.
 *
 * The hook fires on "agent_end" and checks if the agent's response
 * contains MiroFish trigger keywords. If so, it spawns a prediction.
 *
 * Default: disabled. Set pluginConfig.autoTrigger = true to enable.
 */
export function createMessageHook(
  runManager: RunManager,
  config: Record<string, unknown>,
  log: Logger,
) {
  const hookConfig: HookConfig = {
    triggerKeywords: (config.triggerKeywords as string[]) || ["推演", "預測", "模擬", "如果.*會怎樣"],
    autoTrigger: (config.autoTrigger as boolean) || false,
  };

  return async (payload: Record<string, unknown>) => {
    if (!hookConfig.autoTrigger) return;

    const message = payload.content as string || payload.text as string || "";
    const messageId = payload.messageId as string || payload.id as string || "";

    if (!message) return;

    // Check if message matches any trigger pattern
    const patterns = hookConfig.triggerKeywords!.map((kw) => new RegExp(kw, "i"));
    const matched = patterns.some((p) => p.test(message));

    if (!matched) return;

    // Extract the topic from the message (simple heuristic: use the full message)
    const topic = message.slice(0, 200).trim();

    // Dedupe check
    if (messageId && !runManager.checkDedupe(messageId)) {
      log.info(`[MiroFish] Hook: deduplicated message ${messageId}`);
      return;
    }

    // Idempotency check
    const hash = runManager.questionHash(topic);
    const cached = runManager.getCachedResult(hash);
    if (cached) {
      log.info(`[MiroFish] Hook: returning cached result for topic hash ${hash}`);
      // Could push a notification here with the cached reportId
      return;
    }

    // Capacity check
    if (!runManager.canSpawn()) {
      log.info(`[MiroFish] Hook: at capacity, skipping auto-predict`);
      return;
    }

    log.info(`[MiroFish] Hook: auto-triggering prediction for "${topic.slice(0, 50)}..."`);

    runManager.spawn(topic, {
      rounds: 20,
      messageId,
      onEvent(evt) {
        if (evt.event === "run:done" && evt.reportId) {
          runManager.cacheResult(hash, evt.reportId);
          log.info(`[MiroFish] Hook: prediction complete, reportId=${evt.reportId}`);
          // TODO: Push notification via Gateway RPC (Phase 2)
        }
        if (evt.event === "run:error") {
          log.error(`[MiroFish] Hook: prediction failed: ${evt.message}`);
        }
      },
    });
  };
}
```

**Step 2: Commit**

```bash
git add extensions/mirofish/src/hooks.ts
git commit -m "feat(extension): add message hook for auto-trigger predictions (Path B)"
```

---

## Task 7: Gateway RPC Methods

**Files:**
- Create: `extensions/mirofish/src/gateway.ts`

Registers WebSocket RPC methods for controlling MiroFish from any OpenClaw client.

**Step 1: Write implementation**

```typescript
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
 *
 * Methods:
 *   mirofish.predict   — Start a prediction
 *   mirofish.status    — Check run status
 *   mirofish.cancel    — Cancel a running prediction
 *   mirofish.list      — List active runs
 */
export function registerGatewayMethods(
  api: PluginApi,
  runManager: RunManager,
  log: Logger,
) {
  // mirofish.predict
  api.registerGatewayMethod("mirofish.predict", async (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const topic = params.topic as string;
    const rounds = (params.rounds as number) || 20;

    if (!topic) {
      respond(false, null, { message: "Missing required parameter: topic" });
      return;
    }

    // Idempotency
    const hash = runManager.questionHash(topic);
    const cached = runManager.getCachedResult(hash);
    if (cached) {
      respond(true, { status: "cached", reportId: cached });
      return;
    }

    // Capacity
    if (!runManager.canSpawn()) {
      respond(false, null, { message: "Max concurrent predictions reached" });
      return;
    }

    const result = runManager.spawn(topic, {
      rounds,
      onEvent(evt) {
        if (evt.event === "run:done" && evt.reportId) {
          runManager.cacheResult(hash, evt.reportId);
          log.info(`[MiroFish] RPC predict complete: ${evt.reportId}`);
        }
      },
    });

    if (!result) {
      respond(false, null, { message: "Failed to spawn prediction" });
      return;
    }

    // Return immediately with runId — client polls with mirofish.status
    respond(true, { runId: result.runId, status: "started", topic });
  });

  // mirofish.status
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
      // List all
      const runs = Array.from(runManager.getActiveRuns().entries()).map(([id, r]) => ({
        runId: id,
        topic: r.topic,
        elapsedSeconds: Math.round((Date.now() - r.startedAt) / 1000),
      }));
      respond(true, { runs, count: runs.length });
    }
  });

  // mirofish.cancel
  api.registerGatewayMethod("mirofish.cancel", (opts: GatewayOpts) => {
    const { params, respond } = opts;
    const runId = params.runId as string;

    if (!runId) {
      respond(false, null, { message: "Missing required parameter: runId" });
      return;
    }

    const cancelled = runManager.cancel(runId);
    respond(true, { cancelled, runId });
  });

  // mirofish.list
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
```

**Step 2: Commit**

```bash
git add extensions/mirofish/src/gateway.ts
git commit -m "feat(extension): add Gateway RPC methods (predict/status/cancel/list)"
```

---

## Task 8: Canvas Route — A2UI Report Rendering

**Files:**
- Create: `extensions/mirofish/src/canvas-route.ts`
- Create: `extensions/mirofish/canvas/index.html`

Serves the MiroFish report as a Canvas page within OpenClaw's A2UI system.

**Step 1: Write the canvas route handler**

```typescript
// extensions/mirofish/src/canvas-route.ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface PluginApi {
  registerHttpRoute: (params: {
    method: string;
    path: string;
    handler: (req: unknown, res: { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }) => void | Promise<void>;
  }) => void;
}

/**
 * Register HTTP routes for serving MiroFish Canvas (report visualization).
 *
 * Route: GET /mirofish/canvas?simId=xxx&api=http://localhost:5001
 *
 * The Canvas HTML is self-contained — it fetches report data from the
 * MiroFish Backend API using the simId and api params.
 */
export function registerCanvasRoute(
  api: PluginApi,
  config: Record<string, unknown>,
  log: Logger,
) {
  const backendUrl = (config.backendUrl as string) || "http://localhost:5001";

  // Read canvas HTML template at registration time
  let canvasHtml: string;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const canvasPath = join(__dirname, "..", "canvas", "index.html");
    canvasHtml = readFileSync(canvasPath, "utf-8");
  } catch {
    log.error("[MiroFish] Failed to read canvas/index.html — Canvas route disabled.");
    return;
  }

  api.registerHttpRoute({
    method: "GET",
    path: "/mirofish/canvas",
    handler(req: unknown, res) {
      // Extract query params from request
      const url = new URL((req as { url: string }).url, "http://localhost");
      const simId = url.searchParams.get("simId") || "";
      const apiUrl = url.searchParams.get("api") || backendUrl;

      // Inject config into HTML
      const injection = `
<script>
window.__MIROFISH_API__ = ${JSON.stringify(apiUrl)};
window.__MIROFISH_SIM_ID__ = ${JSON.stringify(simId)};
</script>
`;
      const html = canvasHtml.replace("</head>", injection + "</head>");

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
    },
  });

  log.info("[MiroFish] Registered canvas route: GET /mirofish/canvas");
}
```

**Step 2: Create canvas HTML**

```html
<!-- extensions/mirofish/canvas/index.html -->
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MiroFish Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', 'Noto Sans SC', system-ui, sans-serif;
      background: #FAFAFA;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 24px; }
    .header {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 0; border-bottom: 1px solid #E0E0E0; margin-bottom: 24px;
    }
    .header h1 { font-size: 20px; font-weight: 700; }
    .header .badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: 4px; background: #E8F5E9; color: #2E7D32;
    }
    .loading { text-align: center; padding: 60px; color: #999; }
    .loading .spinner {
      width: 32px; height: 32px; border: 3px solid #E0E0E0;
      border-top-color: #333; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { background: #FFF3F3; border: 1px solid #FFCDD2; padding: 16px; border-radius: 8px; color: #C62828; }
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #111; }
    .section .content { font-size: 14px; color: #444; white-space: pre-wrap; }
    .meta { font-size: 12px; color: #999; margin-top: 24px; padding-top: 16px; border-top: 1px solid #E0E0E0; }
  </style>
</head>
<body>
  <div class="container" id="app">
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading report...</div>
    </div>
  </div>

  <script>
    (async () => {
      const app = document.getElementById('app');
      const apiBase = window.__MIROFISH_API__ || 'http://localhost:5001';
      const simId = window.__MIROFISH_SIM_ID__;
      const preloaded = window.__MIROFISH_REPORT__;

      if (!simId && !preloaded) {
        app.innerHTML = '<div class="error">No simulation ID provided.</div>';
        return;
      }

      try {
        const report = preloaded || await fetch(`${apiBase}/api/report/by-simulation/${simId}`).then(r => r.json());
        const data = report.data || report;
        const outline = data.outline || {};
        const markdown = data.markdown_content || '';

        let html = `
          <div class="header">
            <h1>${escapeHtml(outline.title || 'MiroFish Report')}</h1>
            <span class="badge">Completed</span>
          </div>
        `;

        if (outline.summary) {
          html += `<div class="section"><h2>Summary</h2><div class="content">${escapeHtml(outline.summary)}</div></div>`;
        }

        if (outline.sections && outline.sections.length) {
          html += '<div class="section"><h2>Chapters</h2>';
          outline.sections.forEach((s, i) => {
            html += `<div style="padding:4px 0;font-size:14px;">${i+1}. ${escapeHtml(s.title)}</div>`;
          });
          html += '</div>';
        }

        if (markdown) {
          html += `<div class="section"><h2>Full Report</h2><div class="content">${escapeHtml(markdown)}</div></div>`;
        }

        html += `<div class="meta">Simulation ID: ${escapeHtml(simId || 'N/A')} | Generated by MiroFish</div>`;

        app.innerHTML = html;
      } catch (err) {
        app.innerHTML = `<div class="error">Failed to load report: ${escapeHtml(err.message)}</div>`;
      }

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
      }
    })();
  </script>
</body>
</html>
```

**Step 3: Commit**

```bash
git add extensions/mirofish/src/canvas-route.ts extensions/mirofish/canvas/index.html
git commit -m "feat(extension): add Canvas/A2UI route for report visualization"
```

---

## Task 9: Update Notification Bridge for Gateway RPC

**Files:**
- Modify: `cli/lib/notify.js:79-109` (update `sendGatewayNotification` to support WebSocket)

Currently `notify.js` POSTs to `/api/message` which doesn't exist in OpenClaw Gateway (it uses WebSocket RPC). For MVP, keep the HTTP fallback but document the limitation.

**Step 1: Add a note and keep HTTP POST**

The Extension handles notifications internally (via hooks). The CLI's HTTP POST is a best-effort attempt for when the Gateway has an HTTP bridge. No code change needed for MVP.

**Step 2: Update SKILL.md to document the Extension**

Modify `skills/mirofish-predict/SKILL.md` to add a note about the Extension:

Add at the bottom:

```markdown
## OpenClaw Extension (高級整合)

如果需要 Canvas 報告、自動觸發、Gateway RPC 控制，安裝 MiroFish Extension：

1. 將 `extensions/mirofish/` 複製到 OpenClaw 的 `extensions/` 目錄
2. 執行 `cd extensions/mirofish && npm install && npm run build`
3. 重啟 OpenClaw Gateway

Extension 提供：
- **Path B:** 聊天中自動觸發推演（需設定 `autoTrigger: true`）
- **Path C:** Agent tool `mirofish_predict`（LLM 直接調用）
- **Gateway RPC:** `mirofish.predict`, `mirofish.status`, `mirofish.cancel`, `mirofish.list`
- **Canvas:** `GET /mirofish/canvas?simId=xxx`
```

**Step 3: Commit**

```bash
git add skills/mirofish-predict/SKILL.md
git commit -m "docs: add Extension integration guide to SKILL.md"
```

---

## Task 10: Integration Smoke Test

**Files:**
- Create: `extensions/mirofish/src/__tests__/integration.test.ts`

**Step 1: Write smoke test**

```typescript
// extensions/mirofish/src/__tests__/integration.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";

// Test that all modules can be imported and the plugin shape is correct
describe("MiroFish Extension Integration", () => {
  it("plugin exports correct shape", async () => {
    const mod = await import("../../index.js");
    const plugin = mod.default;

    assert.strictEqual(plugin.id, "mirofish");
    assert.strictEqual(typeof plugin.register, "function");
    assert.ok(plugin.name);
    assert.ok(plugin.description);
  });

  it("register calls all registration methods", async () => {
    const calls: string[] = [];
    const mockApi = {
      id: "test",
      logger: { info: () => {}, error: () => {} },
      pluginConfig: { cliBin: "echo" },
      registerTool: () => calls.push("tool"),
      registerHook: () => calls.push("hook"),
      registerGatewayMethod: (method: string) => calls.push(`gateway:${method}`),
      registerHttpRoute: () => calls.push("httpRoute"),
      registerService: () => calls.push("service"),
    };

    const mod = await import("../../index.js");
    mod.default.register(mockApi);

    assert.ok(calls.includes("tool"), "should register at least one tool");
    assert.ok(calls.includes("hook"), "should register message hook");
    assert.ok(calls.includes("service"), "should register service");
    assert.ok(calls.some((c) => c.startsWith("gateway:")), "should register gateway methods");

    // Verify specific gateway methods
    assert.ok(calls.includes("gateway:mirofish.predict"));
    assert.ok(calls.includes("gateway:mirofish.status"));
    assert.ok(calls.includes("gateway:mirofish.cancel"));
    assert.ok(calls.includes("gateway:mirofish.list"));
  });
});
```

**Step 2: Run test**

Run: `cd extensions/mirofish && npx tsx --test src/__tests__/integration.test.ts`
Expected: All 2 tests PASS

**Step 3: Commit**

```bash
git add extensions/mirofish/src/__tests__/integration.test.ts
git commit -m "test(extension): add integration smoke test for plugin shape and registration"
```

---

## Task 11: CLI `--json-stream` Deep Integration

**Files:**
- Modify: `cli/lib/predict.js` (full instrumentation of all 7 steps)

This task fully instruments `predict()` with NDJSON events at every step boundary.

**Step 1: Full diff for predict.js**

The key changes (apply these to the existing `predict()` function):

After line 6 (`const { notifyPredictionComplete } = require('./notify.js');`), add:
```javascript
const { JsonStreamEmitter } = require('./json-stream.js');
```

At the start of `predict()`, after `const rounds = opts.rounds || 20;`:
```javascript
    const jsonStream = opts.jsonStream
        ? new JsonStreamEmitter((line) => process.stdout.write(line + '\n'))
        : null;
    if (jsonStream) jsonStream.runStart({ topic: seedText });
    let currentStep = 0;
```

Before each "Step N" console.log, add:
```javascript
    // Before Step 1
    currentStep = 1;
    if (jsonStream) jsonStream.stepStart(1);

    // After Step 1 success (after getting projectId)
    if (jsonStream) jsonStream.stepDone(1, { projectId });

    // Before Step 2
    currentStep = 2;
    if (jsonStream) jsonStream.stepStart(2);

    // After Step 2 success
    if (jsonStream) jsonStream.stepDone(2, { graphBuilt: true });

    // Before Step 3
    currentStep = 3;
    if (jsonStream) jsonStream.stepStart(3);

    // After Step 3 success (after getting simId)
    if (jsonStream) jsonStream.stepDone(3, { simId });

    // Before Step 4
    currentStep = 4;
    if (jsonStream) jsonStream.stepStart(4);

    // After Step 4 success
    if (jsonStream) jsonStream.stepDone(4, { prepared: true });

    // Before Step 5
    currentStep = 5;
    if (jsonStream) jsonStream.stepStart(5);

    // After Step 5 (start command sent)
    if (jsonStream) jsonStream.stepDone(5, { started: true, rounds });

    // Before Step 6
    currentStep = 6;
    if (jsonStream) jsonStream.stepStart(6);

    // Inside Step 6 poll loop, after status check (where progress is printed):
    if (jsonStream) jsonStream.stepProgress(6, parseFloat(progress) / 100 || 0, runnerStatus);

    // After Step 6 success
    if (jsonStream) jsonStream.stepDone(6, { completed: true });

    // Before Step 7
    currentStep = 7;
    if (jsonStream) jsonStream.stepStart(7);

    // After Step 7 success (after getting reportData)
    if (jsonStream) jsonStream.stepDone(7, { reportId: reportData.id || reportData.report_id });
```

At the end, before the return:
```javascript
    if (jsonStream) jsonStream.runDone({
        reportId: reportData.id || reportData.report_id || simId,
        simId,
    });
```

Wrap the entire function in try-catch:
```javascript
    try {
        // ... all existing code with jsonStream instrumentation ...
    } catch (err) {
        if (jsonStream) jsonStream.runError(currentStep, err.code || 'error', err.message);
        throw err;
    }
```

Add to exports:
```javascript
module.exports = { predict, formatReport, wrapWithJsonStream: (fn) => new (require('./json-stream.js').JsonStreamEmitter)(fn) };
```

**Step 2: Manual test**

Run: `node cli/bin/mirofish.js predict "測試" --json-stream --rounds=2 2>/dev/null | head -5`
Expected: NDJSON lines starting with `{"event":"run:start",...}`

**Step 3: Commit**

```bash
git add cli/lib/predict.js
git commit -m "feat(cli): fully instrument predict pipeline with NDJSON events"
```

---

## Summary: Implementation Order

| Task | What | Path | Est. Complexity |
|:-----|:-----|:-----|:----------------|
| 1 | NDJSON Event Protocol module | Foundation | Low |
| 2 | Wire `--json-stream` flag | Foundation | Low |
| 3 | Extension scaffolding | All | Low |
| 4 | RunManager | All | Medium |
| 5 | Agent tool (Path C) | C | Low |
| 6 | Message hook (Path B) | B | Low |
| 7 | Gateway RPC methods | B, C | Low |
| 8 | Canvas route | B | Low |
| 9 | Notification bridge | B | Minimal |
| 10 | Integration smoke test | All | Low |
| 11 | CLI deep instrumentation | Foundation | Medium |

**Dependencies:** Task 1 → Task 2, Task 11. Task 3 → Tasks 4-10. Task 4 → Tasks 5, 6, 7.

**Phase 2 (future, not in this plan):**
- Extract `@mirofish/core` shared library from CLI
- Real-time progress push via Gateway WebSocket (not just polling)
- Canvas Markdown rendering with syntax highlighting
- P2P node discovery via Gateway
- Canvas A2UI native bridge for mobile (iOS/Android action tokens)
