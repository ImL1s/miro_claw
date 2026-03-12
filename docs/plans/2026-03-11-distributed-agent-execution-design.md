# Distributed Agent Execution — NetworkChannel Fork Design (v2)

## Goal

Split 55 OASIS agents across multiple machines, keeping Platform (SQLite + RecSys) centralized on a Coordinator, with Workers running LLM calls remotely via gRPC. 

**v2 Update Note**: This design has been revised to address agent-side direct SQLite reads, `OasisEnv` coupling, and security/discovery requirements identified in the design review.

## Design Decisions

| # | Decision | Choice | Rationale |
|:--|:---|:---|:---|
| 1 | Architecture | **Split `OasisEnv`** | `CoordinatorEnv` (Platform + sync) and `WorkerRuntime` (Agents + LLM) |
| 2 | Network protocol | **gRPC (Unary)** | Bidirectional streaming is too complex for this polling structure. Unary solves the busy-wait pattern perfectly. |
| 3 | State Access | **Context Fetch RPC** | Workers must fetch social graph state (followers/groups) per round via RPC to avoid SQLite coupling. |
| 4 | Security | **TLS + Token Auth** | Pre-shared `MIROFISH_CLUSTER_TOKEN` required for all gRPC connections (Phase 1). |
| 5 | Packaging | **PYTHONPATH Patch** | Adjust `sys.path` in runner to override pip-installed `camel-oasis` with repo fork. |
| 6 | Discovery | **Static gRPC via peers.json** | Reuse Node.js peer registry. libp2p deferred to Phase 5+. |
| 7 | Resilience | **Hard Timeouts** | LLM hangs force Coordinator to drop agents or reassign immediately. |
| 8 | Checkpointing | **DB Checkpoints** | Round-level SQLite saving with `PRAGMA synchronous = NORMAL`. |

## Architecture

```
                 ┌───────────────────────────────┐
                 │      Coordinator Node         │
                 │                               │
                 │  CoordinatorEnv               │
                 │  Platform (SQLite DB)         │
                 │  RecSys                       │
                 │  gRPC ChannelServer + Token   │
                 └──────────┬────────────────────┘
                            │ (TLS + Token Auth)
            ┌───────────────┼───────────────┐
       ┌────▼────┐     ┌───▼─────┐    ┌────▼────┐
       │Worker 1 │     │Worker 2 │    │Worker N │
       │Agt 0-17 │     │Agt 18-35│    │Agt 36-54│
       │LLM: X   │     │LLM: Y   │    │LLM: Z   │
       │WorkerRun│     │WorkerRun│    │WorkerRun│
       └─────────┘     └─────────┘    └─────────┘
```

## Per-Round Data Flow

```
1. Coordinator: platform.update_rec_table()
2. Coordinator → all Workers: gRPC StartRound(round_num, active_agent_ids)
3. Workers (for each agent):
   a. gRPC GetContext(agent_id) → returns followers, groups, unread msgs
   b. Worker Agent → LLM: generated prompt & gets action decision
   c. gRPC SendAction(agent_id, action, message)
4. Coordinator: Platform processes action (SQL) → Returns result instantly (Unary)
5. Workers → Coordinator: gRPC RoundComplete()
6. Coordinator: Barrier sync (Hard timeout applied) 
7. Coordinator: Save checkpoint → time_step += 1 → next round
```

## Lifecycle Management

### Completion Detection (Barrier Sync)
Coordinator expects `RoundComplete` from all active Workers. 
**Timeout**: Hard timeout applied (e.g. `num_agents * target_llm_time * 2`). If a Worker times out, its agents are marked orphaned and the round proceeds to prevent simulation deadlocks. 

### Disconnection Handling
- **Worker drops**: Orphaned agents flagged, simulation proceeds.
- **Coordinator drops**: Workers pause, retry with backoff.
- **Worker graceful exit**: `Unregister` RPC sent, agents skipped.

### Report Distribution
- Coordinator generates Report.
- `gRPC SimulationComplete(report_data)` sends the full report to all Workers.
- OpenClaw Extension triggers `notify.js` to push notifications to the user (Discord/TG).

## Implementation Phases (~5-6 Weeks)

| Phase | Work | Focus |
|:---|:---|:---|
| **1** | NetworkChannel (gRPC unary) + Context RPC | Prototype async-to-gRPC, TLS, token auth, single-machine test |
| **2** | Docker multi-node + rate limiting | Connection limits, basic observability |
| **3** | CLI integration + Backend endpoints | Setup distributed blueprint in Flask, Runner PYTHONPATH patching |
| **3.5** | Static gRPC peer discovery | Reuse `peers.json` |
| **4** | Checkpointing + Hard Timeouts | DB resilience, round-level saves, agent reassignment |
| **5** | Fault tolerance + upstream PR | Agent migration, Result verification |

## Usage Modes (End User)

Users install the MiroFish skill into OpenClaw, then have three ways to use it:

### 1. CLI Direct
```bash
mirofish predict "比特幣下週走勢" --rounds=10
```
User runs directly in terminal. Results printed on completion + desktop notification.

### 2. OpenClaw Gateway RPC
```bash
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
# → {"runId": "run-xxx"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list   --params '{}'
```
Non-blocking. Returns `runId` immediately. Poll status or receive SSE push events.

### 3. Agent Auto-Trigger
Agent detects prediction keywords in conversation → calls `mirofish_predict` tool → SSE broadcasts progress events → completion result returned to user automatically.

> **User only needs:** Tell OpenClaw "install mirofish skill" → all three modes available. Infrastructure is handled internally.

## Deployment Modes (Infrastructure)

### 1. Single-Machine Docker Compose
```bash
docker compose up
```
Coordinator + Worker(s) on the same machine. Internal Docker network. Best for: local dev, demo.

### 2. LAN Distributed (Multi-Machine)
```bash
# Machine A — Coordinator
docker run -p 50051:50051 -v ./certs:/app/certs oasis-coordinator

# Machine B, C — Workers
docker run -e COORDINATOR_ADDR=192.168.x.x:50051 \
  -v ./certs:/app/certs:ro oasis-worker
```
TLS + token auth (`MIROFISH_CLUSTER_TOKEN`). Best for: internal lab, multi-GPU split across machines.

### 3. Native (No Docker)
```bash
# Terminal 1
python3 scripts/run_coordinator.py

# Terminal 2
python3 scripts/run_worker.py --coordinator localhost:50051
```
Direct Python execution with manual dependency management. Best for: development, step-through debugging.
