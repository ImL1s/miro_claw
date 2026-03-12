#!/bin/bash
set -e

echo "🦞 Starting OpenClaw + MiroFish Node..."

# ── 1. Write peers.json from env ──
MIROFISH_HOME="/root/.mirofish"
mkdir -p "$MIROFISH_HOME"

if [ -n "$PEERS_JSON" ]; then
    echo "$PEERS_JSON" > "$MIROFISH_HOME/peers.json"
    echo "   📡 Peers configured: $(echo "$PEERS_JSON" | grep -o '"endpoint"' | wc -l | tr -d ' ') peer(s)"
fi

# ── 2. Write .env for CLI (LLM config) ──
cat > "$MIROFISH_HOME/.env" << EOF
LLM_API_KEY=${LLM_API_KEY}
LLM_BASE_URL=${LLM_BASE_URL}
LLM_MODEL_NAME=${LLM_MODEL_NAME}
ZEP_API_KEY=${ZEP_API_KEY:-fake-key}
EOF

# ── 3. Start MiroFish Backend (Flask :5001) in background ──
echo "   🐟 Starting MiroFish Backend on :5001..."
cd /app/mirofish-backend
export FLASK_APP=app
export FLASK_ENV=production
export MIROFISH_URL=http://localhost:5001

/root/.local/bin/uv run python -m flask run --host=0.0.0.0 --port=5001 &
BACKEND_PID=$!

# Wait for backend to be healthy
for i in $(seq 1 30); do
    if curl -sf http://localhost:5001/health > /dev/null 2>&1; then
        echo "   ✅ MiroFish Backend healthy!"
        break
    fi
    sleep 1
done

# ── 4. Start OpenClaw Gateway ──
echo "   🦞 Starting OpenClaw Gateway on :18787..."
cd /app
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-mirofish-p2p-test}"
exec node openclaw.mjs gateway \
    --allow-unconfigured \
    --bind lan \
    --port ${OPENCLAW_PORT:-18787} \
    --auth token \
    --token "$OPENCLAW_GATEWAY_TOKEN"
