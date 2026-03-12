<div align="center">

# MiroClaw

**55 AI Agent Swarm Intelligence Prediction Engine — Standalone CLI · P2P Multi-Node Consensus**

[MiroFish](https://github.com/666ghj/MiroFish) × [OpenClaw](https://openclaw.ai) Gateway

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

English | [简体中文](./README-CN.md) | [繁體中文](./README.md)

</div>

---

## Demo

<div align="center">

![MiroClaw Demo](docs/mirofish-demo.gif)

*55 AI Agent Swarm Intelligence Prediction — From Conversation to Report*

</div>

## What is this?

MiroClaw is an [OpenClaw](https://openclaw.ai) AI Agent extension that integrates [MiroFish](https://github.com/666ghj/MiroFish) (a simulation engine where 55 AI Agents interact on simulated social platforms) into the OpenClaw Gateway.

**Just say it in OpenClaw chat:**

```
You: Predict what happens to the market if Bitcoin breaks $200K
Agent: Starting MiroFish prediction... [55 Agent social simulation] → Done!
```

MiroClaw automatically: starts the backend → builds a knowledge graph → spawns 55 Agents → runs social simulation → outputs a prediction report.

## Architecture

| Layer | Technology | Status |
|:---|:---|:---|
| **Deduction** | MiroFish Engine (GraphRAG + OASIS multi-agent simulation + Report AI) | ✅ Done |
| **Agent** | OpenClaw Gateway Network (P2P communication, task dispatch, Canvas visualization) | ✅ Done |

## Quick Start: Install to OpenClaw

### Prerequisites

- **[OpenClaw](https://openclaw.ai)** Gateway installed and running
- **Node.js** >= 18
- **Docker Desktop** (recommended) or Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- **LLM API Key** (OpenAI format, any compatible API, recommended >= 14B parameter model)
- **[Zep Cloud](https://www.getzep.com/) API Key** (for GraphRAG, free tier works)

### Installation (One Command)

```bash
openclaw skills install mirofish-predict
```

Then set up your API keys:

```bash
# Edit ~/.mirofish/.env with these three keys:
LLM_API_KEY=your-llm-api-key
LLM_BASE_URL=http://your-llm-server:1234/v1
ZEP_API_KEY=your-zep-cloud-key

# Restart Gateway
openclaw gateway restart
```

> **Apple Silicon users**: No ARM64 Docker image available. CLI auto-falls back to native mode.

<details>
<summary>Manual Installation (Developer Mode)</summary>

```bash
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw
git clone https://github.com/666ghj/MiroFish.git

# Install Extension + Skill
cp -r extensions/mirofish/ ~/.openclaw/extensions/mirofish/
cd ~/.openclaw/extensions/mirofish && npm install && npx tsc && cd -
cp -r skills/mirofish-predict/ ~/.openclaw/skills/mirofish-predict/

# CLI symlink
ln -sf $(pwd)/cli/bin/mirofish.js /usr/local/bin/mirofish

openclaw gateway restart
```

</details>

### Start Using

After installation, trigger predictions with natural language in OpenClaw chat:

```
🧑 You: Predict what happens to the market if Bitcoin breaks $200K

🤖 Agent: Starting MiroFish prediction...
         📡 SSE real-time updates:
           Step 1/7 Building knowledge graph ✅
           Step 2/7 Spawning 55 AI Agents ⏳
           ...
           Step 7/7 Generating prediction report ✅
         
         📊 Prediction complete! Report summary:
         Bitcoin breaking $200K would trigger cross-domain chain reactions...
         Simulation ID: sim_c6167c07bf05

🧑 You: Ask Agent #3 what they think about this

🤖 Agent: [calls mirofish_interview]
         Agent #3 (@CryptoKing_BTC, 19-year-old tech enthusiast) responds:
         "I think this is an inevitable trend, institutional capital..."

🧑 You: What's the most pessimistic view in this report?

🤖 Agent: [calls mirofish_chat]
         Based on the report analysis, the most pessimistic view comes from Agent #12...
```

### Agent Tools

The LLM automatically selects the appropriate tool based on the Skill description:

| Tool | Function | Typical Triggers |
|:---|:---|:---|
| `mirofish_predict` | Start new prediction | "predict...", "forecast...", "analyze impact of..." |
| `mirofish_status` | Check prediction progress | "how's the prediction going?", "status?" |
| `mirofish_cancel` | Cancel prediction | "cancel prediction", "stop simulation" |
| `mirofish_chat` | Follow-up on report | "in the report...", "what's the biggest risk?" |
| `mirofish_interview` | Interview specific Agent | "ask Agent #3", "interview Agent #5" |
| `mirofish_report` | Get full report | "give me the full report" |
| `mirofish_agents` | List all 55 Agents | "what agents are there?", "agent list" |

### Gateway RPC

For external scripts, CI/CD, frontend integration, or cron jobs:

```bash
# Prediction management
openclaw gateway call mirofish.predict \
  --params '{"topic": "Fed rate cut impact", "rounds": 10}'
# → {"runId": "run-1710000000000"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list   --params '{}'

# Report interaction
openclaw gateway call mirofish.chat \
  --params '{"simId": "sim_xxx", "question": "What is the biggest risk?"}'

openclaw gateway call mirofish.interview \
  --params '{"simId": "sim_xxx", "agentId": 3, "question": "What do you think?"}'

# Agents & reports
openclaw gateway call mirofish.report  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.agents  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.posts   --params '{"simId": "sim_xxx"}'
```

### Discord Notifications

Auto-push to Discord channel on prediction completion:

```bash
# Set in ~/.mirofish/.env
MIROFISH_DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx/yyy
```

### Extension Architecture

| Integration Point | File | Function |
|:---|:---|:---|
| Agent Tools | `src/tools.ts` | 7 LLM-callable tools |
| Message Hook | `src/hooks.ts` | Keyword-triggered auto-prediction (disabled by default) |
| Gateway RPC | `src/gateway.ts` | 10 RPC methods for external integration |
| SSE Broadcaster | `src/progress-broadcaster.ts` | Real-time progress streaming |
| Canvas Route | `src/canvas-route.ts` | `GET /mirofish/canvas` report visualization |
| P2P Peer Discovery | `src/peer-discovery.ts` | Automatic peer detection |

---

## Advanced Usage

### CLI

You can also use the CLI directly without OpenClaw:

```bash
# ─── Prediction ───
mirofish predict "Fed rate cut impact on tech stocks"        # Basic (default 20 rounds)
mirofish predict "topic" --rounds=3                          # Custom rounds
mirofish predict "topic" --canvas                            # Open Dashboard after
mirofish predict "topic" --json-stream                       # NDJSON stream output
mirofish predict "topic" --distributed --workers=3           # Distributed (Docker Workers)
mirofish predict "topic" --p2p                               # P2P multi-node

# ─── Report Interaction ───
mirofish chat sim_xxx "Which views are most extreme?"        # Follow-up with Report Agent
mirofish interview sim_xxx 0 "What do you think?"            # Interview Agent #0
mirofish report sim_xxx                                      # Get full report
mirofish canvas sim_xxx                                      # Visual Dashboard

# ─── Backend Management ───
mirofish serve start                                         # Start backend (Docker first)
mirofish serve stop                                          # Stop backend
mirofish serve status                                        # Check backend status

# ─── P2P Peer Management ───
mirofish peers add http://192.168.1.100:5001 "lab"           # Add peer
mirofish peers remove lab                                    # Remove peer
mirofish peers list                                          # List all peers
mirofish peers health                                        # Health check all peers
mirofish meta "topic"                                        # Merge P2P consensus report

# ─── Other ───
mirofish projects                                            # List all projects
mirofish status sim_xxx                                      # Check simulation progress
mirofish env                                                 # Show environment config
```

### Operating Modes

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
```

### P2P Multi-Node Deployment

#### Docker Quick Start (3 Nodes)

```bash
docker compose -f docker-compose.p2p-3nodes.yml build
docker compose -f docker-compose.p2p-3nodes.yml up -d

# Health check
curl http://localhost:5011/health   # Node1
curl http://localhost:5012/health   # Node2
curl http://localhost:5013/health   # Node3

# Start P2P prediction from Node1
docker exec mirofish-p2p-node1 node /app/cli/bin/mirofish.js \
  predict "What if Bitcoin breaks 200K" --p2p --rounds=3

docker compose -f docker-compose.p2p-3nodes.yml down
```

#### Manual Mode (Cross-LAN)

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers health
mirofish predict "topic" --p2p
mirofish meta "topic"
```

> Set `P2P_AUTO_PREDICT=true` in `~/.mirofish/.env` on peer machines.

### OASIS Distributed (gRPC Worker Mode)

Split 55 Agents across multiple machines:

```bash
# Docker Compose
cd oasis-distributed && docker compose -f docker-compose.distributed.yml up

# Native mode
python3 scripts/run_coordinator.py   # Terminal 1
python3 scripts/run_worker.py        # Terminal 2
```

---

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
├── extensions/mirofish/        # ⭐ OpenClaw Extension (TypeScript)
│   ├── index.ts                # Plugin entry — 6 integration points
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # ⭐ OpenClaw Skill definition (SKILL.md)
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI entry point (12 subcommands)
│   ├── lib/                    # Core: predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard (HTML + JS + CSS)
│   └── test/                   # Unit tests + E2E (e2e-p2p.sh)
├── core/                       # Shared types & constants (@mirofish/core)
├── oasis-distributed/          # Distributed Agent execution layer (gRPC, Docker)
├── MiroFish/                   # Core Engine — clone separately (Python Flask + Vue 3)
├── Dockerfile.p2p-node         # P2P Docker node image
├── docker-compose.p2p-3nodes.yml  # 3-node P2P Docker cluster
├── docs/                       # Vision, phase plans, distributed design docs
└── docker-compose.p2p.yml      # Multi-node P2P Docker setup
```

## Roadmap

| Phase | Goal | Status |
|:---|:---|:---|
| Phase 1 | Gateway integrates MiroFish API, chat-triggered predictions | ✅ Done |
| Phase 2 | Canvas + push notifications + SSE progress + Report Chat | ✅ Done |
| Phase 3 | P2P seed/result broadcast + consensus reports | ✅ Done |
| Phase 4 | P2P Docker 3-node cluster verification + Auto-Predict | ✅ Done |
| Phase 5 | Distributed simulation: cross-node Agent allocation (gRPC) | 🚧 Designing |
| Phase 6 | Cosmos SDK AppChain: attestation + reputation MVP | 📋 Planned |
| Phase 7 | Post-hoc verification + leaderboard + subscription economy | 📋 Planned |

## License

[AGPL-3.0](LICENSE)
