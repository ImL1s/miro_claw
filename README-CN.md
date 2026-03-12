<div align="center">

# MiroClaw

**去中心化群体智能预测协议**

[MiroFish](https://github.com/666ghj/MiroFish) (55 AI Agents) × [OpenClaw](https://openclaw.ai) Gateway × Cosmos SDK

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

[English](./README-EN.md) | 简体中文 | [繁體中文](./README.md)

</div>

---

## Demo

https://github.com/ImL1s/miro_claw/releases/download/v0.4.0-demo/mirofish-discord-demo.mp4

## 这是什么？

MiroClaw 把 [MiroFish](https://github.com/666ghj/MiroFish)（55 个 AI Agent 在模拟社群平台上互动的推演引擎）包装成 CLI 工具和 [OpenClaw](https://openclaw.ai) 扩展，让你一行命令就能启动群体智能推演。

**你只需要输入一句话：**

```bash
mirofish predict "如果比特币突破 15 万美元，加密市场会怎样？"
```

MiroClaw 会自动完成：启动后端 → 构建知识图谱 → 生成 55 个 Agent → 运行社群模拟 → 输出预测报告。

## 三种运作模式

```
模式 1：单机推演 ✅ 已完成
┌──────────────────────────────────┐
│  OpenClaw Gateway + MiroFish CLI │
│  一台机器跑完整推演流程           │
└──────────────────────────────────┘

模式 2：P2P 分散推演 ✅ 已完成
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Node A  │◄──►│  Node B  │◄──►│  Node C  │
│  55 Agent│    │  55 Agent│    │  55 Agent│
└──────────┘    └──────────┘    └──────────┘
  各自推演 → 广播结果 → 合并共识报告

模式 3：链上存证 🚧 规划中
┌──────────────────────────────────┐
│  Cosmos SDK AppChain             │
│  推演结果上链 · 信誉系统 · 验证  │
└──────────────────────────────────┘
```

## 三层架构

| 层级 | 技术 | 状态 |
|:---|:---|:---|
| **推演层** | MiroFish Engine（GraphRAG + OASIS 多智能体模拟 + Report AI） | ✅ 已完成 |
| **Agent 层** | OpenClaw Gateway Network（P2P 通信、任务调度、Canvas 可视化） | ✅ 已完成 |
| **共识层** | Cosmos SDK AppChain（预测存证、信誉积分、零手续费） | 🚧 规划中 |

## 快速开始

### 前置需求

- **Node.js** >= 18
- **Docker Desktop**（推荐）或 Python 3.11+ 搭配 [uv](https://github.com/astral-sh/uv)
- **LLM API Key**（OpenAI 格式，支持任何兼容 API，建议 >= 14B 参数模型）
- **[Zep Cloud](https://www.getzep.com/) API Key**（GraphRAG 用，免费 tier 即可）

### 安装

```bash
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw

# 克隆 MiroFish 后端（外部依赖，非子模块）
git clone https://github.com/666ghj/MiroFish.git
```

### 首次设置

```bash
# 1. 启动后端（首次自动拉取 Docker image）
node cli/bin/mirofish.js serve start
# → 若尚未设置，会在 ~/.mirofish/.env 产生模板

# 2. 填入 API Key
#    编辑 ~/.mirofish/.env，填入 LLM_API_KEY、LLM_BASE_URL、ZEP_API_KEY

# 3. 重新启动
node cli/bin/mirofish.js serve start

# 4. 确认环境
node cli/bin/mirofish.js env
```

> **Apple Silicon 用户**：目前无 ARM64 Docker image，CLI 会自动切换到原生模式（需要本地 `MiroFish/` clone 和 `uv`）。

### 开始推演

```bash
# 基本推演（默认 20 轮）
mirofish predict "美联储降息对科技股的影响"

# 指定轮数（先用 10 轮试探，效果好再加到 40）
mirofish predict "主题" --rounds=10

# 推演完成后打开可视化 Dashboard
mirofish predict "主题" --canvas

# P2P 分散推演（需先设置 peers）
mirofish predict "主题" --p2p
```

### 互动功能

# 对报告追问
mirofish chat <sim_id> "哪些 KOL 的观点最极端？"

# 采访特定 Agent
mirofish interview <sim_id> 0 "你对这件事有什么看法？"

# 可视化 Dashboard
mirofish canvas <sim_id>
```

## 用户使用方式 (User-Facing)

当您将 MiroFish skill 安装至 OpenClaw 后，所有功能自动启用，无需了解底层架构：

### 1. Agent 自动触发对话
直接在聊天中输入预测关键字。
> 「帮我预测比特币下周走势」→ Agent 自动调用 `mirofish_predict` 工具 → SSE 实时推送进度 → 完成后回报结果。

### 2. Gateway RPC
适合系统集成或外部脚本调用。
```bash
openclaw gateway call mirofish.predict --params '{"topic": "..."}'
# 立即返回 {"runId": "run-xxx"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
```

### 3. CLI 命令行操作
适合高级开发者。
```bash
mirofish predict "比特币下周走势"
```
（推演结果直接打印于终端，并提供系统通知）

## 基础设施部署方式 (Infrastructure)

针对不同团队规模，提供三种底层部署方式：

### 1. 单机 Docker Compose (默认最简单)
```bash
docker compose -f docker-compose.p2p.yml up
```
Coordinator 与 Worker(s) 运行于同一台机器，适合本地开发与 Demo 呈现。

### 2. LAN 局域网分布式部署 (多台机器)
适合实验室、团队切分 GPU 负载的场景。
```bash
# 机器 A — Coordinator (调度中心)
docker run -p 50051:50051 -v ./certs:/app/certs oasis-coordinator

# 机器 B, C — Workers (执行节点)
docker run -e COORDINATOR_ADDR=192.168.x.x:50051 -v ./certs:/app/certs:ro oasis-worker
```
具备 TLS 及 token (`MIROFISH_CLUSTER_TOKEN`) 安全连接防护。

### 3. 原生模式 (无需 Docker)
适合 Python 开发者单步追踪调试。
```bash
cd oasis-distributed && MIROFISH_CLUSTER_TOKEN=your-token python3 scripts/run_coordinator.py   # 终端 1
cd oasis-distributed && MIROFISH_CLUSTER_TOKEN=your-token COORDINATOR_ADDR=localhost:50051 python3 scripts/run_worker.py   # 终端 2
```

## P2P 分散式推演

多台机器各自跑 MiroFish，互相分享推演结果，最后合并分析。

### 设置 Peers

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers list
mirofish peers health
```

### 分散推演流程

```bash
# --p2p：先广播种子给所有 peers，本机同时推演，完成后广播结果
mirofish predict "如果比特币突破15万" --p2p

# 收集所有节点的结果，合并产生共识报告
mirofish meta "如果比特币突破15万"
```

```
Node A (你的机器)           Node B (lab-server)       Node C (gpu-box)
──────────────────        ──────────────          ────────────
1. 广播种子 ──────────>  收到种子                 收到种子
2. 本机推演开始           [自动/手动推演]          [自动/手动推演]
3. 本机推演完成           推演完成                 推演完成
4. 广播结果 ──────────>  储存结果                 储存结果
5. mirofish meta ←────── 回传结果 ───────────── 回传结果
   → 合并共识报告
```

### Auto-Predict（选择性）

让 peer 收到种子后自动推演：

```bash
# 在 ~/.mirofish/.env 加入
P2P_AUTO_PREDICT=true
```

> ⚠️ Auto-predict 会消耗 LLM API quota，默认关闭。

### P2P API

每个 MiroFish 后端自动提供：

| Endpoint | 方法 | 说明 |
|:---|:---|:---|
| `/api/p2p/predict` | POST | 接收种子广播 |
| `/api/p2p/result` | POST | 接收其他节点推演结果 |
| `/api/p2p/results?topic=...` | GET | 查询已收集结果 |
| `/api/p2p/seeds` | GET | 查看收到的种子列表 |

## 完整命令参考

| 命令 | 功能 |
|:---|:---|
| `mirofish predict "主题"` | 完整推演（自动启动后端） |
| `mirofish predict "主题" --rounds=10` | 指定推演轮数 |
| `mirofish predict "主题" --p2p` | P2P 分散推演 |
| `mirofish predict "主题" --canvas` | 推演后自动打开 Dashboard |
| `mirofish predict "主题" --json-stream` | NDJSON 输出（供 Extension 使用） |
| `mirofish serve start\|stop\|status` | 管理 MiroFish 后端 |
| `mirofish canvas <sim_id>` | 打开可视化 Dashboard |
| `mirofish projects` | 列出所有项目 |
| `mirofish status <sim_id>` | 查询模拟进度 |
| `mirofish report <sim_id>` | 获取推演报告 |
| `mirofish chat <sim_id> "问题"` | 对报告追问 |
| `mirofish interview <sim_id> <agent_id> "问题"` | 采访特定 Agent |
| `mirofish peers add\|remove\|list\|health` | 管理 P2P 节点 |
| `mirofish meta "主题"` | 合并 P2P 共识报告 |
| `mirofish env` | 显示环境设置 |

## OpenClaw Extension

Extension 将 MiroFish 整合进 OpenClaw Gateway，提供：

- **Agent Tool** — LLM 可直接调用 `mirofish_predict`（异步，立即返回 runId）
- **Message Hook** — 聊天中关键字自动触发推演（默认关闭）
- **Gateway RPC** — `mirofish.predict` / `.status` / `.cancel` / `.list`
- **SSE 实时推送** — 推演进度实时推送至客户端
- **Canvas 路由** — `GET /mirofish/canvas` 报告可视化

```bash
# 安装
cd extensions/mirofish && npm install && npx tsc

# 通过 Gateway RPC 测试
openclaw gateway call mirofish.predict --params '{"topic": "推演主题"}'
openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list --params '{}'
```

## 环境变量

| 变量 | 用途 | 默认值 |
|:---|:---|:---|
| `LLM_API_KEY` | LLM API 密钥 | — |
| `LLM_BASE_URL` | LLM 端点 | — |
| `LLM_MODEL_NAME` | 模型名称 | — |
| `ZEP_API_KEY` | Zep Cloud GraphRAG 密钥 | — |
| `MIROFISH_URL` | MiroFish 后端 URL | `http://localhost:5001` |
| `MIROFISH_DIR` | MiroFish 源码路径（原生模式） | 自动检测 |
| `P2P_AUTO_PREDICT` | 收到种子时自动推演 | `false` |
| `OPENCLAW_GATEWAY_URL` | Gateway 推送 URL | `http://localhost:18787` |
| `MIROFISH_DISCORD_WEBHOOK` | Discord 通知 Webhook | — |

## Troubleshooting

```bash
# 确认 LLM 可达
curl http://YOUR_LLM_IP:1234/v1/models

# 确认后端健康
curl http://localhost:5001/health

# P2P: 查看收到的种子
curl http://localhost:5001/api/p2p/seeds

# 查看 native 模式 PID
cat ~/.mirofish/backend.pid

# 强制清理
pkill -f "uv run python run.py"
rm -f ~/.mirofish/backend.pid
```

## 项目结构

```
miro_claw/
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI 入口（12 个子命令）
│   ├── lib/                    # 核心模块：predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard（HTML + JS + CSS）
│   └── test/                   # 单元测试 + E2E (e2e-p2p.sh)
├── extensions/mirofish/        # OpenClaw Extension (TypeScript)
│   ├── index.ts                # 插件入口 — 6 个集成点
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # OpenClaw Skill 定义 (SKILL.md)
├── MiroFish/                   # 核心引擎 — 需手动 clone (Python Flask + Vue 3)
├── docs/                       # 愿景、阶段计划、分布式设计文档
└── docker-compose.p2p.yml      # 多节点 P2P Docker 配置
```

## 路线图

| 阶段 | 目标 | 状态 |
|:---|:---|:---|
| Phase 1 | Gateway 整合 MiroFish API，对话触发推演 | ✅ 完成 |
| Phase 2 | Canvas + 推送 + SSE 实时进度 + Report Chat | ✅ 完成 |
| Phase 3 | P2P 种子/结果广播 + 共识报告 | ✅ 完成 |
| Phase 4 | 分布式模拟：跨节点 Agent 分配（gRPC） | 🚧 设计中 |
| Phase 5 | Cosmos SDK AppChain：存证 + 信誉 MVP | 📋 规划中 |
| Phase 6 | 事后验证 + 排行榜 + 订阅经济 | 📋 规划中 |

## License

[AGPL-3.0](LICENSE)
