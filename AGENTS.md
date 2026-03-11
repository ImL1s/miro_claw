CLAUDE.md
AGENTS.md
GEMINI.md

This file provides guidance to AI coding agents (Claude Code, Gemini, etc.) when working with code in this repository.

## Project Overview

MiroClaw is an integration project combining [MiroFish](https://github.com/666ghj/MiroFish) (a multi-agent simulation engine featuring 55 AI Agents) and OpenClaw. It packages the swarm intelligence deduction engine into a Node.js CLI tool (`mirofish-cli`) and an OpenClaw skill/extension.

### Vision: Decentralized Swarm Intelligence Prediction Protocol
1. **Deduction Layer**: MiroFish Engine (GraphRAG + OASIS multi-agent simulation + Report AI)
2. **Agent Layer**: OpenClaw Gateway Network (P2P communication, Task dispatch)
3. **Consensus Layer**: Cosmos SDK AppChain (Optional - for on-chain attestation & reputation)

## Architecture & Repository Structure

```
miro_claw/
├── cli/                    # mirofish-cli npm package (Node.js, zero deps)
│   ├── bin/mirofish.js     # CLI entry point (12 subcommands)
│   ├── lib/
│   │   ├── predict.js      # 7-step async pipeline (seed expand → report)
│   │   ├── docker.js       # Backend lifecycle: Docker-first → native fallback
│   │   ├── api.js          # HTTP client (MIROFISH_URL → Flask backend)
│   │   ├── p2p.js          # P2P seed/result broadcast to peers
│   │   ├── peer-config.js  # Peer CRUD (persisted in ~/.mirofish/peers.json)
│   │   ├── meta-report.js  # Multi-node report merge + consensus analysis
│   │   ├── canvas.js       # Express server to serve Canvas dashboard
│   │   ├── notify.js       # Cross-platform notifications + OpenClaw Gateway push
│   │   └── json-stream.js  # NDJSON event protocol (CLI ↔ Extension IPC)
│   ├── canvas/             # Static Canvas Dashboard (index.html + app.js + style.css)
│   └── test/               # 6 test files (unit + E2E)
├── extensions/
│   └── mirofish/           # OpenClaw Extension (TypeScript)
│       ├── index.ts         # Plugin entry: tools, hooks, gateway RPC, canvas route
│       └── src/            # RunManager, tools, hooks, gateway, canvas-route
├── skills/
│   └── mirofish-predict/   # OpenClaw Skill (SKILL.md)
├── MiroFish/               # Core Engine (Git Submodule - Python/Vue)
│   ├── backend/            # Python Flask API (:5001)
│   │   ├── app/api/        # 4 Blueprints: graph, simulation, report, p2p
│   │   ├── run.py          # Entry point
│   │   └── pyproject.toml  # uv dependency management
│   └── frontend/           # Vue 3 + Vite SPA (:3000)
├── docker-compose.p2p.yml  # Multi-node P2P Docker setup (node-a:5001, node-b:5002)
├── docs/                   # Vision doc, phase plans
└── .env                    # Global: zep_account, zep_api_key, model_name
```

### Backend Lifecycle (`docker.js`)

The CLI auto-manages the MiroFish Flask backend:
1. **Docker mode** (preferred): pulls `ghcr.io/666ghj/mirofish:latest`, runs container
2. **Native fallback** (Apple Silicon / no Docker): finds `MiroFish/` source, runs `uv run python run.py` as detached process
3. State stored in `~/.mirofish/`: `.env` (API keys), `backend.pid` (native PID), `config.json` (saved MiroFish path), `peers.json` (P2P peers)
4. `ensureRunning()` auto-starts if not running — called before every prediction

### Core Prediction Pipeline (7-step Async Flow)
1. `POST /api/graph/ontology/generate` — multipart upload (LLM extracts ontology)
2. `POST /api/graph/build` → async `task_id` polling via `GET /api/graph/task/<id>`
3. `POST /api/simulation/create`
4. `POST /api/simulation/prepare` → async polling via `POST /api/simulation/prepare/status`
5. `POST /api/simulation/start` (with `max_rounds`)
6. `GET /api/simulation/<id>/run-status` — poll every 15s, max 60 min
7. `POST /api/report/generate` → poll `GET /api/report/check/<id>` for completion

**Seed expansion**: inputs <200 chars are auto-expanded to ~1100 chars structured document for better ZEP entity extraction.

### NDJSON Event Protocol (`json-stream.js`)

CLI ↔ Extension communication uses newline-delimited JSON. Events: `run:start`, `step:start`, `step:progress`, `step:done`, `run:done`, `run:error`. Each event carries `ts`, `runId`, and step-specific data. Enabled via `--json-stream` flag.

### OpenClaw Extension (`extensions/mirofish/`)

TypeScript plugin that integrates MiroFish into OpenClaw Gateway via 4 paths:
- **Path C (Agent Tools)**: LLM-callable tools for prediction
- **Path B (Message Hook)**: `agent_end` hook for auto-triggering predictions from chat
- **Gateway RPC**: Control plane methods for managing runs
- **Canvas Route**: HTTP route to serve the visual dashboard
- **RunManager**: Concurrency-limited child process orchestrator (spawn `mirofish predict --json-stream`)

### P2P Distributed Simulation

- **In-memory stores** with `threading.Lock` in Python backend (data lost on restart)
- **Auto-Predict**: env `P2P_AUTO_PREDICT=true` makes backend spawn `node mirofish.js predict ... --p2p-reply-only` on seed receipt
- **Docker Compose**: `docker-compose.p2p.yml` provisions 2 nodes on `p2p-net` bridge network
- CLI flag `--p2p` broadcasts seed before and result after local prediction

## Development Commands

**Full Stack (MiroFish Core)**
* Setup: `cd MiroFish && npm run setup:all`
* Dev Server (Frontend + Backend): `cd MiroFish && npm run dev`
* Backend Only: `cd MiroFish && npm run backend`
* Frontend Only: `cd MiroFish && npm run frontend`

**Testing**
* Python Backend: `cd MiroFish/backend && uv run pytest tests -v`
* CLI Unit Tests (run individually):
  - `node cli/test/peer-config.test.js`
  - `node cli/test/p2p.test.js`
  - `node cli/test/meta-report.test.js`
  - `node cli/test/json-stream.test.js`
  - `node cli/test/predict-json-stream.test.js`
* Full P2P E2E (bash, uses live port binding): `bash cli/test/e2e-p2p.sh`

**Local CLI Testing**
* `node cli/bin/mirofish.js predict "Topic" --rounds=10`
* `node cli/bin/mirofish.js predict "Topic" --p2p` (distributed)
* `node cli/bin/mirofish.js meta "Topic"` (P2P consensus)
* `node cli/bin/mirofish.js canvas <sim_id>` (visual dashboard)

**Extension Build**
* `cd extensions/mirofish && npm run build` (TypeScript → dist/)

## Environment Variables

| Variable | Used By | Description |
|:---|:---|:---|
| `LLM_API_KEY` | Backend | Any OpenAI-format API key |
| `LLM_BASE_URL` | Backend | LLM endpoint (Docker: `host.docker.internal:1234/v1`, native: auto-rewritten to `localhost`) |
| `LLM_MODEL_NAME` | Backend | Model name for inference |
| `ZEP_API_KEY` | Backend | Zep Cloud GraphRAG key |
| `MIROFISH_URL` | CLI | Backend URL (default: `http://localhost:5001`) |
| `MIROFISH_DIR` | CLI | Override MiroFish source directory for native mode |
| `P2P_AUTO_PREDICT` | Backend | `true` to auto-run predictions on received seeds |
| `OPENCLAW_GATEWAY_URL` | CLI | Gateway URL for push notifications (default: `http://localhost:18787`) |

## Technical Decisions & Conventions

* **Python Backend**: Flask factory pattern, 4 Blueprints (`graph`, `simulation`, `report`, `p2p`), `uv` for deps. 4-space indent, `snake_case`.
* **JavaScript/Node CLI**: Zero runtime dependencies (only stdlib `http`, `fs`, `child_process`, `crypto`). 2-space indent, single quotes, minimal semicolons.
* **Extension**: TypeScript, compiled to `dist/`. Delegates all business logic to CLI child processes via NDJSON.
* **LLM & Memory**: OpenAI SDK wrapper (configurable base URLs) for any local/remote model. Zep Cloud for GraphRAG.
* **Commits**: Conventional Commits format (e.g., `feat(p2p): add auto-predict`, `fix(cli): fix timeout`).
* **Test Hygiene**: Test isolation required. Mock files or reset fetch mocks via `try/finally`. E2E uses live port binding (5091/5092) with rigorous cleanup traps (`trap cleanup EXIT`).
