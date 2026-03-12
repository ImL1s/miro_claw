# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## What This Is

MiroFish OpenClaw Extension — a plugin that integrates the MiroFish 55-agent social simulation prediction engine into the OpenClaw AI agent framework. All heavy lifting is delegated to the `mirofish` CLI binary via child processes; this extension is a thin integration shell.

## Build & Test

```bash
npx tsc                                    # Build (outputs to dist/)
npx tsc --noEmit                           # Type-check only
npx tsc --watch                            # Dev mode
node --test dist/src/__tests__/*.test.js   # Run all tests
node --test dist/src/__tests__/run-manager.test.js  # Single test file
```

## Architecture

The extension registers 5 integration points via `register(api)` in `index.ts`:

1. **Agent Tools** (`src/tools.ts`) — LLM-callable tools: `mirofish_predict` (non-blocking, returns runId immediately), `mirofish_status`
2. **Message Hook** (`src/hooks.ts`) — Auto-trigger predictions from chat when keywords match (disabled by default)
3. **Gateway RPC** (`src/gateway.ts`) — 4 methods: `mirofish.predict`, `mirofish.status`, `mirofish.cancel`, `mirofish.list`
4. **Canvas Route** (`src/canvas-route.ts`) — `GET /mirofish/canvas` serves report visualization HTML
5. **Service Lifecycle** — RunManager start/stop with orphan process cleanup

All paths funnel through **RunManager** (`src/run-manager.ts`), which manages CLI child processes with: concurrent limits, message deduplication, idempotency caching (TTL-based), timeout enforcement (SIGTERM → 5s → SIGKILL), and dual-key run tracking.

## Key Patterns

- **NDJSON protocol**: CLI spawned with `--json-stream` flag. Events parsed from stdout line-by-line. Key events: `run:start`, `step:start/progress/done`, `run:done` (with `reportId`, `simId`), `run:error`, `run:cancelled`.
- **Dual-key RunManager**: Both temp `run-{timestamp}` and real UUID from CLI point to the same `ActiveRun` object in the Map. Deduplication in list endpoints uses `Set` with object identity.

## Environment

- **`MIROFISH_DISCORD_WEBHOOK`**: Discord webhook URL for start/complete/cancel/error notifications
- **Plugin config** (`openclaw.plugin.json`): `backendUrl`, `maxConcurrent`, `autoTrigger`
- **Default backend**: `http://localhost:5001`
- **Default CLI binary**: `mirofish` (from PATH)

## Testing Against OpenClaw Gateway

```bash
# RPC calls
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list --params '{}'

# Agent tool test
openclaw agent --agent main -m "Check mirofish prediction status"
```
