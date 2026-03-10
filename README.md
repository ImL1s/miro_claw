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
├── MiroFish/             # 獨立 clone (被 .gitignore 排除)
└── .env                  # 環境變數
```

## 測試注意事項

### 環境需求

| 項目 | 說明 |
|:---|:---|
| LLM 服務 | LM Studio / Ollama / 任何 OpenAI 格式 API |
| ZEP Cloud | 免費 tier，key 會過期需更新 |
| Docker | AMD64 only（Apple Silicon 自動 fallback native） |
| Native 模式 | 需 `uv` + Python 3.11 + MiroFish source |

### LM Studio 注意事項

- **IP 地址**：LM Studio "Serve on local network" 顯示的 IP 可能是虛擬網卡（`10.5.0.x` = Hyper-V）。用 `ipconfig` 找真正的 LAN IP（`192.168.1.x`）
- **`response_format`**：LM Studio 不支援 `json_object` 格式，已在 `llm_client.py` 移除

### 已知問題

1. **Docker pull 延遲** — 每次 `serve start` 會嘗試 pull image（ARM64 會失敗後 fallback），增加 ~4 秒
2. **短 seed text** — `predict` 自動擴展 <200 字元的輸入為 ~1100 字元結構化文檔（確保 ZEP 能提取足夠實體）
3. **Report 非同步** — `predict` 結束時 report 可能還是 `pending`，Report Agent 在後台生成

### Troubleshooting

```bash
# 確認 LLM 可達
curl http://YOUR_LLM_IP:1234/v1/models

# 確認 backend 健康
curl http://localhost:5001/health

# 查看 native 模式 PID
cat ~/.mirofish/backend.pid

# 強制清理
pkill -f "uv run python run.py"
rm -f ~/.mirofish/backend.pid
```

## License

MIT
