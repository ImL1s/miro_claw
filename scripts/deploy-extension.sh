#!/bin/bash
# Deploy MiroFish extension to OpenClaw Gateway
# Usage: bash scripts/deploy-extension.sh

set -e

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="$HOME/.openclaw/extensions/mirofish"

echo "📦 Deploying MiroFish extension..."
echo "   Source: $SRC_DIR/extensions/mirofish"
echo "   Dest:   $DEST_DIR"

# Sync source files
cp "$SRC_DIR/extensions/mirofish/index.ts" "$DEST_DIR/index.ts"
cp "$SRC_DIR/extensions/mirofish/tsconfig.json" "$DEST_DIR/tsconfig.json"
cp "$SRC_DIR/extensions/mirofish/package.json" "$DEST_DIR/package.json"

# Sync src/ directory
mkdir -p "$DEST_DIR/src"
for f in "$SRC_DIR/extensions/mirofish/src/"*.ts; do
  [ -f "$f" ] && cp "$f" "$DEST_DIR/src/$(basename "$f")"
done

# Sync canvas/ directory
mkdir -p "$DEST_DIR/canvas"
for f in "$SRC_DIR/cli/canvas/"*; do
  [ -f "$f" ] && cp "$f" "$DEST_DIR/canvas/$(basename "$f")"
done

echo "✅ Files synced"

# Build TypeScript
echo "🔨 Compiling TypeScript..."
cd "$DEST_DIR"
npx tsc 2>&1
echo "✅ Build complete"

# Restart Gateway
echo "🔄 Restarting Gateway..."
GATEWAY_PID=$(pgrep -f "openclaw-gateway" 2>/dev/null || true)
if [ -n "$GATEWAY_PID" ]; then
  kill "$GATEWAY_PID" 2>/dev/null || true
  sleep 2
fi

openclaw gateway --force &
GATEWAY_BG_PID=$!
sleep 5

# Verify
if kill -0 "$GATEWAY_BG_PID" 2>/dev/null; then
  echo "✅ Gateway restarted (PID: $GATEWAY_BG_PID)"
else
  echo "❌ Gateway failed to start"
  exit 1
fi

echo ""
echo "🎉 Deploy complete! Test with:"
echo "   openclaw gateway call mirofish.list --json"
echo "   openclaw gateway call mirofish.discover --json"
