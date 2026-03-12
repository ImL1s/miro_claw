# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

MiroClaw integrates [MiroFish](https://github.com/666ghj/MiroFish) (55 AI Agent social simulation engine) with OpenClaw. It packages the swarm intelligence deduction engine into a Node.js CLI (`mirofish-cli`) and an OpenClaw extension.

**Three layers**: MiroFish Engine (GraphRAG + OASIS simulation) → OpenClaw Gateway (P2P, task dispatch) → Optional Cosmos SDK AppChain (on-chain attestation).

**Distributed**: 55 agents can be split across multiple machines via `oasis-distributed/` (gRPC + Docker).

## Development Commands

### CLI (Node.js, zero runtime deps)
```bash
node cli/bin/mirofish.js predict "Topic" --rounds=10        # Full pipeline
node cli/bin/mirofish.js predict "Topic" --distributed       # Distributed simulation (Docker/Native)
node cli/bin/mirofish.js predict "Topic" --p2p               # P2P broadcast and simulate
node cli/bin/mirofish.js predict "Topic" --json-stream       # NDJSON output for extension IPC
node cli/bin/mirofish.js meta "Topic"                        # P2P consensus merge
node cli/bin/mirofish.js canvas <sim_id>                     # Visual dashboard
node cli/bin/mirofish.js serve start|stop|status             # Backend lifecycle
node cli/bin/mirofish.js peers add|remove|list|health        # Peer management
node cli/bin/mirofish.js chat <sim_id> "question"            # Report Agent chat
node cli/bin/mirofish.js interview <sim_id> <agent_id> "q"   # Interview agent
node cli/bin/mirofish.js env                                 # Show config
```

### Extension (TypeScript)
```bash
cd extensions/mirofish && npx tsc              # Build → dist/
cd extensions/mirofish && npx tsc --noEmit     # Type-check only
cd extensions/mirofish && npx tsc --watch      # Dev mode
```

### MiroFish Core (Git Submodule)
```bash
cd MiroFish && npm run setup:all    # First-time setup
cd MiroFish && npm run dev          # Frontend (:3000) + Backend (:5001)
cd MiroFish && npm run backend      # Backend only
cd MiroFish/backend && uv run pytest tests -v   # Python tests
```

### CLI Tests (run individually, no test framework)
```bash
node cli/test/peer-config.test.js
node cli/test/p2p.test.js
node cli/test/meta-report.test.js
node cli/test/json-stream.test.js
node cli/test/predict-json-stream.test.js
bash cli/test/e2e-p2p.sh             # Full P2P E2E (uses ports 5091/5092)
```

### Testing Against OpenClaw Gateway
```bash
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list --params '{}'
```

## Architecture

### Data Flow
```
User Input → CLI predict (7 async steps) → Flask Backend (:5001)
                ↓ --json-stream
         Extension RunManager → NDJSON events → SSE Broadcaster → Gateway clients
                ↓ --p2p
         Peer nodes (seed broadcast → parallel simulation → meta-report merge)
```

### CLI (`cli/`) — Node.js, stdlib only
- `bin/mirofish.js` — Entry point, 12 subcommands
- `lib/predict.js` — 7-step async pipeline: ontology → graph build → sim create → prepare → start → poll (15s intervals, 60min max) → report. Inputs <200 chars auto-expanded to ~1100 char structured document.
- `lib/docker.js` — Backend lifecycle: Docker-first (`ghcr.io/666ghj/mirofish:latest`), native fallback (`uv run python run.py`). `ensureRunning()` called before every prediction.
- `lib/api.js` — HTTP client targeting `MIROFISH_URL` (default `localhost:5001`)
- `lib/json-stream.js` — NDJSON event protocol. In `--json-stream` mode, stdout is pure NDJSON, human output goes to stderr.
- `lib/notify.js` — Cross-platform notifications (osascript/notify-send/powershell) + OpenClaw Gateway push
- `lib/p2p.js` — Seed/result broadcast to peers
- `lib/peer-config.js` — Peer CRUD (persisted `~/.mirofish/peers.json`)
- `lib/meta-report.js` — Multi-node report merge + consensus
- `lib/canvas.js` — Express server for Canvas dashboard
- State directory: `~/.mirofish/` (`.env`, `backend.pid`, `config.json`, `peers.json`)

### Extension (`extensions/mirofish/`) — TypeScript, ES2022, Node16 modules
Thin integration shell — all business logic delegated to CLI child processes via NDJSON.

`index.ts` registers 6 integration points via `register(api)`:
1. **Agent Tools** (`src/tools.ts`) — `mirofish_predict` (non-blocking, returns runId), `mirofish_status`
2. **Message Hook** (`src/hooks.ts`) — `agent_end` hook, keyword-triggered auto-predict (disabled by default)
3. **Gateway RPC** (`src/gateway.ts`) — 4 methods: `mirofish.predict`, `.status`, `.cancel`, `.list`
4. **SSE Broadcaster** (`src/progress-broadcaster.ts`) — Real-time event push, wired to RunManager events
5. **Canvas Route** (`src/canvas-route.ts`) — `GET /mirofish/canvas` serves report visualization
6. **P2P Peer Discovery** (`src/peer-discovery.ts`) — Automatic peer detection

Supporting modules:
- `src/run-manager.ts` — Core orchestrator: concurrency limits, deduplication (topic+window), idempotency cache (TTL), timeout (SIGTERM → 5s → SIGKILL), dual-key run tracking (temp `run-{ts}` + real UUID)
- `src/backend-client.ts` — Direct HTTP client to Flask backend (uses Node 22+ native fetch)
- `src/chat-session.ts` — Per-simulation chat history (max 20 messages, used by tools + gateway)

### Distributed Layer (`oasis-distributed/`) — Python, gRPC
Splits 55 OASIS agents across multiple machines. Coordinator keeps Platform (SQLite + RecSys) centralized; Workers run LLM calls remotely.

- `oasis/network/channel_server.py` — gRPC server: Register, Heartbeat, WaitForRound, GetContext, SendAction, RoundComplete, Unregister
- `oasis/network/channel_client.py` — Worker-side gRPC client (`WorkerNetworkChannel`)
- `oasis/network/worker_runtime.py` — Worker agent execution loop + graceful shutdown
- `oasis/network/safe_pickle.py` — `RestrictedUnpickler` (security: blocks arbitrary code execution via pickle payloads)
- `oasis/network/proto/channel.proto` — 7 RPCs defining Coordinator↔Worker contract
- `Dockerfile.coordinator` — Multi-stage build (Poetry export → slim runtime, camel-ai compat patch)
- `Dockerfile.worker` — Slim image with only grpcio + protobuf
- `docker-compose.distributed.yml` — Full stack: 1 Coordinator + N Workers
- Tests: `python3.11 -m pytest tests/ -v` (45 tests)

### MiroFish Backend (Git Submodule) — Python Flask
- 4 Blueprints: `graph`, `simulation`, `report`, `p2p`
- In-memory stores with `threading.Lock` (data lost on restart)
- `uv` for dependency management

### NDJSON Event Protocol
Events: `run:start`, `step:start`, `step:progress`, `step:done`, `run:done` (carries `reportId`, `simId`), `run:error`, `run:cancelled`. Each has `ts`, `runId`.

## Environment Variables

| Variable | Used By | Description |
|:---|:---|:---|
| `LLM_API_KEY` | Backend | Any OpenAI-format API key |
| `LLM_BASE_URL` | Backend | LLM endpoint URL |
| `LLM_MODEL_NAME` | Backend | Model name for inference |
| `ZEP_API_KEY` | Backend | Zep Cloud GraphRAG key |
| `MIROFISH_URL` | CLI + Extension | Backend URL (default: `http://localhost:5001`) |
| `MIROFISH_DIR` | CLI | Override MiroFish source directory for native mode |
| `P2P_AUTO_PREDICT` | Backend | `true` to auto-run predictions on received seeds |
| `OPENCLAW_GATEWAY_URL` | CLI | Gateway URL for push notifications (default: `http://localhost:18787`) |
| `MIROFISH_DISCORD_WEBHOOK` | Extension | Discord webhook URL for run notifications |
| `MIROFISH_CLUSTER_TOKEN` | Distributed | Pre-shared token for gRPC auth between Coordinator and Workers |
| `COORDINATOR_ADDR` | Worker | Coordinator gRPC address (default: `localhost:50051`) |

## Deployment Modes

### 1. Single Machine (Default)
Extension spawns CLI → CLI auto-starts Docker backend → everything local. No config needed.

### 2. Docker Compose Distributed
```bash
cd oasis-distributed && docker compose -f docker-compose.distributed.yml up
```
Coordinator + Workers on same or different machines. TLS + token auth.

### 3. Native (No Docker)
```bash
python3 scripts/run_coordinator.py   # Terminal 1
python3 scripts/run_worker.py        # Terminal 2
```
For development and step-through debugging.

## Conventions

- **Python Backend**: 4-space indent, `snake_case`, Flask factory pattern, `uv` for deps
- **Node CLI**: 2-space indent, single quotes, minimal semicolons. Zero runtime dependencies (stdlib only: `http`, `fs`, `child_process`, `crypto`). Requires Node >=18.
- **Extension**: TypeScript strict mode, ES2022 target, Node16 module resolution. Uses Node 22+ native `fetch`. Compiled to `dist/`.
- **Commits**: Conventional Commits — `feat(p2p):`, `fix(cli):`, `docs:`, etc.
- **Test isolation**: Mock files or reset fetch mocks via `try/finally`. E2E uses live port binding (5091/5092) with cleanup traps (`trap cleanup EXIT`).
