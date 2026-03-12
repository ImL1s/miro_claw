<div align="center">

# MiroClaw

**55 AI Agent 群体智能预测引擎 — 单机推演 · P2P 多节点共识**

[MiroFish](https://github.com/666ghj/MiroFish) × [OpenClaw](https://openclaw.ai) Gateway

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)

[English](./README-EN.md) | 简体中文 | [繁體中文](./README.md)

</div>

---

## Demo

<div align="center">

![MiroClaw Demo](docs/mirofish-demo.gif)

*55 AI Agent 群体智能推演 — 从对话到预测报告*

</div>

## 这是什么？

MiroClaw 是 [OpenClaw](https://openclaw.ai) 的 AI Agent 扩展，把 [MiroFish](https://github.com/666ghj/MiroFish)（55 个 AI Agent 模拟社群互动的推演引擎）接入 OpenClaw Gateway。

**在 OpenClaw 聊天中直接说：**

```
你：帮我预测如果比特币突破 20 万美元，市场会怎么反应
Agent：正在启动 MiroFish 推演... [55 Agent 社群模拟] → 完成！
```

MiroClaw 自动完成：启动后端 → 构建知识图谱 → 生成 55 个 Agent → 运行社群模拟 → 输出预测报告。

## 架构

| 层级 | 技术 | 状态 |
|:---|:---|:---|
| **推演层** | MiroFish Engine（GraphRAG + OASIS 多智能体模拟 + Report AI） | ✅ 已完成 |
| **Agent 层** | OpenClaw Gateway Network（P2P 通信、任务调度、Canvas 可视化） | ✅ 已完成 |

## 快速开始：安装到 OpenClaw

### 前置需求

- **[OpenClaw](https://openclaw.ai)** Gateway 已安装并运行
- **Node.js** >= 18
- **Docker Desktop**（推荐）或 Python 3.11+ 搭配 [uv](https://github.com/astral-sh/uv)
- **LLM API Key**（OpenAI 格式，支持任何兼容 API，建议 >= 14B 参数模型）
- **[Zep Cloud](https://www.getzep.com/) API Key**（GraphRAG 用，免费 tier 即可）

### 安装

**方法 1：在聊天中贴上链接（最简单）**

在 OpenClaw 聊天中直接贴上这个链接，Agent 会自动完成安装：

```
https://github.com/ImL1s/miro_claw
```

**方法 2：CLI 一行安装**

```bash
openclaw skills install mirofish-predict
```

### 设置 API Key

安装完成后，在 OpenClaw 聊天中直接告诉 Agent 你的 Key：

```
你：帮我设置 MiroFish，LLM API Key 是 sk-xxx，Base URL 是 http://my-server:1234/v1，Zep Key 是 z_xxx
```

或手动编辑 `~/.mirofish/.env`：

```bash
LLM_API_KEY=your-llm-api-key
LLM_BASE_URL=http://your-llm-server:1234/v1
ZEP_API_KEY=your-zep-cloud-key
```

> **Apple Silicon 用户**：目前无 ARM64 Docker image，CLI 会自动切换到原生模式。

<details>
<summary>手动安装（开发者模式）</summary>

```bash
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw
git clone https://github.com/666ghj/MiroFish.git

# 安装 Extension + Skill
cp -r extensions/mirofish/ ~/.openclaw/extensions/mirofish/
cd ~/.openclaw/extensions/mirofish && npm install && npx tsc && cd -
cp -r skills/mirofish-predict/ ~/.openclaw/skills/mirofish-predict/

# CLI symlink
ln -sf $(pwd)/cli/bin/mirofish.js /usr/local/bin/mirofish

openclaw gateway restart
```

</details>

### 开始使用

安装完成后，在 OpenClaw 聊天中用自然语言即可触发推演：

```
🧑 你：帮我预测如果比特币突破 20 万美元，市场会怎么反应

🤖 Agent：正在启动 MiroFish 推演...
         📡 SSE 实时推送：
           Step 1/7 构建知识图谱 ✅
           Step 2/7 生成 55 个 AI Agent ⏳
           ...
           Step 7/7 产出预测报告 ✅
         
         📊 推演完成！报告摘要：
         比特币突破20万美元将触发跨领域连锁反应...
         Simulation ID: sim_c6167c07bf05

🧑 你：帮我问一下 Agent #3 对这件事怎么看

🤖 Agent：[调用 mirofish_interview]
         Agent #3（@CryptoKing_BTC，19岁科技爱好者）回应：
         「我觉得这是不可避免的趋势，机构资金的涌入...」

🧑 你：这份报告中最悲观的观点是什么？

🤖 Agent：[调用 mirofish_chat]
         根据报告分析，最悲观的观点来自 Agent #12...
```

### Agent Tools 一览

LLM 会根据 Skill 描述自动选用对应工具：

| Tool | 功能 | 典型触发语 |
|:---|:---|:---|
| `mirofish_predict` | 启动新推演 | 「预测...」「推演...」「分析...的影响」 |
| `mirofish_status` | 查询推演进度 | 「推演到哪了？」「进度如何？」 |
| `mirofish_cancel` | 取消推演 | 「取消推演」「停止模拟」 |
| `mirofish_chat` | 追问报告 | 「报告中...」「最大风险是什么？」 |
| `mirofish_interview` | 采访特定 Agent | 「问 Agent #3」「采访第 5 个 Agent」 |
| `mirofish_report` | 获取完整报告 | 「给我完整报告」「报告全文」 |
| `mirofish_agents` | 列出 55 个 Agent | 「有哪些 Agent？」「Agent 列表」 |

### Gateway RPC

适合外部脚本、CI/CD、前端集成、或 cron 定时排程：

```bash
# 推演管理
openclaw gateway call mirofish.predict \
  --params '{"topic": "美联储降息影响", "rounds": 10}'
# → {"runId": "run-1710000000000"}

openclaw gateway call mirofish.status --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.cancel --params '{"runId": "run-xxx"}'
openclaw gateway call mirofish.list   --params '{}'

# 报告互动
openclaw gateway call mirofish.chat \
  --params '{"simId": "sim_xxx", "question": "最大风险是什么？"}'

openclaw gateway call mirofish.interview \
  --params '{"simId": "sim_xxx", "agentId": 3, "question": "你怎么看？"}'

# Agent 与报告
openclaw gateway call mirofish.report  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.agents  --params '{"simId": "sim_xxx"}'
openclaw gateway call mirofish.posts   --params '{"simId": "sim_xxx"}'
```

### Discord 通知

推演完成后自动推送到 Discord 频道：

```bash
# 在 ~/.mirofish/.env 设置
MIROFISH_DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx/yyy
```

### Extension 架构

| 集成点 | 文件 | 功能 |
|:---|:---|:---|
| Agent Tools | `src/tools.ts` | 7 个 LLM 可调用的工具 |
| Message Hook | `src/hooks.ts` | 聊天关键字自动触发推演（默认关闭） |
| Gateway RPC | `src/gateway.ts` | 10 个 RPC 方法供外部系统集成 |
| SSE Broadcaster | `src/progress-broadcaster.ts` | 推演进度实时推送 |
| Canvas Route | `src/canvas-route.ts` | `GET /mirofish/canvas` 报告可视化 |
| P2P Peer Discovery | `src/peer-discovery.ts` | 自动 Peer 发现 |

---

## 进阶用法

### CLI 命令行

不使用 OpenClaw 也可以直接用 CLI 完成所有操作：

```bash
# ─── 推演 ───
mirofish predict "美联储降息对科技股的影响"                  # 基本推演（默认 20 轮）
mirofish predict "主题" --rounds=3                          # 指定轮数
mirofish predict "主题" --canvas                            # 推演后打开 Dashboard
mirofish predict "主题" --json-stream                       # NDJSON 串流输出
mirofish predict "主题" --distributed --workers=3           # 分布式（Docker Worker）
mirofish predict "主题" --p2p                               # P2P 多节点推演

# ─── 报告互动 ───
mirofish chat sim_xxx "哪些观点最极端？"                     # 追问 Report Agent
mirofish interview sim_xxx 0 "你怎么看？"                    # 采访 Agent #0
mirofish report sim_xxx                                     # 获取完整报告
mirofish canvas sim_xxx                                     # 可视化 Dashboard

# ─── 后端管理 ───
mirofish serve start                                        # 启动后端（Docker 优先）
mirofish serve stop                                         # 停止后端
mirofish serve status                                       # 查看后端状态

# ─── P2P 节点管理 ───
mirofish peers add http://192.168.1.100:5001 "lab"          # 新增 peer
mirofish peers remove lab                                   # 移除 peer
mirofish peers list                                         # 列出所有 peers
mirofish peers health                                       # 检查所有 peer 健康
mirofish meta "主题"                                        # 合并 P2P 共识报告

# ─── 其他 ───
mirofish projects                                           # 列出所有项目
mirofish status sim_xxx                                     # 查询模拟进度
mirofish env                                                # 显示环境设置
```

### 运作模式

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
```

### P2P 多节点部署

#### Docker 一键启动 3 节点

```bash
docker compose -f docker-compose.p2p-3nodes.yml build
docker compose -f docker-compose.p2p-3nodes.yml up -d

# 健康检查
curl http://localhost:5011/health   # Node1
curl http://localhost:5012/health   # Node2
curl http://localhost:5013/health   # Node3

# 从 Node1 发起 P2P 推演
docker exec mirofish-p2p-node1 node /app/cli/bin/mirofish.js \
  predict "如果比特币突破20万" --p2p --rounds=3

docker compose -f docker-compose.p2p-3nodes.yml down
```

#### 手动模式（跨 LAN 多机）

```bash
mirofish peers add http://192.168.1.200:5001 "lab-server"
mirofish peers add http://192.168.1.201:5001 "gpu-box"
mirofish peers health
mirofish predict "主题" --p2p
mirofish meta "主题"
```

> 在 peer 机器上设置 `P2P_AUTO_PREDICT=true`（`~/.mirofish/.env`）让收到种子后自动推演。

### OASIS 分布式（gRPC Worker 模式）

将 55 个 Agent 分散到多台机器执行：

```bash
# Docker Compose
cd oasis-distributed && docker compose -f docker-compose.distributed.yml up

# 原生模式
python3 scripts/run_coordinator.py   # 终端 1
python3 scripts/run_worker.py        # 终端 2
```

---

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
├── extensions/mirofish/        # ⭐ OpenClaw Extension (TypeScript)
│   ├── index.ts                # 插件入口 — 6 个集成点
│   └── src/                    # RunManager, tools, hooks, gateway, SSE, chat
├── skills/mirofish-predict/    # ⭐ OpenClaw Skill 定义 (SKILL.md)
├── cli/                        # mirofish-cli (Node.js, zero runtime deps)
│   ├── bin/mirofish.js         # CLI 入口（12 个子命令）
│   ├── lib/                    # 核心模块：predict, docker, api, p2p, notify, canvas
│   ├── canvas/                 # Canvas Dashboard（HTML + JS + CSS）
│   └── test/                   # 单元测试 + E2E (e2e-p2p.sh)
├── core/                       # 共用类型与常量 (@mirofish/core)
├── oasis-distributed/          # 分布式 Agent 执行层 (gRPC, Docker)
├── MiroFish/                   # 核心引擎 — 需手动 clone (Python Flask + Vue 3)
├── Dockerfile.p2p-node         # P2P Docker 节点镜像
├── docker-compose.p2p-3nodes.yml  # 3 节点 P2P Docker 集群
├── docs/                       # 愿景、阶段计划、分布式设计文档
└── docker-compose.p2p.yml      # 多节点 P2P Docker 配置
```

## 路线图

| 阶段 | 目标 | 状态 |
|:---|:---|:---|
| Phase 1 | Gateway 整合 MiroFish API，对话触发推演 | ✅ 完成 |
| Phase 2 | Canvas + 推送 + SSE 实时进度 + Report Chat | ✅ 完成 |
| Phase 3 | P2P 种子/结果广播 + 共识报告 | ✅ 完成 |
| Phase 4 | P2P Docker 3 节点集群验证 + Auto-Predict | ✅ 完成 |
| Phase 5 | 分布式模拟：跨节点 Agent 分配（gRPC） | 🚧 设计中 |
| Phase 6 | Cosmos SDK AppChain：存证 + 信誉 MVP | 📋 规划中 |
| Phase 7 | 事后验证 + 排行榜 + 订阅经济 | 📋 规划中 |

## License

[AGPL-3.0](LICENSE)
