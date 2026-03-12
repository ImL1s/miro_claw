# Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining gaps between unit-tested Phase 4-5 code and a working Docker-based distributed simulation.

**Architecture:** Coordinator (gRPC server) manages rounds; N Workers connect via TLS, receive agent assignments, call LLM per agent, send actions back. All existing — we need proto stub regen, Unregister RPC wiring, graceful shutdown, and Docker E2E.

**Tech Stack:** Python 3.10, gRPC 1.76+, protobuf 6.33+, Docker Compose, asyncio

---

## Current State Inventory

| Component | File | Status |
|:----------|:-----|:-------|
| Proto definition | `oasis/network/proto/channel.proto` (86 LOC) | ✅ 6 RPCs defined |
| Proto stubs | `oasis/network/proto/channel_pb2.py` / `_grpc.py` | ⚠️ Stale (protobuf 6.31, need regen for 6.33) |
| Coordinator env | `oasis/network/coordinator_env.py` (213 LOC) | ✅ Complete with Phase 5 |
| gRPC server | `oasis/network/channel_server.py` (160 LOC) | ✅ 6 RPCs implemented |
| gRPC client | `oasis/network/channel_client.py` (152 LOC) | ✅ 6 RPCs implemented |
| Worker runtime | `oasis/network/worker_runtime.py` (107 LOC) | ✅ Full loop |
| Worker entry | `scripts/run_worker.py` (141 LOC) | ✅ MockAgent + TLS wait |
| Coordinator entry | `scripts/run_coordinator.py` (197 LOC) | ✅ With Phase 5 features |
| TLS security | `oasis/network/security.py` (63 LOC) | ✅ Self-signed cert gen |
| Errors | `oasis/network/errors.py` (15 LOC) | ✅ SimulationAbortError |
| Dockerfile (coord) | `Dockerfile.coordinator` (31 LOC) | ✅ Poetry + gRPC |
| Dockerfile (worker) | `Dockerfile.worker` (19 LOC) | ✅ Slim deps |
| Docker Compose | `docker-compose.distributed.yml` (73 LOC) | ✅ TLS + LLM envs |
| Worker deps | `requirements-worker.txt` | ✅ grpcio + protobuf |

---

### Task 1: Regenerate Proto Stubs

The generated `channel_pb2.py` was built with protobuf 6.31.1 but the runtime is 6.33+, causing `AttributeError` in `test_network_channel.py`.

**Files:**
- Modify: `oasis/network/proto/channel_pb2.py` (regenerated)
- Modify: `oasis/network/proto/channel_pb2_grpc.py` (regenerated)

**Step 1: Check installed protoc/grpcio-tools versions**

```bash
cd oasis-distributed
python3.11 -c "import google.protobuf; print(google.protobuf.__version__)"
python3.11 -c "import grpc; print(grpc.__version__)"
```

**Step 2: Regenerate stubs**

```bash
cd oasis-distributed
python3.11 -m grpc_tools.protoc \
  -I oasis/network/proto \
  --python_out=oasis/network/proto \
  --grpc_python_out=oasis/network/proto \
  oasis/network/proto/channel.proto
```

**Step 3: Fix relative import in generated grpc file**

The generator outputs `import channel_pb2`, but we need `from . import channel_pb2`.

```bash
sed -i '' 's/^import channel_pb2/from . import channel_pb2/' \
  oasis/network/proto/channel_pb2_grpc.py
```

**Step 4: Run network tests to verify fix**

```bash
cd oasis-distributed
python3.11 -m pytest tests/test_network_channel.py -v
```

Expected: 3 tests PASS (previously 3 ERRORS)

**Step 5: Run all tests for regression**

```bash
python3.11 -m pytest tests/ -v --tb=short
```

Expected: All tests pass, no `AttributeError: module 'channel_pb2' has no attribute 'WorkerInfo'`

**Step 6: Commit**

```bash
git add oasis/network/proto/channel_pb2.py oasis/network/proto/channel_pb2_grpc.py
git commit -m "fix(proto): regenerate stubs for protobuf 6.33+"
```

---

### Task 2: Add Unregister RPC to Proto

Phase 5 added `handle_worker_unregister()` to coordinator, but the proto and stubs don't have the `Unregister` RPC yet.

**Files:**
- Modify: `oasis/network/proto/channel.proto:4-22`
- Regenerate: `oasis/network/proto/channel_pb2.py`
- Regenerate: `oasis/network/proto/channel_pb2_grpc.py`

**Step 1: Write the failing test**

Create `tests/test_unregister_rpc.py`:

```python
"""Test that Unregister RPC exists in proto stubs."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from oasis.network.proto import channel_pb2_grpc

def test_stub_has_unregister():
    """CoordinatorServiceStub should have Unregister method."""
    assert hasattr(channel_pb2_grpc.CoordinatorServiceStub, '__init__')
    # Check the stub constructor source references Unregister
    import inspect
    source = inspect.getsource(channel_pb2_grpc.CoordinatorServiceStub.__init__)
    assert 'Unregister' in source, "Stub should have Unregister RPC"

def test_servicer_has_unregister():
    """CoordinatorServiceServicer should have Unregister method."""
    assert hasattr(channel_pb2_grpc.CoordinatorServiceServicer, 'Unregister'), \
        "Servicer should have Unregister method"
```

**Step 2: Run test to verify it fails**

```bash
python3.11 -m pytest tests/test_unregister_rpc.py -v
```

Expected: FAIL — `'Unregister' not in source`

**Step 3: Add Unregister RPC to proto**

In `oasis/network/proto/channel.proto`, add after line 21 (`rpc RoundComplete`):

```protobuf
  // 7. Graceful worker unregistration
  rpc Unregister(WorkerId) returns (Empty);
```

**Step 4: Regenerate stubs**

```bash
python3.11 -m grpc_tools.protoc \
  -I oasis/network/proto \
  --python_out=oasis/network/proto \
  --grpc_python_out=oasis/network/proto \
  oasis/network/proto/channel.proto

sed -i '' 's/^import channel_pb2/from . import channel_pb2/' \
  oasis/network/proto/channel_pb2_grpc.py
```

**Step 5: Implement Unregister in server**

In `oasis/network/channel_server.py`, add method to `CoordinatorService` class:

```python
async def Unregister(self, request, context):
    """Graceful worker unregistration."""
    await self._verify_token(request.token, context)
    self.env.handle_worker_unregister(request.worker_id)
    logger.info(f"Worker {request.worker_id} unregistered gracefully.")
    return channel_pb2.Empty()
```

**Step 6: Add unregister to client**

In `oasis/network/channel_client.py`, add method to `WorkerNetworkChannel`:

```python
async def unregister(self):
    """Gracefully unregister this worker from the Coordinator."""
    req = channel_pb2.WorkerId(worker_id=self.worker_id, token=self.token)
    try:
        await self.stub.Unregister(req)
        logger.info(f"Worker {self.worker_id} unregistered successfully.")
    except grpc.RpcError as e:
        logger.error(f"Unregister failed: {e.details()}")
```

**Step 7: Run tests**

```bash
python3.11 -m pytest tests/test_unregister_rpc.py tests/test_unregister.py -v
```

Expected: All PASS

**Step 8: Commit**

```bash
git add oasis/network/proto/ oasis/network/channel_server.py oasis/network/channel_client.py tests/test_unregister_rpc.py
git commit -m "feat(proto): add Unregister RPC for graceful worker exit"
```

---

### Task 3: Graceful Shutdown in Worker Runtime

Worker should call `Unregister` before exiting so Coordinator can immediately migrate agents instead of waiting for timeout.

**Files:**
- Modify: `oasis/network/worker_runtime.py:104-107`
- Test: `tests/test_worker_runtime.py` (new)

**Step 1: Write the failing test**

Create `tests/test_worker_runtime.py`:

```python
"""Test WorkerRuntime graceful shutdown."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from unittest.mock import AsyncMock, MagicMock

from oasis.network.worker_runtime import WorkerRuntime


@pytest.mark.asyncio
async def test_close_calls_unregister():
    """close() should call channel.unregister() before channel.close()."""
    graph = MagicMock()
    worker = WorkerRuntime("localhost:50051", "tok", "w1", graph)
    worker.channel = AsyncMock()
    worker.channel.unregister = AsyncMock()
    worker.channel.close = AsyncMock()

    await worker.close()

    worker.channel.unregister.assert_called_once()
    worker.channel.close.assert_called_once()


@pytest.mark.asyncio
async def test_close_handles_unregister_failure():
    """close() should still close channel even if unregister fails."""
    graph = MagicMock()
    worker = WorkerRuntime("localhost:50051", "tok", "w1", graph)
    worker.channel = AsyncMock()
    worker.channel.unregister = AsyncMock(side_effect=Exception("conn lost"))
    worker.channel.close = AsyncMock()

    await worker.close()  # Should not raise

    worker.channel.close.assert_called_once()
```

**Step 2: Run test to verify it fails**

```bash
python3.11 -m pytest tests/test_worker_runtime.py -v
```

Expected: FAIL — `unregister` never called

**Step 3: Implement graceful shutdown**

In `oasis/network/worker_runtime.py`, replace `close()`:

```python
async def close(self):
    if self.channel:
        try:
            await self.channel.unregister()
        except Exception as e:
            worker_log.warning(f"Unregister failed during shutdown: {e}")
        await self.channel.close()
```

**Step 4: Run tests**

```bash
python3.11 -m pytest tests/test_worker_runtime.py -v
```

Expected: 2/2 PASS

**Step 5: Commit**

```bash
git add oasis/network/worker_runtime.py tests/test_worker_runtime.py
git commit -m "feat(worker): graceful unregister on shutdown"
```

---

### Task 4: Docker Build Smoke Test

Verify both Docker images build successfully.

**Files:**
- Test: `tests/test_docker_build.sh` (new)

**Step 1: Write test script**

Create `tests/test_docker_build.sh`:

```bash
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Building coordinator image ==="
docker build -f Dockerfile.coordinator -t oasis-coordinator:test . || { echo "FAIL: coordinator build"; exit 1; }

echo "=== Building worker image ==="
docker build -f Dockerfile.worker -t oasis-worker:test . || { echo "FAIL: worker build"; exit 1; }

echo "=== Verifying coordinator imports ==="
docker run --rm oasis-coordinator:test python -c \
  "from oasis.network.coordinator_env import CoordinatorEnv; print('OK')" || { echo "FAIL: coordinator imports"; exit 1; }

echo "=== Verifying worker imports ==="
docker run --rm oasis-worker:test python -c \
  "from oasis.network.worker_runtime import WorkerRuntime; print('OK')" || { echo "FAIL: worker imports"; exit 1; }

echo "=== ALL PASSED ==="
```

**Step 2: Run the test**

```bash
bash tests/test_docker_build.sh
```

Expected: Both images build and import checks pass.

**Step 3: Commit**

```bash
git add tests/test_docker_build.sh
git commit -m "test(docker): add build smoke test for coordinator and worker images"
```

---

### Task 5: Docker Compose E2E Smoke Test

Run a real 1-round simulation with MockAgents using Docker Compose.

**Files:**
- Test: `tests/test_docker_e2e.sh` (new)

**Step 1: Write E2E test**

Create `tests/test_docker_e2e.sh`:

```bash
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  echo "Cleaning up..."
  MIROFISH_CLUSTER_TOKEN=test-e2e docker compose -f docker-compose.distributed.yml down --volumes --remove-orphans 2>/dev/null || true
  docker rmi oasis-coordinator:test oasis-worker:test 2>/dev/null || true
}
trap cleanup EXIT

# 1. Build images
echo "=== Building images ==="
docker compose -f docker-compose.distributed.yml build

# 2. Start with 1 round, 2 workers
echo "=== Starting 1-round simulation with 2 workers ==="
MIROFISH_CLUSTER_TOKEN=test-e2e \
  TOTAL_ROUNDS=1 \
  EXPECTED_WORKERS=2 \
  docker compose -f docker-compose.distributed.yml up --scale worker=2 --abort-on-container-exit --timeout 120 2>&1 | tee /tmp/e2e-output.log &

COMPOSE_PID=$!

# 3. Wait for completion (max 180s)
timeout 180 wait $COMPOSE_PID
EXIT_CODE=$?

# 4. Check logs for success markers
if grep -q "Simulation complete" /tmp/e2e-output.log && \
   grep -q "Simulation summary" /tmp/e2e-output.log; then
  echo "=== E2E PASSED ==="
else
  echo "=== E2E FAILED — missing completion markers ==="
  tail -30 /tmp/e2e-output.log
  exit 1
fi
```

**Step 2: Run E2E**

```bash
bash tests/test_docker_e2e.sh
```

Expected: Coordinator starts → 2 workers register → 1 round completes → summary logged → clean exit.

> [!WARNING]
> This requires Docker Desktop running. Skip if CI-only environment.

**Step 3: Commit**

```bash
git add tests/test_docker_e2e.sh
git commit -m "test(e2e): add Docker Compose smoke test for distributed simulation"
```

---

### Task 6: Full Regression + Final Commit

**Step 1: Run all unit tests**

```bash
cd oasis-distributed
python3.11 -m pytest tests/ -v --tb=short
```

Expected: All tests pass (80+ unit + 2 new)

**Step 2: Run CLI tests**

```bash
node --test cli/test/distributed.test.js cli/test/distributed-peers.test.js cli/test/distributed-llm.test.js
```

Expected: 23/23 pass

**Step 3: Run backend tests**

```bash
cd MiroFish/backend
uv run pytest tests/test_distributed_runner.py tests/test_distributed_api.py tests/test_distributed_native.py -v
```

Expected: 30/30 pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(distributed): production-ready Phase 6 — proto regen, Unregister RPC, Docker E2E"
```
