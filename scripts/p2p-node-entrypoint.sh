#!/usr/bin/env bash
# P2P Node Entrypoint
# 1. 寫入 peers.json（由環境變數注入）
# 2. 啟動 Flask backend
set -e

NODE_NAME="${NODE_NAME:-node}"
PEERS_JSON="${PEERS_JSON:-[]}"

echo "🔧 [$NODE_NAME] Configuring peers..."
mkdir -p /root/.mirofish
echo "$PEERS_JSON" > /root/.mirofish/peers.json

# 寫入 .env（讓 CLI 能找到 LLM 設定）
cat > /root/.mirofish/.env <<EOF
LLM_API_KEY=${LLM_API_KEY:-}
LLM_BASE_URL=${LLM_BASE_URL:-}
LLM_MODEL_NAME=${LLM_MODEL_NAME:-}
ZEP_API_KEY=${ZEP_API_KEY:-}
EOF

echo "📋 [$NODE_NAME] Peers config:"
cat /root/.mirofish/peers.json

echo ""
echo "🚀 [$NODE_NAME] Starting MiroFish backend on port 5001..."
echo "   P2P_AUTO_PREDICT=$P2P_AUTO_PREDICT"

cd /app/backend
exec uv run flask run --host 0.0.0.0 --port 5001
