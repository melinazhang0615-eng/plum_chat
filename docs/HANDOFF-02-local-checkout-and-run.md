# Plum Chat 同事本地运行交接说明

> 目标：在一台新的开发机 checkout 前后端，并跑通邀请码登录、Feed、模型切换和真实聊天。

## 1. 环境要求与代码版本

- Git
- Node.js 20.9+ 和 npm
- Python 3.11+；本文统一使用项目自己的 `.venv`
- 能访问所配置的大模型 API

仓库：

- 前端：`git@github.com:huanshanxiaoyao/plum_chat.git`
- 后端：`git@github.com:huanshanxiaoyao/ai4all_bridge.git`

后端 PR #79 已合并，使用 `main`。前端改动目前在 `codex/plum-public-test-auth`；合并前请 checkout 该分支，合并后改用 `main`。

## 2. Checkout 和安装

```bash
mkdir -p ~/workspace/ai4all
cd ~/workspace/ai4all

git clone git@github.com:huanshanxiaoyao/ai4all_bridge.git weixin_bot
git clone git@github.com:huanshanxiaoyao/plum_chat.git plum_chat

cd ~/workspace/ai4all/weixin_bot
git switch main
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env

cd ~/workspace/ai4all/plum_chat
git switch codex/plum-public-test-auth
npm ci
```

如果前端分支已经合并，则最后一段改为 `git switch main`。

## 3. 配置本地后端

编辑 `weixin_bot/.env`，至少确认：

```dotenv
APP_ENV=local
DATABASE_URL=
PLUM_ENABLED=true
PLUM_DEV_MODE=false
PLUM_PUBLIC_TEST_AUTH_ENABLED=true
PLUM_SESSION_COOKIE_SECURE=false

AI4ALL_BRIDGE_SECRET=dev-secret
ADMIN_TOKEN=dev-admin-token

LLM_API_KEY=<team-provided-key>
LLM_OPENAI_API_KEY=<team-provided-key>
LLM_ANTHROPIC_API_KEY=<team-provided-key-if-used>
```

模型密钥应由负责人通过安全渠道提供，不要发在群聊、写进文档或提交到 Git。若只想调 UI，可以暂时把三个模型密钥留空，后端会在 local 环境使用 mock 回复；要验证真实回复和模型选择，必须配置对应密钥。

## 4. 创建本地邀请码并启动后端

使用单独的 SQLite 文件，避免影响后端仓库其他本地业务数据：

```bash
cd ~/workspace/ai4all/weixin_bot

DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/python scripts/create_plum_access_invite.py --label "local-tester"

PLUM_DEV_MODE=false DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180 --reload
```

保存脚本输出中的 `access_code`。后端终端保持运行，另开终端验证：

```bash
curl http://127.0.0.1:8180/health
curl http://127.0.0.1:8180/health/ready
```

## 5. 启动前端

另开终端：

```bash
cd ~/workspace/ai4all/plum_chat
npm run dev
```

打开 `http://127.0.0.1:3000`，输入刚生成的邀请码和测试称呼。开发环境默认把 `/api/v1/products/plum/*` rewrite 到 `http://127.0.0.1:8180`，通常不需要额外前端环境变量。

## 6. 本地验收

- [ ] Feed 能显示两排角色卡片，桌面和移动端布局正常。
- [ ] 邀请码可登录，初始金币为 1000。
- [ ] 可以创建并恢复对话。
- [ ] 三档模型可以切换，刷新后保持选择。
- [ ] 配置真实模型密钥时可获得真实回复，并按 1/3/5 金币扣费。
- [ ] 点赞、收藏和 Persona 修改能保存。
- [ ] 注销后回到邀请码登录状态。

## 7. 常见问题

- 页面请求返回 502：先确认后端是否监听 `127.0.0.1:8180`。
- 一直是 mock 回复：检查 `.env` 中对应 provider 的 API key、base URL 和 model 配置，然后重启后端。
- 登录成功但写请求 403：不要直接跨域调用后端；浏览器应访问 `127.0.0.1:3000`，由 Next.js 同源转发 Cookie 和 CSRF。
- 邀请码无效：确认创建邀请码和启动后端使用的是同一个 `DATABASE_PATH`。
- 端口被占用：找出占用 `3000` 或 `8180` 的旧进程，或统一修改前端 rewrite 与后端端口。
- Python 依赖或语法异常：确认虚拟环境由 Python 3.11+ 创建，并重新安装 `requirements.txt`。
