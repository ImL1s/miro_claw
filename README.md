# MiroClaw

[MiroFish](https://github.com/666ghj/MiroFish) × [OpenClaw](https://openclaw.ai) — 群體智能推演引擎 CLI + OpenClaw Skill

## 什麼是 MiroClaw？

將 MiroFish 的 55 AI Agent 群體智能推演引擎包裝成 CLI 工具 + OpenClaw skill，讓你用一句話推演未來趨勢。

```bash
mirofish predict "如果比特幣突破15萬美元，加密市場會怎樣？"
```

## 安裝

```bash
npm install -g mirofish-cli
```

### 前置需求

- **Node.js** ≥ 18
- **Docker Desktop**（推薦）或 **Python + uv**（Apple Silicon fallback）
- **LLM API key**（支援任何 OpenAI 格式端點）
- **ZEP API key**（免費：https://app.getzep.com/）

## 使用

```bash
# 首次設定
mirofish serve start
# → 自動生成 ~/.mirofish/.env 模板
# → 填入 API key 後重新 start

# 一鍵推演
mirofish predict "如果美聯儲降息200基點"

# 查看結果
mirofish report <simulation_id>

# 追問
mirofish chat <simulation_id> "哪些 KOL 最極端？"

# 採訪 Agent
mirofish interview <simulation_id> 0 "你的觀點是什麼？"
```

## OpenClaw Skill

安裝 skill 後，直接在 OpenClaw 對話中說「推演 XXX」即可觸發：

```bash
clawhub install mirofish-predict
```

## 架構

```
mirofish serve start
  ├── Docker 可用 + AMD64? → ghcr.io/666ghj/mirofish:latest
  └── Apple Silicon / 無 Docker → native 模式 (uv run)
```

## 專案結構

```
miro_claw/
├── cli/                  # mirofish-cli npm 包
│   ├── bin/mirofish.js   # CLI 入口
│   ├── lib/api.js        # HTTP client
│   ├── lib/docker.js     # Docker/Native daemon 管理
│   ├── lib/predict.js    # 高階推演流程
│   └── package.json
├── skills/               # OpenClaw skill
│   └── mirofish-predict/
│       └── SKILL.md
├── MiroFish/             # git submodule (上游 repo)
└── .env                  # 環境變數
```

## License

MIT
