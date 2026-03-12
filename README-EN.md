<div align="center">

# MiroClaw

**Decentralized Swarm Intelligence Prediction Protocol**

[MiroFish](https://github.com/666ghj/MiroFish) (55 AI Agents) × [OpenClaw](https://openclaw.ai) Gateway × Cosmos SDK

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

English | [简体中文](./README-CN.md) | [繁體中文](./README.md)

</div>

---

## What is this?

MiroClaw wraps [MiroFish](https://github.com/666ghj/MiroFish) (a simulation engine where 55 AI Agents interact on simulated social platforms) into a CLI tool and an [OpenClaw](https://openclaw.ai) extension, enabling swarm intelligence predictions with a single command.

**Just type one sentence:**

```bash
mirofish predict "What happens to the crypto market if Bitcoin breaks $150K?"
```

MiroClaw automatically: starts the backend → builds a knowledge graph → spawns 55 Agents → runs social simulation → outputs a prediction report.

## Three Operating Modes

```
Mode 1: Standalone Prediction ✅ Done
┌──────────────────────────────────┐
│  OpenClaw Gateway + MiroFish CLI │
│  Full pipeline on a single node  │
└──────────────────────────────────┘

Mode 2: P2P Distributed Prediction ✅ Done
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Node A  │◄──►│  Node B  │◄──►│  Node C  │
│  55 Agent│    │  55 Agent│    │  55 Agent│
└──────────┘    └──────────┘    └──────────┘
  Each predicts → Broadcasts results → Merges consensus report

Mode 3: On-chain Attestation 🚧 Planned
┌──────────────────────────────────┐
│  Cosmos SDK AppChain             │
│  On-chain results · Reputation   │
└──────────────────────────────────┘
```

## Three-Layer Architecture

| Layer | Technology | Status |
|:---|:---|:---|
| **Deduction** | MiroFish Engine (GraphRAG + OASIS multi-agent simulation + Report AI) | ✅ Done |
| **Agent** | OpenClaw Gateway Network (P2P communication, task dispatch, Canvas visualization) | ✅ Done |
| **Consensus** | Cosmos SDK AppChain (prediction attestation, reputation scoring, zero gas fees) | 🚧 Planned |

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Docker Desktop** (recommended) or Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- **LLM API Key** (OpenAI format, any compatible API, recommended >= 14B parameter model)
- **[Zep Cloud](https://www.getzep.com/) API Key** (for GraphRAG, free tier works)

### Installation

```bash
git clone --recursive https://github.com/your-org/miro_claw.git
cd miro_claw
```

### First-time Setup

```bash
# 1. Start backend (auto-pulls Docker image on first run)
node cli/bin/mirofish.js serve start
# → Generates ~/.mirofish/.env template if not configured

# 2. Fill in API keys
#    Edit ~/.mirofish/.env with LLM_API_KEY, LLM_BASE_URL, ZEP_API_KEY

# 3. Restart
node cli/bin/mirofish.js serve start

# 4. Verify environment
node cli/bin/mirofish.js env
```

> **Apple Silicon users**: No ARM64 Docker image available. The CLI auto-falls back to native mode (requires the `MiroFish/` submodule and `uv`).

### Run a Prediction

```bash
# Basic prediction (default 20 rounds)
mirofish predict "Impact of Fed rate cuts on tech stocks"

# Custom round count (start with 10, increase to 40 if results are good)
mirofish predict "Topic" --rounds=10

# Auto-open visual Dashboard after completion
mirofish predict "Topic" --canvas

# P2P distributed prediction (requires peers)
mirofish predict "Topic" --p2p
```

### Interactive Features

```bash
# Follow-up questions on the report
mirofish chat <sim_id> "Which KOLs had the most extreme views?"

# Interview a specific Agent
mirofish interview <sim_id> 0 "What's your take on this?"

# Visual Dashboard
mirofish canvas <sim_id>
```

## User-Facing Usage

When you install the MiroFish skill into OpenClaw, all functionalities are automatically enabled without needing to understand the underlying infrastructure:

### 1. Agent Auto-Trigger via Chat
Simply type prediction keywords in the chat.
> "Predict Bitcoin's trend next week" → Agent automatically calls the `mirofish_predict` tool → SSE pushes real-time progress → Returns the result upon completion.

### 2. Gateway RPC
Suitable for system integrations or external script calls.
```bash
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
# Returns immediately: {"runId": "run-xxx"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
```

### 3. CLI operations
Suitable for advanced developers.
```bash
mirofish predict "Bitcoin's trend next week"
```
(Prediction results are printed directly to the terminal, and system notifications are provided)

## Infrastructure Deployment Modes

We provide three underlying deployment modes to suit different team sizes:

### 1. Single Machine Docker Compose (Default & Easiest)
```bash
docker compose up
```
Coordinator and Worker(s) run on the same machine. Ideal for local development and demos.

### 2. LAN Distributed Deployment (Multi-Machine)
Suitable for labs or teams looking to distribute GPU workloads.
```bash
# Node A — Coordinator
docker run -p 50051:50051 -v ./certs:/app/certs oasis-coordinator

# Nodes B, C — Workers
docker run -e COORDINATOR_ADDR=192.168.x.x:50051 -v ./certs:/app/certs:ro oasis-worker
```
Secured via TLS and token authentication (`MIROFISH_CLUSTER_TOKEN`).

### 3. Native Mode (No Docker)
Suitable for Python developers to step-through debug.
```bash
python3 scripts/run_coordinator.py   # Terminal 1
python3 scripts/run_worker.py --coordinator localhost:50051  # Terminal 2
```

## P2P Distributed Prediction

Multiple machines each run MiroFish independently, share results with each other, then merge into a consensus analysis.

### Set Up Peers

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers list
mirofish peers health
```

### Distributed Prediction Flow

```bash
# --p2p: broadcasts seed to all peers, runs locally in parallel, broadcasts result
mirofish predict "What if Bitcoin breaks 150K" --p2p

# Collect results from all nodes, generate consensus report
mirofish meta "What if Bitcoin breaks 150K"
```

```
Node A (your machine)       Node B (lab-server)       Node C (gpu-box)
──────────────────        ──────────────          ────────────
1. Broadcast seed ────────> Receives seed          Receives seed
2. Local prediction starts  [Auto/manual predict]  [Auto/manual predict]
3. Local prediction done    Prediction done        Prediction done
4. Broadcast result ──────> Stores result          Stores result
5. mirofish meta ←───────── Returns result ─────── Returns result
   → Merged consensus report
```

### Auto-Predict (Optional)

Let peers auto-predict when they receive a seed:

```bash
# Add to ~/.mirofish/.env
P2P_AUTO_PREDICT=true
```

> ⚠️ Auto-predict consumes LLM API quota. Disabled by default.

### P2P API

Each MiroFish backend automatically exposes:

| Endpoint | Method | Description |
|:---|:---|:---|
| `/api/p2p/predict` | POST | Receive seed broadcast |
| `/api/p2p/result` | POST | Receive prediction results from other nodes |
| `/api/p2p/results?topic=...` | GET | Query collected results |
| `/api/p2p/seeds` | GET | View received seeds |

## Full Command Reference

| Command | Description |
|:---|:---|
| `mirofish predict "topic"` | Full prediction (auto-starts backend) |
| `mirofish predict "topic" --rounds=10` | Set simulation rounds |
| `mirofish predict "topic" --p2p` | P2P distributed prediction |
| `mirofish predict "topic" --canvas` | Auto-open Dashboard after completion |
| `mirofish predict "topic" --json-stream` | NDJSON output (for Extension IPC) |
| `mirofish predict "topic" --platform=twitter` | Simulation platform (twitter/reddit/parallel) |
| `mirofish serve start\|stop\|status` | Manage MiroFish backend |
| `mirofish canvas <sim_id>` | Open visual Dashboard |
| `mirofish projects` | List all projects |
| `mirofish status <sim_id>` | Check simulation progress |
| `mirofish report <sim_id>` | Get prediction report |
| `mirofish chat <sim_id> "question"` | Follow-up questions on report |
| `mirofish interview <sim_id> <agent_id> "question"` | Interview a specific Agent |
| `mirofish peers add\|remove\|list\|health` | Manage P2P peer nodes |
| `mirofish meta "topic"` | Merge P2P consensus report |
| `mirofish env` | Show environment configuration |

## OpenClaw Extension

The extension integrates MiroFish into OpenClaw Gateway, providing:

- **Agent Tool** — LLM-callable `mirofish_predict` (async, returns runId immediately)
- **Message Hook** — Auto-trigger predictions from chat keywords (disabled by default)
- **Gateway RPC** — `mirofish.predict` / `.status` / `.cancel` / `.list`
- **SSE Real-time Push** — Live progress streaming to clients
- **Canvas Route** — `GET /mirofish/canvas` for report visualization

```bash
# Install
cd extensions/mirofish && npm install && npx tsc

# Test via Gateway RPC
openclaw gateway call mirofish.predict --params '{"topic": "Your topic"}'
openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list --params '{}'
```

## Environment Variables

| Variable | Purpose | Default |
|:---|:---|:---|
| `LLM_API_KEY` | LLM API key | — |
| `LLM_BASE_URL` | LLM endpoint | — |
| `LLM_MODEL_NAME` | Model name | — |
| `ZEP_API_KEY` | Zep Cloud GraphRAG key | — |
| `MIROFISH_URL` | MiroFish backend URL | `http://localhost:5001` |
| `MIROFISH_DIR` | MiroFish source path (native mode) | Auto-detected |
| `P2P_AUTO_PREDICT` | Auto-predict on seed receipt | `false` |
| `OPENCLAW_GATEWAY_URL` | Gateway push URL | `http://localhost:18787` |
| `MIROFISH_DISCORD_WEBHOOK` | Discord notification webhook | — |

## Troubleshooting

```bash
# Verify LLM is reachable
curl http://YOUR_LLM_IP:1234/v1/models

# Check backend health
curl http://localhost:5001/health

# P2P: view received seeds
curl http://localhost:5001/api/p2p/seeds

# Check native mode PID
cat ~/.mirofish/backend.pid

# Force cleanup
pkill -f "uv run python run.py"
rm -f ~/.mirofish/backend.pid
```

## Project Structure

```
miro_claw/
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI entry point (12 subcommands)
│   ├── lib/                    # Core: predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard (HTML + JS + CSS)
│   └── test/                   # Unit tests + E2E (e2e-p2p.sh)
├── extensions/mirofish/        # OpenClaw Extension (TypeScript)
│   ├── index.ts                # Plugin entry — 6 integration points
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # OpenClaw Skill definition (SKILL.md)
├── MiroFish/                   # Core Engine — Git Submodule (Python Flask + Vue 3)
├── docs/                       # Vision, phase plans, distributed design docs
└── docker-compose.p2p.yml      # Multi-node P2P Docker setup
```

## Roadmap

| Phase | Goal | Status |
|:---|:---|:---|
| Phase 1 | Gateway integrates MiroFish API, chat-triggered predictions | ✅ Done |
| Phase 2 | Canvas + push notifications + SSE progress + Report Chat | ✅ Done |
| Phase 3 | P2P seed/result broadcast + consensus reports | ✅ Done |
| Phase 4 | Distributed simulation: cross-node Agent allocation (gRPC) | 🚧 Designing |
| Phase 5 | Cosmos SDK AppChain: attestation + reputation MVP | 📋 Planned |
| Phase 6 | Post-hoc verification + leaderboard + subscription economy | 📋 Planned |

## License

MIT
