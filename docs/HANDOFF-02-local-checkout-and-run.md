# Plum Chat 同事本地运行交接说明

> 目标：在一台新的开发机 checkout 前后端，使用隔离 SQLite 和固定测试账号跑通 Feed、
> 模型切换、SSE 流式聊天；需要时再单独验证邀请码登录。

## 1. 环境要求与代码版本

- Git
- Node.js 20.9+ 和 npm
- Python 3.11+；本文统一使用项目自己的 `.venv`
- 能访问所配置的大模型 API

仓库：

- 前端：`git@github.com:huanshanxiaoyao/plum_chat.git`
- 后端：`git@github.com:huanshanxiaoyao/ai4all_bridge.git`

前后端均使用已合并并通过 CI 的 `main`；开始联调前记录 `git rev-parse HEAD`，便于排查
同事之间的版本差异。

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
git switch main
npm ci
```

## 3. 配置本地后端

编辑 `weixin_bot/.env`，至少确认：

```dotenv
APP_ENV=local
PLUM_ENABLED=true
PLUM_CHAT_STREAMING_ENABLED=true

AI4ALL_BRIDGE_SECRET=dev-secret
ADMIN_TOKEN=dev-admin-token

LLM_API_KEY=<team-provided-key>
LLM_OPENAI_API_KEY=<team-provided-key>
LLM_ANTHROPIC_API_KEY=<team-provided-key-if-used>
```

模型密钥应由负责人通过安全渠道提供，不要发在群聊、写进文档或提交到 Git。若只想调 UI，可以暂时把三个模型密钥留空，后端会在 local 环境使用 mock 回复；要验证真实回复和模型选择，必须配置对应密钥。

`make plum-local-*` 会在进程级覆盖数据库和 dev 身份配置，因此即使 `.env` 中为其他后端
业务配置了 `DATABASE_URL`，Plum 本地联调也不会误连该 PostgreSQL。

## 4. 初始化并启动本地后端

使用统一 Make 命令创建独立 SQLite、固定测试账号、演示角色和 1000 初始金币：

```bash
cd ~/workspace/ai4all/weixin_bot
make plum-local-start
```

该命令会先幂等补齐本地测试数据，再启动后端；不会重置已消费的金币或已有聊天记录。
需要拆分排障时，仍可分别执行 `make plum-local-init` 和 `make plum-local-run`。

后端终端保持运行，另开终端验证：

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

打开 `http://127.0.0.1:3000`。固定测试账号会直接登录；开发环境默认把
`/api/v1/products/plum/*` rewrite 到 `http://127.0.0.1:8180`，通常不需要额外前端环境变量。

### 可选：验证邀请码路线 B

邀请码模式使用另一份 SQLite，不与固定测试账号环境混用：

```bash
cd ~/workspace/ai4all/weixin_bot
DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/python scripts/create_plum_access_invite.py --label "local-tester"

PLUM_DEV_MODE=false PLUM_CHAT_STREAMING_ENABLED=true \
  DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180 --reload
```

保存脚本输出中只出现一次的 `access_code`，再到前端登录弹层兑换。

## 6. 本地验收

- [ ] Feed 能显示两排角色卡片，桌面和移动端布局正常。
- [ ] 邀请码可登录，初始金币为 1000。
- [ ] 可以创建并恢复对话。
- [ ] 三档模型可以切换，刷新后保持选择。
- [ ] 配置真实模型密钥时可获得真实回复，并按 1/3/5 金币扣费。
- [ ] 长回复在完成前出现多次增量，Stop 后停止继续追加。
- [ ] 点赞、收藏和 Persona 修改能保存。
- [ ] 注销后回到邀请码登录状态。

## 7. 常见问题

- 页面请求返回 502：先确认后端是否监听 `127.0.0.1:8180`。
- 一直是 mock 回复：检查 `.env` 中对应 provider 的 API key、base URL 和 model 配置，然后重启后端。
- 登录成功但写请求 403：不要直接跨域调用后端；浏览器应访问 `127.0.0.1:3000`，由 Next.js 同源转发 Cookie 和 CSRF。
- 邀请码无效：确认创建邀请码和启动后端使用的是同一个 `DATABASE_PATH`。
- 启动提示 migration/reconcile blocked：不要清理已有数据库；固定账号模式换一个隔离文件，
  例如执行 `PLUM_DEV_DB=data/plum_dev_alice.sqlite3 make plum-local-start`。
- `chat_streaming=false`：检查 `.env` 或进程环境是否显式设置了
  `PLUM_CHAT_STREAMING_ENABLED=false`，并确认 bootstrap capability 返回值。
- 端口被占用：找出占用 `3000` 或 `8180` 的旧进程，或统一修改前端 rewrite 与后端端口。
- Python 依赖或语法异常：确认虚拟环境由 Python 3.11+ 创建，并重新安装 `requirements.txt`。
