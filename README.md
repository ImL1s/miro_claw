<div align="center">

# MiroClaw

**去中心化群體智能預測協議**

[MiroFish](https://github.com/666ghj/MiroFish) (55 AI Agents) × [OpenClaw](https://openclaw.ai) Gateway × Cosmos SDK

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

[English](./README-EN.md) | [简体中文](./README-CN.md) | 繁體中文

</div>

---

## Demo

https://github.com/ImL1s/miro_claw/releases/download/v0.4.0-demo/mirofish-discord-demo.mp4

## 這是什麼？

MiroClaw 把 [MiroFish](https://github.com/666ghj/MiroFish)（55 個 AI Agent 在模擬社群平台上互動的推演引擎）包裝成 CLI 工具和 [OpenClaw](https://openclaw.ai) 擴充套件，讓你一行指令就能啟動群體智能推演。

**你只需要輸入一句話：**

```bash
mirofish predict "如果比特幣突破 15 萬美元，加密市場會怎樣？"
```

MiroClaw 會自動完成：啟動後端 → 建立知識圖譜 → 生成 55 個 Agent → 運行社群模擬 → 輸出預測報告。

## 三種運作模式

```
模式 1：單機推演 ✅ 已完成
┌──────────────────────────────────┐
│  OpenClaw Gateway + MiroFish CLI │
│  一台機器跑完整推演流程           │
└──────────────────────────────────┘

模式 2：P2P 分散推演 ✅ 已完成
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Node A  │◄──►│  Node B  │◄──►│  Node C  │
│  55 Agent│    │  55 Agent│    │  55 Agent│
└──────────┘    └──────────┘    └──────────┘
  各自推演 → 廣播結果 → 合併共識報告

模式 3：鏈上存證 🚧 規劃中
┌──────────────────────────────────┐
│  Cosmos SDK AppChain             │
│  推演結果上鏈 · 信譽系統 · 驗證  │
└──────────────────────────────────┘
```

## 三層架構

| 層級 | 技術 | 狀態 |
|:---|:---|:---|
| **推演層** | MiroFish Engine（GraphRAG + OASIS 多智能體模擬 + Report AI） | ✅ 已完成 |
| **Agent 層** | OpenClaw Gateway Network（P2P 通訊、任務調度、Canvas 視覺化） | ✅ 已完成 |
| **共識層** | Cosmos SDK AppChain（預測存證、信譽積分、零手續費） | 🚧 規劃中 |

## 快速開始

### 前置需求

- **Node.js** >= 18
- **Docker Desktop**（推薦）或 Python 3.11+ 搭配 [uv](https://github.com/astral-sh/uv)
- **LLM API Key**（OpenAI 格式，支援任何相容 API，建議 >= 14B 參數模型）
- **[Zep Cloud](https://www.getzep.com/) API Key**（GraphRAG 用，免費 tier 即可）

### 安裝

```bash
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw

# 手動 clone MiroFish 後端（外部依賴，非子模組）
git clone https://github.com/666ghj/MiroFish.git
```

### 首次設定

```bash
# 1. 啟動後端（首次自動拉取 Docker image）
node cli/bin/mirofish.js serve start
# → 若尚未設定，會在 ~/.mirofish/.env 產生模板

# 2. 填入 API Key
#    編輯 ~/.mirofish/.env，填入 LLM_API_KEY、LLM_BASE_URL、ZEP_API_KEY

# 3. 重新啟動
node cli/bin/mirofish.js serve start

# 4. 確認環境
node cli/bin/mirofish.js env
```

> **Apple Silicon 用戶**：目前無 ARM64 Docker image，CLI 會自動切換到原生模式（需要 `MiroFish/` 子模組和 `uv`）。

### 開始推演

```bash
# 基本推演（預設 20 輪）
mirofish predict "聯準會降息對科技股的影響"

# 指定輪數（先用 10 輪試探，效果好再加到 40）
mirofish predict "主題" --rounds=10

# 推演完成後開啟視覺化 Dashboard
mirofish predict "主題" --canvas

# P2P 分散推演（需先設定 peers）
mirofish predict "主題" --p2p
```

### 互動功能

# 對報告追問
mirofish chat <sim_id> "哪些 KOL 的觀點最極端？"

# 採訪特定 Agent
mirofish interview <sim_id> 0 "你對這件事有什麼看法？"

# 視覺化 Dashboard
mirofish canvas <sim_id>
```

## 用戶使用方式 (User-Facing)

當您將 MiroFish skill 安裝至 OpenClaw 後，所有功能自動啟用，無需了解底層架構：

### 1. Agent 自動觸發對話
直接在聊天中輸入預測關鍵字。
> 「幫我預測比特幣下週走勢」→ Agent 自動呼叫 `mirofish_predict` 工具 → SSE 即時推播進度 → 完成後回報結果。
> 「用分散式模擬預測 ETH 走勢，3 個 worker」→ Agent 呼叫 `mirofish_predict({ distributed: true, workers: 3 })`

### 2. Gateway RPC
適合系統整合或外部腳本呼叫。
```bash
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
# 分散式預測
openclaw gateway call mirofish.predict --params '{"topic": "...", "distributed": true, "workers": 3}'
# 立即回傳 {"runId": "run-xxx"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
```

### 3. CLI 命令列操作
適合進階開發者。
```bash
mirofish predict "比特幣下週走勢"
# 分散式預測
mirofish predict "比特幣下週走勢" --distributed --workers=3
```
（推演結果直接印於終端機，並提供系統通知）

## 基礎設施部署方式 (Infrastructure)

針對不同團隊規模，提供三種底層部署方式：

### 1. 單機 Docker Compose (預設最簡單)
```bash
docker compose -f docker-compose.p2p.yml up
```
Coordinator 與 Worker(s) 運行於同一台機器，適合本地開發與 Demo 呈現。

### 2. LAN 區域網路分散式部署 (多台機器)
適合實驗室、團隊切分 GPU 負載的場境。
```bash
# 機器 A — Coordinator (調度中心)
docker run -p 50051:50051 -v ./certs:/app/certs oasis-coordinator

# 機器 B, C — Workers (執行節點)
docker run -e COORDINATOR_ADDR=192.168.x.x:50051 -v ./certs:/app/certs:ro oasis-worker
```
具備 TLS 及 token (`MIROFISH_CLUSTER_TOKEN`) 安全連線防護。

### 3. 原生模式 (無需 Docker)
適合 Python 開發者單步追蹤除錯。
```bash
python3 scripts/run_coordinator.py   # 終端 1
python3 scripts/run_worker.py --coordinator localhost:50051  # 終端 2
```

## P2P 分散式推演

多台機器各自跑 MiroFish，互相分享推演結果，最後合併分析。

### 設定 Peers

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers list
mirofish peers health
```

### 分散推演流程

```bash
# --p2p：先廣播種子給所有 peers，本機同時推演，完成後廣播結果
mirofish predict "如果比特幣突破15萬" --p2p

# 收集所有節點的結果，合併產生共識報告
mirofish meta "如果比特幣突破15萬"
```

```
Node A (你的機器)           Node B (lab-server)       Node C (gpu-box)
──────────────────        ──────────────          ────────────
1. 廣播種子 ──────────>  收到種子                 收到種子
2. 本機推演開始           [自動/手動推演]          [自動/手動推演]
3. 本機推演完成           推演完成                 推演完成
4. 廣播結果 ──────────>  儲存結果                 儲存結果
5. mirofish meta ←────── 回傳結果 ───────────── 回傳結果
   → 合併共識報告
```

### Auto-Predict（選擇性）

讓 peer 收到種子後自動推演：

```bash
# 在 ~/.mirofish/.env 加入
P2P_AUTO_PREDICT=true
```

> ⚠️ Auto-predict 會消耗 LLM API quota，預設關閉。

### P2P API

每個 MiroFish 後端自動提供：

| Endpoint | 方法 | 說明 |
|:---|:---|:---|
| `/api/p2p/predict` | POST | 接收種子廣播 |
| `/api/p2p/result` | POST | 接收其他節點推演結果 |
| `/api/p2p/results?topic=...` | GET | 查詢已收集結果 |
| `/api/p2p/seeds` | GET | 查看收到的種子列表 |

## 完整指令參考

| 指令 | 功能 |
|:---|:---|
| `mirofish predict "主題"` | 完整推演（自動啟動後端） |
| `mirofish predict "主題" --rounds=10` | 指定推演輪數 |
| `mirofish predict "主題" --distributed --workers=3` | 分散式推演（Docker/Native） |
| `mirofish predict "主題" --p2p` | P2P 分散推演 |
| `mirofish predict "主題" --canvas` | 推演後自動開啟 Dashboard |
| `mirofish predict "主題" --json-stream` | NDJSON 輸出（供 Extension 使用） |
| `mirofish serve start\|stop\|status` | 管理 MiroFish 後端 |
| `mirofish canvas <sim_id>` | 開啟視覺化 Dashboard |
| `mirofish projects` | 列出所有專案 |
| `mirofish status <sim_id>` | 查詢模擬進度 |
| `mirofish report <sim_id>` | 取得推演報告 |
| `mirofish chat <sim_id> "問題"` | 對報告追問 |
| `mirofish interview <sim_id> <agent_id> "問題"` | 採訪特定 Agent |
| `mirofish peers add\|remove\|list\|health` | 管理 P2P 節點 |
| `mirofish meta "主題"` | 合併 P2P 共識報告 |
| `mirofish env` | 顯示環境設定 |

## OpenClaw Extension

Extension 將 MiroFish 整合進 OpenClaw Gateway，提供：

- **Agent Tool** — LLM 可直接呼叫 `mirofish_predict`（非同步，立即回傳 runId）
- **Message Hook** — 聊天中關鍵字自動觸發推演（預設關閉）
- **Gateway RPC** — `mirofish.predict` / `.status` / `.cancel` / `.list`
- **SSE 即時推播** — 推演進度即時推送至客戶端
- **Canvas 路由** — `GET /mirofish/canvas` 報告視覺化

```bash
# 安裝
cd extensions/mirofish && npm install && npx tsc

# 透過 Gateway RPC 測試
openclaw gateway call mirofish.predict --params '{"topic": "推演主題"}'
openclaw gateway call mirofish.predict --params '{"topic": "...", "distributed": true, "workers": 3}'
openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list --params '{}'
```

## 環境變數

| 變數 | 用途 | 預設值 |
|:---|:---|:---|
| `LLM_API_KEY` | LLM API 金鑰 | — |
| `LLM_BASE_URL` | LLM 端點 | — |
| `LLM_MODEL_NAME` | 模型名稱 | — |
| `ZEP_API_KEY` | Zep Cloud GraphRAG 金鑰 | — |
| `MIROFISH_URL` | MiroFish 後端 URL | `http://localhost:5001` |
| `MIROFISH_DIR` | MiroFish 原始碼路徑（原生模式） | 自動偵測 |
| `P2P_AUTO_PREDICT` | 收到種子時自動推演 | `false` |
| `OPENCLAW_GATEWAY_URL` | Gateway 推播 URL | `http://localhost:18787` |
| `MIROFISH_DISCORD_WEBHOOK` | Discord 通知 Webhook | — |

## Troubleshooting

```bash
# 確認 LLM 可達
curl http://YOUR_LLM_IP:1234/v1/models

# 確認後端健康
curl http://localhost:5001/health

# P2P: 查看收到的種子
curl http://localhost:5001/api/p2p/seeds

# 查看 native 模式 PID
cat ~/.mirofish/backend.pid

# 強制清理
pkill -f "uv run python run.py"
rm -f ~/.mirofish/backend.pid
```

## 專案結構

```
miro_claw/
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI 入口（12 個子指令）
│   ├── lib/                    # 核心模組：predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard（HTML + JS + CSS）
│   └── test/                   # 單元測試 + E2E (e2e-p2p.sh)
├── extensions/mirofish/        # OpenClaw Extension (TypeScript)
│   ├── index.ts                # 外掛入口 — 6 個整合點
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # OpenClaw Skill 定義 (SKILL.md)
├── MiroFish/                   # 核心引擎 — 需手動 clone (Python Flask + Vue 3)
├── docs/                       # 願景、階段計劃、分散式設計文件
└── docker-compose.p2p.yml      # 多節點 P2P Docker 設定
```

## 路線圖

| 階段 | 目標 | 狀態 |
|:---|:---|:---|
| Phase 1 | Gateway 整合 MiroFish API，對話觸發推演 | ✅ 完成 |
| Phase 2 | Canvas + 推播 + SSE 即時進度 + Report Chat | ✅ 完成 |
| Phase 3 | P2P 種子/結果廣播 + 共識報告 | ✅ 完成 |
| Phase 4 | 分散式模擬：跨節點 Agent 分配（gRPC） | 🚧 設計中 |
| Phase 5 | Cosmos SDK AppChain：存證 + 信譽 MVP | 📋 規劃中 |
| Phase 6 | 事後驗證 + 排行榜 + 訂閱經濟 | 📋 規劃中 |

## License

MIT
