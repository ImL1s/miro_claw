# MiroFish Bot Stability Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the MiroFish Discord bot so predictions complete reliably and results are never "lost."

**Architecture:** Three layers of fixes: (1) OpenClaw infra (update + model config), (2) RunManager state tracking (completedRuns Map + 3-layer status query), (3) notify.js security fix.

**Tech Stack:** Node.js CLI (zero deps), TypeScript extension, OpenClaw gateway

---

## Context

**Symptoms observed (Discord screenshot):**
- 4 runs triggered, 3 returned "找不到結果", 1 still running after 10 min
- Agent fails with: "zai/glm-5: rate_limit, zai/glm-4.7: rate_limit, openai-codex/gpt-5.4: model_not_found"
- Bot says "結果經常消失"

**Root causes identified:**
1. All 3 agent models failing (2 rate-limited, 1 doesn't exist) → agent can't function
2. `mirofish_status` only queries in-memory `activeRuns` Map → returns "not_found" after CLI process exits
3. No completed-run tracking → results genuinely lost from extension perspective
4. `notify.js` has shell injection via `execSync` with string interpolation

**Files involved:**
- `~/.openclaw/openclaw.json` — model fallback config
- `extensions/mirofish/src/run-manager.ts` — process lifecycle
- `extensions/mirofish/src/tools.ts` — agent tools (mirofish_status)
- `extensions/mirofish/src/gateway.ts` — RPC methods (mirofish.status)
- `cli/lib/notify.js` — system notifications

---

### Task 1: Update OpenClaw to latest

**Files:**
- Modify: none (npm global package)

**Step 1: Update**

```bash
npm update -g openclaw
```

Expected: `2026.3.2` → `2026.3.8`

**Step 2: Verify**

```bash
openclaw --version
```

Expected: `2026.3.8`

---

### Task 2: Fix model fallback config

**Files:**
- Modify: `~/.openclaw/openclaw.json` — `agents.defaults.model.fallbacks`

**Step 1: Replace invalid model**

In `~/.openclaw/openclaw.json`, change the `agents.defaults.model` section:

```json
{
  "primary": "zai/glm-5",
  "fallbacks": [
    "zai/glm-4.7",
    "zai/glm-4.5-air"
  ]
}
```

Remove `openai-codex/gpt-5.4` (doesn't exist). Replace with `zai/glm-4.5-air` (already defined in `agents.defaults.models`).

Also remove the `openai-codex/gpt-5.4` entry from `agents.defaults.models`:

```json
"models": {
  "zai/glm-4.5-air": { "alias": "GLM Air" },
  "zai/glm-5": { "alias": "GLM 5" },
  "zai/glm-4.7": { "alias": "GLM 4.7" }
}
```

**Step 2: Verify config is valid JSON**

```bash
python3 -c "import json; json.load(open('$HOME/.openclaw/openclaw.json'))" && echo "OK"
```

Expected: `OK`

---

### Task 3: Add completedRuns tracking to RunManager

**Files:**
- Modify: `extensions/mirofish/src/run-manager.ts`

**Step 1: Add CompletedRun type and completedRuns Map**

After the `CacheEntry` interface (~line 62), add:

```typescript
interface CompletedRun {
  runId: string;
  topic: string;
  simId: string;
  reportId: string;
  completedAt: number;
}
```

Add to `RunManager` interface (~line 40):

```typescript
getCompletedRun(runId: string): CompletedRun | null;
```

Inside `createRunManager`, after `const resultCache = ...` (~line 78):

```typescript
const completedRuns = new Map<string, CompletedRun>();
const MAX_COMPLETED = 20;
```

**Step 2: Record completions in NDJSON parser**

In the `child.stdout?.on("data", ...)` handler (~line 193-208), after `opts.onEvent(event)`, add:

```typescript
// Track completed runs so status queries work after process exit
if (event.event === "run:done") {
  const completed: CompletedRun = {
    runId: currentRunId,
    topic,
    simId: (event.simId as string) || "",
    reportId: (event.reportId as string) || "",
    completedAt: Date.now(),
  };
  completedRuns.set(tempRunId, completed);
  // Also store under real runId alias if different
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
```

**Step 3: Expose getCompletedRun**

Add helper function:

```typescript
function getCompletedRun(runId: string): CompletedRun | null {
  return completedRuns.get(runId) ?? null;
}
```

Add to return object:

```typescript
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
```

**Step 4: Type-check**

```bash
cd extensions/mirofish && npx tsc --noEmit
```

Expected: errors in tools.ts/gateway.ts (interface change) — fixed in Task 4.

---

### Task 4: Upgrade mirofish_status to 3-layer query

**Files:**
- Modify: `extensions/mirofish/src/tools.ts:127-145` — `mirofish_status` tool
- Modify: `extensions/mirofish/src/gateway.ts:183-213` — `mirofish.status` RPC

**Step 1: Fix tools.ts — mirofish_status execute**

Replace the entire `mirofish_status` execute method (~line 127-145):

```typescript
async execute(_toolCallId: string, { runId }: { runId: string }): Promise<string> {
  // Layer 1: Check active runs
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

  // Layer 2: Check completed runs
  const completed = runManager.getCompletedRun(runId);
  if (completed) {
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
```

**Step 2: Fix gateway.ts — mirofish.status RPC**

Replace the `mirofish.status` handler body (~line 183-213):

```typescript
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

    // Layer 2: Completed runs
    const completed = runManager.getCompletedRun(runId);
    if (completed) {
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
    // List all: active + recent completed
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
```

**Step 3: Type-check**

```bash
cd extensions/mirofish && npx tsc --noEmit
```

Expected: PASS

**Step 4: Commit**

```bash
git add extensions/mirofish/src/run-manager.ts extensions/mirofish/src/tools.ts extensions/mirofish/src/gateway.ts
git commit -m "fix(extension): add completedRuns tracking, 3-layer status query

RunManager now keeps a Map of recently completed runs (max 20).
mirofish_status and mirofish.status check: activeRuns → completedRuns → not_found.
This prevents results from 'disappearing' after CLI process exits."
```

---

### Task 5: Fix notify.js shell injection

**Files:**
- Modify: `cli/lib/notify.js:24-70`

**Step 1: Replace execSync with execFileSync for macOS**

Replace the macOS branch (~line 28-37):

```javascript
if (platform === 'darwin') {
    const { execFileSync } = require('child_process');
    const parts = [
        `display notification "${escapeAppleScript(body)}"`,
        `with title "${escapeAppleScript(title)}"`,
    ];
    if (subtitle) {
        parts.push(`subtitle "${escapeAppleScript(subtitle)}"`);
    }
    execFileSync('osascript', ['-e', parts.join(' ')], { stdio: 'ignore' });
```

**Step 2: Replace execSync with execFileSync for Linux**

Replace the Linux branch (~line 38-40):

```javascript
} else if (platform === 'linux') {
    const { execFileSync } = require('child_process');
    execFileSync('notify-send', [title, body], { stdio: 'ignore' });
```

**Step 3: Replace execSync for URL open**

Replace the URL open block (~line 59-68):

```javascript
if (url) {
    try {
        const { execFileSync } = require('child_process');
        if (platform === 'darwin') {
            execFileSync('open', [url], { stdio: 'ignore' });
        } else if (platform === 'linux') {
            execFileSync('xdg-open', [url], { stdio: 'ignore' });
        }
        // Windows start command needs shell, skip for now
    } catch { /* ignore */ }
}
```

**Step 4: Remove unused escapeShell function**

Delete `escapeShell` (~line 170-172). It's no longer used after switching to `execFileSync`.

**Step 5: Update require at top**

Replace line 11:

```javascript
const { execFileSync } = require('child_process');
```

And remove the `const { execSync } = require('child_process');` import. Use `execFileSync` everywhere (already imported once at top).

**Step 6: Commit**

```bash
git add cli/lib/notify.js
git commit -m "fix(cli): replace execSync with execFileSync to prevent shell injection

notify.js used execSync with string interpolation for system notifications.
Crafted topic strings could escape quoting and execute arbitrary commands.
Switch to execFileSync with args array to avoid shell interpretation entirely."
```

---

### Task 6: Build, deploy, and restart gateway

**Step 1: Build extension**

```bash
cd extensions/mirofish && npx tsc
```

Expected: clean build, output in `dist/`

**Step 2: Deploy to OpenClaw**

```bash
cp -r extensions/mirofish/dist/* ~/.openclaw/extensions/mirofish/dist/
```

**Step 3: Restart gateway**

```bash
openclaw gateway stop 2>/dev/null; sleep 1; openclaw gateway start
```

**Step 4: Verify mirofish loaded**

```bash
tail -20 /private/tmp/openclaw-gateway.log | grep -i mirofish
```

Expected: `[MiroFish] Registered gateway methods` and `Extension loaded. RunManager ready.`

**Step 5: Verify model config**

```bash
tail -20 /private/tmp/openclaw-gateway.log | grep "agent model"
```

Expected: `agent model: zai/glm-5` (same primary, but fallbacks now valid)

---

## Execution Order

```
Task 1 (npm update)  ──┐
Task 2 (model config) ─┤── Can run in parallel (independent)
Task 5 (notify.js)   ──┘
        │
Task 3 (RunManager completedRuns)
        │
Task 4 (3-layer status query) ── depends on Task 3
        │
Task 6 (build + deploy + restart) ── depends on all above
```
