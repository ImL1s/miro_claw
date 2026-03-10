#!/usr/bin/env bash
# ============================================================
# MiroFish P2P E2E Integration Test
#
# 在本機起兩個 Flask server（port 5091 / 5092），
# 透過 curl 模擬完整 P2P 流程，驗證後自動清理。
# 不污染你的環境：用臨時 port、不寫 ~/.mirofish/peers.json。
# ============================================================

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/../../MiroFish/backend" && pwd)"
PID_A=""
PID_B=""
PORT_A=5091
PORT_B=5092
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    [ -n "$PID_A" ] && kill "$PID_A" 2>/dev/null && wait "$PID_A" 2>/dev/null || true
    [ -n "$PID_B" ] && kill "$PID_B" 2>/dev/null && wait "$PID_B" 2>/dev/null || true
    echo "   Done."
}
trap cleanup EXIT

assert_eq() {
    local desc="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}✅ $desc${NC}"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}❌ $desc${NC}"
        echo "     expected: $expected"
        echo "     actual:   $actual"
        FAIL=$((FAIL + 1))
    fi
}

assert_contains() {
    local desc="$1" needle="$2" haystack="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${GREEN}✅ $desc${NC}"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}❌ $desc${NC}"
        echo "     expected to contain: $needle"
        echo "     actual: $haystack"
        FAIL=$((FAIL + 1))
    fi
}

# ============================================================
echo ""
echo "🧪 MiroFish P2P E2E Integration Test"
echo "   Node A: http://localhost:$PORT_A"
echo "   Node B: http://localhost:$PORT_B"
echo ""

# --- Start two Flask servers ---
echo "🚀 Starting Node A (port $PORT_A)..."
cd "$BACKEND_DIR"
FLASK_APP=app FLASK_RUN_PORT=$PORT_A uv run flask run --port $PORT_A 2>/dev/null &
PID_A=$!

echo "🚀 Starting Node B (port $PORT_B)..."
FLASK_APP=app FLASK_RUN_PORT=$PORT_B uv run flask run --port $PORT_B 2>/dev/null &
PID_B=$!

# Wait for servers to start
echo "⏳ Waiting for servers..."
for i in $(seq 1 15); do
    if curl -sf http://localhost:$PORT_A/health >/dev/null 2>&1 && \
       curl -sf http://localhost:$PORT_B/health >/dev/null 2>&1; then
        echo "   Both servers ready."
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo "❌ Servers failed to start. Aborting."
        exit 1
    fi
    sleep 1
done

echo ""

# ============================================================
# Test 1: Health check
# ============================================================
echo "📋 Test Group: Health Check"

HEALTH_A=$(curl -sf http://localhost:$PORT_A/health)
assert_contains "Node A /health returns ok" '"ok"' "$HEALTH_A"

HEALTH_B=$(curl -sf http://localhost:$PORT_B/health)
assert_contains "Node B /health returns ok" '"ok"' "$HEALTH_B"

echo ""

# ============================================================
# Test 2: Seed broadcast (A → B)
# ============================================================
echo "📋 Test Group: Seed Broadcast"

SEED_RESP=$(curl -sf -X POST http://localhost:$PORT_B/api/p2p/predict \
    -H 'Content-Type: application/json' \
    -d '{"topic":"如果比特幣突破15萬","rounds":10,"platform":"parallel","origin_node":"node-a"}')

assert_contains "Node B accepts seed" '"success":true' "$SEED_RESP"
assert_contains "Seed response mentions topic" '如果比特幣突破15萬' "$SEED_RESP"

echo ""

# ============================================================
# Test 3: Result sharing (A → B)
# ============================================================
echo "📋 Test Group: Result Sharing"

RESULT_RESP=$(curl -sf -X POST http://localhost:$PORT_B/api/p2p/result \
    -H 'Content-Type: application/json' \
    -d '{
        "topic": "如果比特幣突破15萬",
        "simulation_id": "sim_e2e_001",
        "origin_node": "node-a",
        "report": {
            "status": "completed",
            "outline": {
                "title": "BTC 150k Analysis",
                "sections": [
                    {"title": "Market Impact", "content": "Altcoins follow BTC surge."},
                    {"title": "Regulation", "content": "SEC scrutiny increases."}
                ]
            }
        },
        "timestamp": 1234567890
    }')

assert_contains "Node B stores result from A" '"success":true' "$RESULT_RESP"

# Also send a result from B's own simulation
RESULT_B=$(curl -sf -X POST http://localhost:$PORT_B/api/p2p/result \
    -H 'Content-Type: application/json' \
    -d '{
        "topic": "如果比特幣突破15萬",
        "simulation_id": "sim_e2e_002",
        "origin_node": "node-b",
        "report": {
            "status": "completed",
            "outline": {
                "title": "BTC Scenario B",
                "sections": [
                    {"title": "Mining", "content": "Hash rate soars."}
                ]
            }
        },
        "timestamp": 1234567891
    }')

assert_contains "Node B stores its own result" '"success":true' "$RESULT_B"

echo ""

# ============================================================
# Test 4: Result collection (query B)
# ============================================================
echo "📋 Test Group: Result Collection"

RESULTS=$(curl -sf "http://localhost:$PORT_B/api/p2p/results?topic=%E5%A6%82%E6%9E%9C%E6%AF%94%E7%89%B9%E5%B9%A3%E7%AA%81%E7%A0%B415%E8%90%AC")

assert_contains "Query returns success" '"success":true' "$RESULTS"
assert_contains "Contains node-a result" 'sim_e2e_001' "$RESULTS"
assert_contains "Contains node-b result" 'sim_e2e_002' "$RESULTS"

# Count results (should be 2)
RESULT_COUNT=$(echo "$RESULTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
assert_eq "Has exactly 2 results" "2" "$RESULT_COUNT"

echo ""

# ============================================================
# Test 5: Cross-node (B → A)
# ============================================================
echo "📋 Test Group: Cross-Node (B → A)"

CROSS_RESP=$(curl -sf -X POST http://localhost:$PORT_A/api/p2p/result \
    -H 'Content-Type: application/json' \
    -d '{"topic":"ETH merge","simulation_id":"sim_cross","origin_node":"node-b","report":{"status":"completed"},"timestamp":999}')

assert_contains "Node A accepts result from B" '"success":true' "$CROSS_RESP"

CROSS_Q=$(curl -sf "http://localhost:$PORT_A/api/p2p/results?topic=ETH%20merge")
assert_contains "Node A can query its stored results" 'sim_cross' "$CROSS_Q"

echo ""

# ============================================================
# Test 6: Edge cases
# ============================================================
echo "📋 Test Group: Edge Cases"

# Missing topic
BAD_SEED=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:$PORT_A/api/p2p/predict \
    -H 'Content-Type: application/json' \
    -d '{"rounds":10}')
assert_eq "Rejects seed without topic (400)" "400" "$BAD_SEED"

# Missing required fields
BAD_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:$PORT_A/api/p2p/result \
    -H 'Content-Type: application/json' \
    -d '{"topic":"only topic"}')
assert_eq "Rejects result without required fields (400)" "400" "$BAD_RESULT"

# Missing topic param
BAD_QUERY=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT_A/api/p2p/results")
assert_eq "Rejects query without topic param (400)" "400" "$BAD_QUERY"

# Query nonexistent topic
EMPTY=$(curl -sf "http://localhost:$PORT_A/api/p2p/results?topic=nonexistent")
EMPTY_COUNT=$(echo "$EMPTY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
assert_eq "Returns 0 results for unknown topic" "0" "$EMPTY_COUNT"

echo ""

# ============================================================
# Summary
# ============================================================
echo "════════════════════════════════════════"
echo "📊 E2E Results: $PASS passed, $FAIL failed (total: $TOTAL)"
echo "════════════════════════════════════════"

exit $FAIL
