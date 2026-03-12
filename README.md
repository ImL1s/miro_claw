<div align="center">

# MiroClaw

**55 AI Agent 群體智能預測引擎 — 單機推演 · P2P 多節點共識**

[MiroFish](https://github.com/666ghj/MiroFish) × [OpenClaw](https://openclaw.ai) Gateway

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

[English](./README-EN.md) | [简体中文](./README-CN.md) | 繁體中文

</div>

---

## Demo

<div align="center">

![MiroClaw Demo](docs/mirofish-demo.gif)

*55 AI Agent 群體智能推演 — 從對話到預測報告*

</div>

## 這是什麼？

MiroClaw 是 [OpenClaw](https://openclaw.ai) 的 AI Agent 擴充套件，把 [MiroFish](https://github.com/666ghj/MiroFish)（55 個 AI Agent 模擬社群互動的推演引擎）接入 OpenClaw Gateway。

**在 OpenClaw 聊天中直接說：**

```
你：幫我預測如果比特幣突破 20 萬美元，市場會怎麼反應
Agent：正在啟動 MiroFish 推演... [55 Agent 社群模擬] → 完成！
```

MiroClaw 自動完成：啟動後端 → 建立知識圖譜 → 生成 55 個 Agent → 運行社群模擬 → 輸出預測報告。

## 架構

| 層級 | 技術 | 狀態 |
|:---|:---|:---|
| **推演層** | MiroFish Engine（GraphRAG + OASIS 多智能體模擬 + Report AI） | ✅ 已完成 |
| **Agent 層** | OpenClaw Gateway Network（P2P 通訊、任務調度、Canvas 視覺化） | ✅ 已完成 |

## 快速開始：安裝到 OpenClaw

### 前置需求

- **[OpenClaw](https://openclaw.ai)** Gateway 已安裝並運行
- **Node.js** >= 18
- **Docker Desktop**（推薦）或 Python 3.11+ 搭配 [uv](https://github.com/astral-sh/uv)
- **LLM API Key**（OpenAI 格式，支援任何相容 API，建議 >= 14B 參數模型）
- **[Zep Cloud](https://www.getzep.com/) API Key**（GraphRAG 用，免費 tier 即可）

### 安裝（一行搞定）

```bash
openclaw skills install mirofish-predict
```

安裝後設定 API Key：

```bash
# 編輯 ~/.mirofish/.env，填入以下三個 Key：
LLM_API_KEY=your-llm-api-key
LLM_BASE_URL=http://your-llm-server:1234/v1
ZEP_API_KEY=your-zep-cloud-key

# 重啟 Gateway
openclaw gateway restart
```

> **Apple Silicon 用戶**：目前無 ARM64 Docker image，CLI 會自動切換到原生模式。

<details>
<summary>手動安裝（開發者模式）</summary>

```bash
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw
git clone https://github.com/666ghj/MiroFish.git

# 安裝 Extension + Skill
cp -r extensions/mirofish/ ~/.openclaw/extensions/mirofish/
cd ~/.openclaw/extensions/mirofish && npm install && npx tsc && cd -
cp -r skills/mirofish-predict/ ~/.openclaw/skills/mirofish-predict/

# CLI symlink
ln -sf $(pwd)/cli/bin/mirofish.js /usr/local/bin/mirofish

openclaw gateway restart
```

</details>

### 開始使用

安裝完成後，在 OpenClaw 聊天中用自然語言即可觸發推演：

```
🧑 你：幫我預測如果比特幣突破 20 萬美元，市場會怎麼反應

🤖 Agent：正在啟動 MiroFish 推演...
         📡 SSE 即時推播：
           Step 1/7 建立知識圖譜 ✅
           Step 2/7 生成 55 個 AI Agent ⏳
           ...
           Step 7/7 產出預測報告 ✅
         
         📊 推演完成！報告摘要：
         比特幣突破20萬美元將觸發跨領域連鎖反應...
         Simulation ID: sim_c6167c07bf05

🧑 你：幫我問一下 Agent #3 對這件事怎麼看

🤖 Agent：[呼叫 mirofish_interview]
         Agent #3（@CryptoKing_BTC，19歲科技愛好者）回應：
         「我覺得這是不可避免的趨勢，機構資金的湧入...」

🧑 你：這份報告中最悲觀的觀點是什麼？

🤖 Agent：[呼叫 mirofish_chat]
         根據報告分析，最悲觀的觀點來自 Agent #12...
```

### Agent Tools 一覽

LLM 會根據 Skill 描述自動選用對應工具：

| Tool | 功能 | 典型觸發語 |
|:---|:---|:---|
| `mirofish_predict` | 啟動新推演 | 「預測...」「推演...」「分析...的影響」 |
| `mirofish_status` | 查詢推演進度 | 「推演到哪了？」「進度如何？」 |
| `mirofish_cancel` | 取消推演 | 「取消推演」「停止模擬」 |
| `mirofish_chat` | 追問報告 | 「報告中...」「最大風險是什麼？」 |
| `mirofish_interview` | 採訪特定 Agent | 「問 Agent #3」「採訪第 5 個 Agent」 |
| `mirofish_report` | 取得完整報告 | 「給我完整報告」「報告全文」 |
| `mirofish_agents` | 列出 55 個 Agent | 「有哪些 Agent？」「Agent 列表」 |

### Gateway RPC

適合外部腳本、CI/CD、前端整合、或 cron 定時排程：

```bash
# 推演管理
openclaw gateway call mirofish.predict \
  --params '{"topic": "聯準會降息影響", "rounds": 10}'
# → {"runId": "run-1710000000000"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list   --params '{}'

# 報告互動
openclaw gateway call mirofish.chat \
  --params '{"simId": "sim_xxx", "question": "最大風險是什麼？"}'

openclaw gateway call mirofish.interview \
  --params '{"simId": "sim_xxx", "agentId": 3, "question": "你怎麼看？"}'

# Agent 與報告
openclaw gateway call mirofish.report  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.agents  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.posts   --params '{"simId": "sim_xxx"}'
```

### Discord 通知

推演完成後自動推送到 Discord 頻道：

```bash
# 在 ~/.mirofish/.env 設定
MIROFISH_DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx/yyy
```

### Extension 架構

| 整合點 | 檔案 | 功能 |
|:---|:---|:---|
| Agent Tools | `src/tools.ts` | 7 個 LLM 可調用的工具 |
| Message Hook | `src/hooks.ts` | 聊天關鍵字自動觸發推演（預設關閉） |
| Gateway RPC | `src/gateway.ts` | 10 個 RPC 方法供外部系統整合 |
| SSE Broadcaster | `src/progress-broadcaster.ts` | 推演進度即時推送 |
| Canvas Route | `src/canvas-route.ts` | `GET /mirofish/canvas` 報告視覺化 |
| P2P Peer Discovery | `src/peer-discovery.ts` | 自動 Peer 發現 |

---

## 進階用法

### CLI 命令列

不使用 OpenClaw 也可以直接用 CLI 完成所有操作：

```bash
# ─── 推演 ───
mirofish predict "聯準會降息對科技股的影響"                # 基本推演（預設 20 輪）
mirofish predict "主題" --rounds=3                        # 指定輪數
mirofish predict "主題" --canvas                          # 推演後開啟 Dashboard
mirofish predict "主題" --json-stream                     # NDJSON 串流輸出
mirofish predict "主題" --distributed --workers=3         # 分散式（Docker Worker）
mirofish predict "主題" --p2p                             # P2P 多節點推演

# ─── 報告互動 ───
mirofish chat sim_xxx "哪些觀點最極端？"                   # 追問 Report Agent
mirofish interview sim_xxx 0 "你怎麼看？"                  # 採訪 Agent #0
mirofish report sim_xxx                                   # 取得完整報告
mirofish canvas sim_xxx                                   # 視覺化 Dashboard

# ─── 後端管理 ───
mirofish serve start                                      # 啟動後端（Docker 優先）
mirofish serve stop                                       # 停止後端
mirofish serve status                                     # 查看後端狀態

# ─── P2P 節點管理 ───
mirofish peers add http://192.168.1.100:5001 "lab"        # 新增 peer
mirofish peers remove lab                                 # 移除 peer
mirofish peers list                                       # 列出所有 peers
mirofish peers health                                     # 檢查所有 peer 健康
mirofish meta "主題"                                      # 合併 P2P 共識報告

# ─── 其他 ───
mirofish projects                                         # 列出所有專案
mirofish status sim_xxx                                   # 查詢模擬進度
mirofish env                                              # 顯示環境設定
```

### 運作模式

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
```

### P2P 多節點部署

#### Docker 一鍵啟動 3 節點

```bash
docker compose -f docker-compose.p2p-3nodes.yml build
docker compose -f docker-compose.p2p-3nodes.yml up -d

# 健康檢查
curl http://localhost:5011/health   # Node1
curl http://localhost:5012/health   # Node2
curl http://localhost:5013/health   # Node3

# 從 Node1 發起 P2P 推演
docker exec mirofish-p2p-node1 node /app/cli/bin/mirofish.js \
  predict "如果比特幣突破20萬" --p2p --rounds=3

docker compose -f docker-compose.p2p-3nodes.yml down
```

#### 手動模式（跨 LAN 多機）

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers health
mirofish predict "主題" --p2p
mirofish meta "主題"
```

> 在 peer 機器上設定 `P2P_AUTO_PREDICT=true`（`~/.mirofish/.env`）讓收到種子後自動推演。

### OASIS 分散式（gRPC Worker 模式）

將 55 個 Agent 分散到多台機器執行：

```bash
# Docker Compose
cd oasis-distributed && docker compose -f docker-compose.distributed.yml up

# 原生模式
python3 scripts/run_coordinator.py   # 終端 1
python3 scripts/run_worker.py        # 終端 2
```

---

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
├── extensions/mirofish/        # ⭐ OpenClaw Extension (TypeScript)
│   ├── index.ts                # 外掛入口 — 6 個整合點
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # ⭐ OpenClaw Skill 定義 (SKILL.md)
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI 入口（12 個子指令）
│   ├── lib/                    # 核心模組：predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard（HTML + JS + CSS）
│   └── test/                   # 單元測試 + E2E (e2e-p2p.sh)
├── core/                       # 共用型別與常數 (@mirofish/core)
├── oasis-distributed/          # 分散式 Agent 執行層 (gRPC, Docker)
├── MiroFish/                   # 核心引擎 — 需手動 clone (Python Flask + Vue 3)
├── Dockerfile.p2p-node         # P2P Docker 節點映像檔
├── docker-compose.p2p-3nodes.yml  # 3 節點 P2P Docker 叢集
├── docs/                       # 願景、階段計劃、分散式設計文件
└── docker-compose.p2p.yml      # 多節點 P2P Docker 設定
```

## 路線圖

| 階段 | 目標 | 狀態 |
|:---|:---|:---|
| Phase 1 | Gateway 整合 MiroFish API，對話觸發推演 | ✅ 完成 |
| Phase 2 | Canvas + 推播 + SSE 即時進度 + Report Chat | ✅ 完成 |
| Phase 3 | P2P 種子/結果廣播 + 共識報告 | ✅ 完成 |
| Phase 4 | P2P Docker 3 節點叢集驗證 + Auto-Predict | ✅ 完成 |
| Phase 5 | 分散式模擬：跨節點 Agent 分配（gRPC） | 🚧 設計中 |
| Phase 6 | Cosmos SDK AppChain：存證 + 信譽 MVP | 📋 規劃中 |
| Phase 7 | 事後驗證 + 排行榜 + 訂閱經濟 | 📋 規劃中 |

## License

[AGPL-3.0](LICENSE)
