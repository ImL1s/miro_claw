# Phase 1：OpenClaw Gateway 整合 MiroFish API

## 目標

讓用戶在 OpenClaw 聊天中用自然語言觸發 MiroFish 推演，例如：
> 「推演一下如果比特幣下週突破 10 萬，市場會怎樣」

Gateway AI 自動提取種子 → 呼叫 MiroFish API → 推演完成後回報結果。

## 前置條件

- OpenClaw Gateway 已在本地運行
- MiroFish 在本地或 Docker 啟動（port 5001）
- LLM API Key 已配置（MiroFish 共用 Gateway 的 LLM 或獨立配）

---

## Proposed Changes

### 1. MiroFish 本地服務

#### [MODIFY] [.env](file:///Users/iml1s/Documents/mine/miro_claw/MiroFish/.env)

從 `.env.example` 複製並填入 LLM + Zep 金鑰。MiroFish 支援 OpenAI SDK 格式，可接任何相容 API。

---

### 2. OpenClaw MiroFish Hook

OpenClaw 的擴展機制是 **Hook**（TypeScript handler，放在 `~/.openclaw/hooks/` 目錄）。我們需要建一個 `mirofish` hook，監聽 Gateway 事件。

但更適合的做法是：**不做 Hook，做 Skill Prompt**。

OpenClaw 的 AI Agent 本身就能執行工具呼叫（shell、HTTP），不需要寫 TypeScript 程式碼。只要在 Gateway 的 workspace 裡放一個 **AGENTS.md** 或 **skill 檔案**，教 AI 怎麼呼叫 MiroFish API 即可。

#### [NEW] [mirofish-skill.md](file:///Users/iml1s/Documents/mine/miro_claw/mirofish-skill.md)

OpenClaw Skill 文件，教 Gateway AI 如何與 MiroFish 互動。包含：
- 觸發條件（用戶想要推演/預測/模擬）
- 完整的 API 呼叫序列（6 步驟）
- 每步的 curl 命令和參數模板
- 錯誤處理指引

```markdown
---
name: mirofish
description: "群體智能推演引擎 — 當用戶要求預測、推演、模擬時使用"
---

# MiroFish 推演技能

當用戶想要推演或預測某個場景時，按以下步驟操作：

## 觸發條件
用戶提到「推演」「預測」「模擬」「如果…會怎樣」等意圖

## API Base
http://localhost:5001/api

## 步驟 1：建立專案並生成本體
用戶的描述即為種子資料，建立文字檔後上傳：

```bash
# 建立種子文件
echo "用戶的描述內容" > /tmp/mirofish_seed.txt

# 上傳並生成本體
curl -X POST http://localhost:5001/api/graph/ontology/generate \
  -F "file=@/tmp/mirofish_seed.txt" \
  -F "simulation_requirement=用戶的預測需求描述"
```

回傳 project_id 和 ontology

## 步驟 2：構建圖譜
```bash
curl -X POST http://localhost:5001/api/graph/build \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<project_id>"}'
```

這是異步任務，需輪詢 task 狀態

## 步驟 3：準備模擬（生成 Agent 人設 + 環境配置）
```bash
curl -X POST http://localhost:5001/api/simulation/prepare \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<project_id>"}'
```

回傳 simulation_id

## 步驟 4：開始模擬
```bash
curl -X POST http://localhost:5001/api/simulation/start \
  -H "Content-Type: application/json" \
  -d '{
    "simulation_id": "<simulation_id>",
    "platform": "parallel",
    "max_rounds": 20
  }'
```

## 步驟 5：輪詢模擬狀態
```bash
curl http://localhost:5001/api/simulation/status/<simulation_id>
```

等待 runner_status 變為 "completed"

## 步驟 6：生成報告
```bash
curl -X POST http://localhost:5001/api/report/generate \
  -H "Content-Type: application/json" \
  -d '{"simulation_id": "<simulation_id>"}'
```

## 追問：與 Report Agent 對話
```bash
curl -X POST http://localhost:5001/api/report/chat \
  -H "Content-Type: application/json" \
  -d '{
    "simulation_id": "<simulation_id>",
    "message": "用戶的追問"
  }'
```

## 追問：採訪模擬中的 Agent
```bash
curl -X POST http://localhost:5001/api/simulation/interview \
  -H "Content-Type: application/json" \
  -d '{
    "simulation_id": "<simulation_id>",
    "agent_id": 0,
    "prompt": "你對這件事有什麼看法？"
  }'
```
```

---

### 3. Docker Compose 一鍵啟動

#### [NEW] [docker-compose.yml](file:///Users/iml1s/Documents/mine/miro_claw/docker-compose.yml)

統一啟動 MiroFish backend + frontend，方便 OpenClaw 連接：

```yaml
version: '3.8'
services:
  mirofish:
    build: ./MiroFish
    ports:
      - "5001:5001"
      - "3000:3000"
    env_file:
      - ./MiroFish/.env
    restart: unless-stopped
```

---

## 完整流程圖

```
用戶                    OpenClaw Gateway AI              MiroFish API
 │                           │                              │
 │ "推演BTC破10萬"           │                              │
 │──────────────────────────>│                              │
 │                           │ 識別推演意圖                 │
 │                           │ 提取種子文本                 │
 │                           │─── POST /graph/ontology ────>│
 │                           │<── project_id ───────────────│
 │                           │─── POST /graph/build ───────>│
 │                           │─── POST /simulation/prepare─>│
 │                           │<── simulation_id ────────────│
 │                           │─── POST /simulation/start ──>│
 │                           │                              │ (模擬中...)
 │ "推演已啟動，約需30分鐘"  │                              │
 │<──────────────────────────│                              │
 │                           │ (定期輪詢 status)            │
 │                           │─── GET /simulation/status ──>│
 │                           │<── completed ────────────────│
 │                           │─── POST /report/generate ───>│
 │                           │<── report ───────────────────│
 │ "推演完成！以下是結果..."  │                              │
 │<──────────────────────────│                              │
 │                           │                              │
 │ "那些KOL具體說了什麼？"   │                              │
 │──────────────────────────>│                              │
 │                           │─── POST /report/chat ───────>│
 │                           │<── response ─────────────────│
 │ "根據模擬..."             │                              │
 │<──────────────────────────│                              │
```

---

## Verification Plan

### 自動測試

1. **MiroFish 健康檢查**
```bash
cd /Users/iml1s/Documents/mine/miro_claw/MiroFish
cp .env.example .env
# 填入 LLM_API_KEY 和 ZEP_API_KEY
npm run setup:all
npm run backend &
sleep 5
curl http://localhost:5001/health
# 預期: {"status": "ok", "service": "MiroFish Backend"}
```

2. **API 端對端測試**（需要有有效的 API Key）
```bash
# 上傳種子並產生本體
curl -X POST http://localhost:5001/api/graph/ontology/generate \
  -F "file=@/tmp/test_seed.txt" \
  -F "simulation_requirement=測試推演"
# 預期: 回傳 project_id 和 ontology
```

### 手動測試

3. **OpenClaw 整合測試**
   - 啟動 MiroFish backend
   - 將 `mirofish-skill.md` 放入 OpenClaw workspace
   - 在 OpenClaw 聊天中輸入：「推演一下如果明天台灣宣布升息一碼會怎樣」
   - 驗證 Gateway AI 有識別意圖並開始呼叫 MiroFish API
   - 驗證推演完成後有回報結果

> [!IMPORTANT]
> 手動測試需要有效的 `LLM_API_KEY` 和 `ZEP_API_KEY`。
> 如果你有自己的 key 可以直接測，沒有的話可以先用 MiroFish 的線上 demo 驗證 API 格式。
