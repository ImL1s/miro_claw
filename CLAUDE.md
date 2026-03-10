# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MiroClaw 是 MiroFish × OpenClaw 的整合專案，目標是建立去中心化群體智能預測協議。核心是 MiroFish 引擎：一個基於多智能體（55 AI Agents）的預測系統，透過在模擬社交平台（Twitter/Reddit）上的 Agent 互動來推演未來趨勢。

三層架構：推演層（MiroFish Engine）→ Agent 層（OpenClaw Gateway）→ 共識層（Cosmos SDK，可選）

## Repository Structure

```
miro_claw/
├── MiroFish/           # 主專案（fork from 666ghj/MiroFish）
│   ├── backend/        # Python Flask API (port 5001)
│   │   ├── app/
│   │   │   ├── api/          # Flask Blueprints: graph, simulation, report
│   │   │   ├── services/     # 核心業務邏輯
│   │   │   ├── models/       # 資料模型 (project, task)
│   │   │   └── utils/        # 工具 (file_parser, llm_client, logger)
│   │   ├── scripts/          # 獨立腳本 (run_parallel_simulation.py 等)
│   │   └── run.py            # 啟動入口
│   └── frontend/       # Vue 3 + Vite SPA (port 3000)
│       └── src/
│           ├── views/        # 頁面：Home, MainView, SimulationView, ReportView, InteractionView
│           ├── components/   # Step1-5 元件、GraphPanel、HistoryDatabase
│           ├── api/          # API 客戶端 (graph, simulation, report)
│           └── router/       # Vue Router
├── cli/                # MiroFish CLI (Node.js, 零依賴)
│   ├── bin/mirofish.js # CLI 入口
│   └── lib/            # api.js (HTTP client), docker.js, predict.js
├── skills/             # OpenClaw skill 定義
│   └── mirofish-predict/SKILL.md
├── docs/               # 願景文件與開發計畫
└── .env                # 根目錄環境變數 (zep_api_key, model_name)
```

## Development Commands

```bash
# 一鍵安裝所有依賴（Node + Python）
cd MiroFish && npm run setup:all

# 同時啟動前後端（dev mode）
cd MiroFish && npm run dev

# 單獨啟動
cd MiroFish && npm run backend    # Flask on :5001
cd MiroFish && npm run frontend   # Vite on :3000

# 前端 build
cd MiroFish && npm run build

# 後端 Python 依賴管理（使用 uv）
cd MiroFish/backend && uv sync

# 後端測試
cd MiroFish/backend && uv run pytest

# CLI 本地測試
node cli/bin/mirofish.js predict "主題" --rounds=10
```

## Architecture: Core Pipeline

推演流程是 6 步驟的異步 pipeline：

1. **POST /api/graph/ontology/generate** — 上傳種子文件（PDF/MD/TXT），LLM 生成本體定義 → 回傳 `project_id`
2. **POST /api/graph/build** — 異步建構 Zep 知識圖譜（GraphRAG）→ 回傳 `task_id`，需輪詢 `/api/graph/task/<task_id>`
3. **POST /api/simulation/prepare** — 生成 Agent 人設 + 環境配置 → 回傳 `simulation_id`
4. **POST /api/simulation/start** — 啟動 OASIS 多智能體模擬（subprocess）
5. **GET /api/simulation/<id>/run-status** — 輪詢模擬狀態
6. **POST /api/report/generate** — Report Agent 自主調用工具生成分析報告

## Key Technical Decisions

- **LLM**: 使用 OpenAI SDK 格式，可接任何相容 API（預設 qwen-plus via 阿里百炼）
- **記憶圖譜**: Zep Cloud（GraphRAG），需要 `ZEP_API_KEY`
- **模擬引擎**: OASIS (camel-oasis)，模擬在 subprocess 中執行，透過 IPC 通訊
- **前端 Proxy**: Vite 將 `/api` 代理到 `localhost:5001`
- **Python 套件管理**: uv（非 pip），虛擬環境在 `backend/.venv`
- **Flask 工廠模式**: `app/__init__.py` 的 `create_app()` 註冊 3 個 Blueprint

## Environment Variables

在 `MiroFish/.env` 中配置（後端從此讀取）：

| 變數 | 必填 | 說明 |
|:---|:---|:---|
| `LLM_API_KEY` | Yes | LLM API 金鑰 |
| `LLM_BASE_URL` | No | LLM endpoint（預設 OpenAI） |
| `LLM_MODEL_NAME` | No | 模型名稱（預設 gpt-4o-mini） |
| `ZEP_API_KEY` | Yes | Zep Cloud 金鑰 |

根目錄 `.env` 另有 `zep_api_key` 和 `model_name`（CLI 用）。

## Backend Services Map

| Service | 職責 |
|:---|:---|
| `ontology_generator` | LLM 從文本提取本體（實體類型、關係類型） |
| `graph_builder` | 透過 Zep API 建構知識圖譜 |
| `simulation_config_generator` | 生成模擬環境配置 |
| `oasis_profile_generator` | 生成 Agent 人設 |
| `simulation_runner` | 以 subprocess 執行 OASIS 模擬 |
| `simulation_manager` | 管理模擬狀態 |
| `simulation_ipc` | 主進程與模擬子進程間的 IPC |
| `report_agent` | 自主 Report Agent（有工具呼叫能力） |
| `zep_tools` / `zep_entity_reader` | Zep 圖譜查詢工具 |
| `text_processor` | 文本分塊處理 |

## Frontend Routes

| Path | View | 用途 |
|:---|:---|:---|
| `/` | Home | 首頁，建立專案 |
| `/process/:projectId` | MainView | 5 步驟流程主頁 |
| `/simulation/:simulationId` | SimulationView | 模擬設定 |
| `/simulation/:simulationId/start` | SimulationRunView | 模擬運行監控 |
| `/report/:reportId` | ReportView | 報告檢視 |
| `/interaction/:reportId` | InteractionView | 與 Agent/Report 互動對話 |

## Docker Deployment

```bash
cd MiroFish
docker compose up -d    # 使用預建 image ghcr.io/666ghj/MiroFish
# 或從原始碼 build
docker build -t mirofish .
```

Dockerfile 基於 Python 3.11，內含 Node.js + uv。Port 3000 (frontend) + 5001 (backend)。
