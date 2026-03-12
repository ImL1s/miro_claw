# Distributed Agent Execution Design — Team Review Report

**Date**: 2026-03-11
**Reviewers**: Architecture (Opus), Gap Analysis (Opus), Security (Opus), Human + Gemini
**Plan Reviewed**: `2026-03-11-distributed-agent-execution-design.md`

## Verdict: Direction correct, but plan is NOT executable as-is

Two blocking issues identified by Human + Gemini review invalidate core assumptions. The plan needs a v2 rewrite before implementation can begin.

---

## Blocking Issues (Human + Gemini Review)

### B1. [HIGH] Agent-Side SQLite Direct Reads — Workers Are NOT Pure Compute Nodes

The plan assumes Workers only interact with the Coordinator via Channel (`receive_from`/`send_to`). **This is wrong.** Agents directly read SQLite for follower/following state when composing LLM prompts:
- `agent_environment.py:58` — `get_followers_env()` / `get_follows_env()` read SQLite directly
- `database.py:62` — group context queries bypass Channel entirely

This means replacing Channel alone is insufficient. Workers need either:
- **(A) Read-only state snapshot**: Coordinator pushes a snapshot of social graph state to Workers each round (adds sync complexity + bandwidth)
- **(B) Full remote-ification**: Wrap `get_followers_env()`, `get_follows_env()`, and group context into remote RPCs through the Coordinator (adds latency per agent per round)

**This is the single biggest architectural gap in the plan.** It must be resolved as an explicit design decision before any code is written.

### B2. [HIGH] Backend Uses Installed `camel-oasis==0.2.5`, Not the Repo Fork

The MiroFish backend (`pyproject.toml:23`) installs `camel-oasis` as a pip package. The simulation runner (`run_twitter_simulation.py:121`) imports from the installed package, **not** from the repo's `oasis-upstream/` or the proposed `oasis-distributed/`.

Placing code in `miro_claw/oasis-distributed/` will have **zero effect** on the running simulation unless an explicit packaging decision is made:
- **(A) Editable local package**: `pip install -e ./oasis-distributed` — cleanest but requires maintaining a `pyproject.toml` for the fork
- **(B) Vendor fork into backend**: Copy distributed modules into the installed `camel-oasis` site-packages — fragile, breaks on upgrade
- **(C) Patch runner PYTHONPATH**: Prepend `oasis-distributed/` to `sys.path` in the runner — hacky but fast

**Without this decision, Phase 3 will require complete rework.** Must be decided and documented in the plan.

### B3. [HIGH] DistributedOasisEnv Cannot Be a Thin Subclass

The plan proposes `DistributedOasisEnv(OasisEnv)` as a ~100 LOC modification. But the base class has deep local assumptions:
- `reset()` (`env.py:118`) starts the local `platform.running()` loop and calls `generate_custom_agents()` which binds ALL agents to a local Channel + does sign-up
- `step()` (`env.py:136`) expects keys to be **local `SocialAgent` objects**, not remote agent IDs

A single subclass cannot cleanly override this. The stable architecture is:
- **`CoordinatorEnv`**: Owns Platform, manages barrier sync, dispatches to Workers
- **`WorkerRuntime`**: Owns local agents, handles LLM calls, reports back to Coordinator

This is a fundamentally different class hierarchy than proposed.

### B4. [MEDIUM] Per-Round Data Flow Missing Context Fetch + Action Envelope

The plan's data flow (steps 1-8) omits a critical phase: before LLM decision, each agent calls `refresh()` / reads group messages, which are **additional RPCs to the Coordinator** beyond the Channel action flow. The actual per-agent network pattern is:

```
Worker agent → Coordinator: fetch context (refresh, followers, group msgs)  ← NOT IN PLAN
Worker agent → local LLM: decide action
Worker agent → Coordinator: SendAction(action)
Coordinator → Worker agent: ActionResponse(result)
```

Also, the action payload is heterogeneous `Any` (different action types have different schemas), not a fixed proto-friendly schema. The plan needs:
- Context fetch RPC design
- Action envelope with `oneof` or JSON payload for v1
- Budget for multiple RPCs per agent per round, not just one

### B5. [MEDIUM] Failure Model Will Deadlock

The plan states: "15 min timeout → log warning but keep waiting." If an LLM socket hangs, the entire simulation freezes indefinitely. Even v1 needs a hard timeout:
- Timeout → Worker returns `do_nothing` or explicit failure result for its agents
- Barrier sync unblocks with partial results
- Without this, the barrier sync is fundamentally unusable

### B6. [MEDIUM] Discovery Phase Duplicates Existing Infrastructure

The repo already has Gateway heartbeat + `~/.mirofish/peers.json` + `peer-discovery.ts:44` for auto-discovery. The plan proposes a completely separate libp2p/DHT/GossipSub stack in Python.

**Recommendation**: v1 should reuse the existing Node.js discovery infrastructure (HTTP peer registry). Python Workers register with the existing Gateway. libp2p becomes a future enhancement for 10+ nodes.

---

## Change Surface Reassessment (Human + Gemini)

| Scope | Plan Estimate | Revised Estimate |
|:---|:---|:---|
| New files | ~600 LOC | ~1500-2000 LOC (gRPC + CoordinatorEnv + WorkerRuntime + context RPCs) |
| Modified files | ~100 LOC | ~450-800 LOC (env split, agent remote-ification, runner integration) |
| Packaging / integration | Not mentioned | Significant (editable package setup, PYTHONPATH, Flask endpoints) |

---

## Strengths (Consensus)

- **Fork-via-subclass** (`NetworkChannel(Channel)`) is the lowest-risk integration path — Channel interface is clean (~72 LOC) with clear `receive_from`/`send_to` boundary
- **Coordinator-centralized Platform/SQLite** is the only sane choice — Platform is deeply coupled to raw `db_cursor` calls and single-threaded `running()` loop
- **Per-Worker LLM configuration** enables heterogeneous model deployment, aligns with P2P philosophy
- **Profile push via gRPC** eliminates Worker filesystem dependency
- **Barrier sync + orphan skip** lifecycle management covers essential failure modes

---

## Critical Issues (Must resolve before implementation)

### C1. Channel Architecture Mismatch

The Channel uses `asyncio.Queue` (receive) + `AsyncSafeDict` (send) with busy-wait polling (`asyncio.sleep(0.1)`). Mapping this to gRPC is far more complex than "add a subclass."

**Recommendation**: Use gRPC **unary RPC** per action (`SendAction() -> ActionResponse()`), which naturally eliminates the busy-poll pattern. Prototype this first — it's the highest-risk technical challenge.

### C2. Zero Authentication / Encryption

No mention of TLS, mTLS, API keys, or tokens anywhere in the design. Any node that discovers the gRPC endpoint can register as a Worker, receive agent profiles, and submit fabricated actions.

**Recommendation**: Phase 1 minimum — gRPC with TLS + pre-shared cluster token (`MIROFISH_CLUSTER_TOKEN` env var). Phase 4+ — mTLS with per-node certificates.

### C3. No Result Verification

Workers send `SendAction(agent_id, action, message)` with no mechanism to verify the Worker actually ran the LLM or that results are legitimate. A single malicious Worker can poison the entire simulation.

**Recommendation**: Short-term — redundant execution for critical agents. Medium-term — commitment scheme (hash before reveal). Long-term — on-chain action hash audit trail (aligns with Cosmos vision).

### C4. Agent State Includes Memory, Not Just Profiles

Each `SocialAgent` has `self.memory` (full conversation history), `self.env`, and `self.agent_graph`. The "profile push" only covers `UserInfo`. Memory grows each round (~20 LLM turns over 20 rounds × 55 agents). Serialization cost is unaddressed.

**Recommendation**: Design a memory serialization protocol. Consider delta-sync (only new observations per round) vs full-sync.

### C5. No Checkpoint / State Recovery

Zero mention of saving state between rounds. With 10-60 minute simulations, losing all progress on crash is unacceptable. SQLite currently uses `PRAGMA synchronous = OFF` (most dangerous setting).

**Recommendation**: Add round-level checkpointing before going distributed. Set `PRAGMA synchronous = NORMAL`. Useful even in single-machine mode.

---

## Major Issues

### M1. Straggler Problem (Barrier Sync + Heterogeneous LLMs)

Worker A with GPT-4o finishes in 10s, Worker B with local 7B takes 120s. With 20 rounds, Worker A wastes ~37 minutes. No straggler detection, dynamic rebalancing, or work-stealing.

**Recommendation**: Track per-worker round times. Rebalance agent assignments dynamically after N rounds.

### M2. Orphaned Agents Break Simulation Integrity

"Orphaned agents skip the round" changes the social graph, recommendation table, and other agents' observations. Results with orphaned agents are **fundamentally different** from full-population runs.

**Recommendation**: Document this as a known limitation. For v1, abort the simulation if >10% agents are orphaned. Phase 5: agent migration to surviving Workers.

### M3. libp2p is Massive Scope Creep

Jumping from 18-line HTTP relay (`p2p.js`) to libp2p DHT + IPFS + GossipSub + mDNS is a 10x complexity increase. `py-libp2p` is immature. For 2-5 nodes, this is over-engineered.

**Recommendation**: Add **Phase 3.5: Static gRPC peer discovery** — reuse existing `peers.json`. Move libp2p to Phase 5+.

### M4. LOC Estimate is 2-3x Too Low

Plan estimates ~700 LOC. Realistic estimate: **1500-2500 LOC** plus tests, given gRPC proto + async bridge + coordinator + worker + discovery + fault tolerance.

### M5. Open Discovery Enables Sybil Attacks

Any node can join via DHT/GossipSub, register as Worker, and dominate agent assignments (round-robin is predictable).

**Recommendation**: Closed cluster mode with Worker allowlist for Phase 1-3. Authenticated GossipSub + peer scoring for Phase 4.

### M6. 15-Minute Timeout is Insufficient

"Log warning but keep waiting" allows a slow/malicious Worker to stall the simulation indefinitely. Timeout should be `agent_count × expected_llm_time × 2`, not flat 15 min.

**Recommendation**: Hard timeout with agent reassignment. Progressive timeout reduction for consistently slow Workers.

---

## Medium / Low Issues

| ID | Issue | Severity | Fix Phase |
|:---|:---|:---|:---|
| V5 | Unencrypted gRPC traffic exposes profiles and LLM outputs | Medium | Phase 1 (TLS) |
| V7 | DDoS via connection spam (no rate limiting) | Medium | Phase 2 |
| V4 | GitHub known-peers.json supply chain risk | Medium | Phase 4 |
| V6 | Slow Worker stalls simulation (availability) | Medium | Phase 1 |
| m1 | No observability (metrics, logging, tracing, dashboards) | Minor | Phase 2 |
| m2 | No protocol versioning for Coordinator/Worker compatibility | Minor | Phase 2 |
| m3 | User abort has race conditions (stale actions in queue) | Minor | Phase 1 |
| m7 | CLI integration unclear (predict.js → Flask → OASIS distributed) | Minor | Phase 3 |
| V8 | SQLite corruption on abort (mitigated by WAL) | Low | N/A |
| V9 | Existing notify.js has shell injection vulnerability | Low | Phase 1 |

---

## Revised Implementation Plan

| Phase | Work | Original | Revised | Notes |
|:---|:---|:---|:---|:---|
| **1** | NetworkChannel (gRPC unary) + TLS + token auth + single-machine test | 3-4 days | **5-7 days** | Prototype the async-to-gRPC bridge first; add basic security |
| **2** | Docker multi-node + rate limiting + observability basics | 2-3 days | **3-4 days** | Add connection limits, structured logging |
| **3** | CLI integration (`--distributed` flag) + new Flask endpoints | 2-3 days | **3-4 days** | Need distributed-simulation blueprint in Flask backend |
| **3.5** | **Static gRPC peer discovery** (reuse peers.json) | N/A | **2-3 days** | New phase — WAN multi-node without libp2p complexity |
| **4** | Checkpointing + hard timeouts + agent reassignment | 3-4 days | **3-4 days** | Repurposed from libp2p; focus on reliability |
| **5** | Fault tolerance + libp2p discovery + upstream PR | 3-5 days | **5-7 days** | libp2p moved here; add result verification basics |
| **Total** | | **~3 weeks** | **~5-6 weeks** | Includes security infrastructure |

---

## Top 5 Recommendations (Consensus)

1. **Prototype NetworkChannel first** — gRPC unary RPC replacing busy-wait polling. This is the highest-risk item and determines feasibility. Budget 1 week.

2. **Add TLS + pre-shared token in Phase 1** — non-negotiable before any network deployment.

3. **Insert Phase 3.5: Static gRPC peer discovery** — reuse `peers.json`, defer libp2p to Phase 5+.

4. **Add round-level checkpointing** — prerequisite for any production distributed system. Useful even in single-machine mode.

5. **Hard timeout + agent reassignment** — don't just log at 15 min; reassign agents to other Workers.

---

## Architecture Notes

- **P2P layer (existing) vs Distributed execution (proposed) are complementary**: P2P broadcasts seeds/results between independent simulations. Distributed execution splits a single simulation across Workers. Document this distinction.
- **Static round-robin is actually optimal** given centralized Platform — smart distribution only matters if Platform is partially distributed.
- **`BatchAction` RPC should be in the proto spec now** (even if unused in v1) to avoid breaking protocol changes when scaling beyond 55 agents.
- **Serial Platform bottleneck**: acceptable for v1 on LAN (~55ms/round overhead). On WAN (~2.75s/round), consider batching. Will not scale beyond ~200 agents.
