# fibre_chat

## 文档

- [MVP 产品需求文档](./docs/PRD-MVP-v0.1.md)
- [总体技术架构](./docs/TECH-01-architecture.md)
- [前端技术方案](./docs/TECH-02-frontend.md)
- [后端与 Agent 框架集成方案](./docs/TECH-03-backend-agent-integration.md)

## 本地联调

后端使用独立 SQLite。默认从 `weixin_bot/.env` 读取真实模型配置：

```bash
cd /Users/suchong/workspace/ai4all/weixin_bot
DATABASE_URL= DATABASE_PATH=data/fibre_dev.sqlite3 .venv/bin/python scripts/seed_fibre_dev.py
DATABASE_URL= DATABASE_PATH=data/fibre_dev.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180
```

真实模型模式至少需要在 `weixin_bot/.env` 配置 Fibre 三档所引用的密钥：

```dotenv
LLM_API_KEY=...          # 快速、沉浸：DeepSeek
LLM_OPENAI_API_KEY=...   # 均衡：OpenAI Responses
```

只有在需要离线调试 UI 时，才显式清空密钥进入本地 mock 模式：

```bash
DATABASE_URL= DATABASE_PATH=data/fibre_dev.sqlite3 \
  LLM_API_KEY= LLM_OPENAI_API_KEY= LLM_ANTHROPIC_API_KEY= \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180
```

前端：

```bash
cd /Users/suchong/workspace/ai4all/fibre_chat
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。首版聊天使用同步 JSON，不依赖 SSE。
