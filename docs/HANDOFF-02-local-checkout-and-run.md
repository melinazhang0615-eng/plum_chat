# Plum Chat 同事本地运行交接说明

> 目标：在一台新的开发机 checkout 前后端，使用隔离的本地 PostgreSQL 跑通 Feed、
> 模型切换、SSE 流式聊天，以及游客态 + 邮箱验证码 / Google 注册登录。
>
> 与旧版本的两点区别，先看清楚再往下走：
>
> 1. **数据库是 PostgreSQL，不再是 SQLite。** `make plum-local-start` 会自行拉起本地 PG。
> 2. **固定测试账号不再自动登录。** 开启邮箱或 Google 登录后正式登录优先，落地即游客
>    身份，聊天要走真实注册流程。

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

### 注册登录所需配置

要验证邮箱验证码或 Google 登录，还需要负责人**私发**以下两组值并追加到 `.env`。缺失时后端会
fail closed：邮箱走不通返回 `503 email_provider_unavailable`，Google 的能力位保持 false。

```dotenv
# 邮箱验证码
PLUM_EMAIL_OTP_PEPPER=<>=32 字符随机值>
PLUM_EMAIL_SENDER_MODE=smtp
PLUM_EMAIL_SMTP_HOST=<smtp 主机>
PLUM_EMAIL_SMTP_PORT=587
PLUM_EMAIL_SMTP_USERNAME=<发件账号>
PLUM_EMAIL_SMTP_PASSWORD=<应用专用密码>
PLUM_EMAIL_SMTP_FROM=<与发件账号一致>
PLUM_EMAIL_SMTP_STARTTLS=true

# Google OAuth
PLUM_GOOGLE_AUTH_ENABLED=true
PLUM_GOOGLE_CLIENT_ID=<GCP client id>
PLUM_GOOGLE_CLIENT_SECRET=<GCP client secret>
PLUM_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
PLUM_OAUTH_STATE_PEPPER=<另一个 >=32 字符随机值，勿与 OTP pepper 复用>
```

两个 pepper 可各自生成：`python -c "import secrets;print(secrets.token_urlsafe(48))"`。

Google 的 OAuth client 目前处于 Testing 状态，**你的 Google 账号必须先被加入 GCP 的
Test users 名单**，否则授权页会直接拒绝；找负责人添加。详细配置见
[Google OAuth 配置](./GOOGLE-OAUTH-SETUP.md)。

`PLUM_GUEST_CHAT_ENABLED` 和 `PLUM_EMAIL_AUTH_ENABLED` 已由 `make plum-local-*` 在进程级
打开，不用写进 `.env`。

`make plum-local-*` 会在进程级覆盖数据库和 dev 身份配置，因此即使 `.env` 中为其他后端
业务配置了 `DATABASE_URL`，Plum 本地联调也不会误连该 PostgreSQL。

## 4. 初始化并启动本地后端

使用统一 Make 命令拉起隔离的本地 PostgreSQL（端口 55432 上的 `ai4all_plum_dev`），
并幂等补齐演示角色和测试数据：

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

打开 **`http://localhost:3000`**。开发环境默认把 `/api/v1/products/plum/*` rewrite 到
`http://127.0.0.1:8180`，通常不需要额外前端环境变量。

> **必须用 `localhost`，不要用 `127.0.0.1:3000`。** Google 把两者当成不同 origin，与登记的
> redirect URI 不匹配会报 `redirect_uri_mismatch`。为免来回切换，全程统一用 `localhost`。

落地时是未登录的 visitor：先在 Welcome 弹窗完成 18+ 确认和称呼选择，即可以游客身份免费
试聊（服务端限额：打字 2 次、Continue 全局 8 次 / 单角色 2 次）；额度用尽或主动点登录时
走邮箱验证码或 Google 完成注册，游客期的会话会并入新账号。

### 可选：验证邀请码路线 B（迁移期遗留）

`POST /auth/access-code` 仍然保留，正式身份稳定后会下线。下面这套流程沿用旧的 SQLite
方案、绕开 `make plum-local-*`，**未随本次 PostgreSQL 改造重新验证**；除非专门排查邀请码
问题，日常联调请走上面的邮箱 / Google 注册。

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

- [ ] Feed 能显示两排角色卡片，桌面和移动端布局正常，未登录也能浏览。
- [ ] Welcome 弹窗可完成 18+ 确认与称呼选择，之后能以游客身份开聊。
- [ ] 游客额度由服务端把关：打字 2 次后触发登录墙，Continue 全局 8 次 / 单角色 2 次。
- [ ] 邮箱验证码可收到，输入后完成注册；验证码输错时提示「验证码不正确」而非笼统报错。
- [ ] 验证码页的「重新发送」按钮带 60 秒倒计时，倒计时结束前不可点。
- [ ] Google 登录可跳转授权并成功回跳（需先在 GCP Test users 名单内）。
- [ ] 登录后游客期的会话被保留，被登录墙拦下的那条消息自动续发。
- [ ] 首次注册弹出 +1000 金币奖励，重复登录不再发放。
- [ ] 可以创建并恢复对话。
- [ ] 三档模型可以切换，刷新后保持选择。
- [ ] 配置真实模型密钥时可获得真实回复，并按 1/3/5 金币扣费。
- [ ] 长回复在完成前出现多次增量，Stop 后停止继续追加。
- [ ] 点赞、收藏和 Persona 修改能保存。
- [ ] 注销后回到未登录状态，可用同一邮箱再次登录并看到原有数据。

## 7. 常见问题

- 页面请求返回 502：先确认后端是否监听 `127.0.0.1:8180`。
- 一直是 mock 回复：检查 `.env` 中对应 provider 的 API key、base URL 和 model 配置，然后重启后端。
- 登录成功但写请求 403：不要直接跨域调用后端；浏览器应访问 `localhost:3000`，由 Next.js 同源转发 Cookie 和 CSRF。
- 收不到验证码、返回 `503 email_provider_unavailable`：`.env` 里 SMTP 那组没配全，或发件账号
  被 provider 拒绝；确认 `PLUM_EMAIL_SMTP_FROM` 与认证账号一致后重启后端。
- 返回 `503 email_auth_not_configured`：`PLUM_EMAIL_OTP_PEPPER` 缺失或短于 32 字符。
- 邮箱登录返回 `404 email_auth_disabled`：后端不是用 `make plum-local-*` 启动的，能力位没打开。
- Google 报 `redirect_uri_mismatch`：多半是用了 `127.0.0.1:3000`；换成 `localhost:3000`。
  仍然报错就核对 GCP 登记的 redirect URI 与 `PLUM_GOOGLE_REDIRECT_URI` 是否逐字符一致
  （含协议、端口、无尾斜杠）。
- Google 授权页直接拒绝：你的账号还没被加入 GCP 的 Test users 名单。
- 期待固定测试账号自动登录却是游客态：这是预期行为，正式登录开启后 dev seed 身份不再注入。
- 邀请码无效：确认创建邀请码和启动后端使用的是同一个 `DATABASE_PATH`。
- 启动提示 migration/reconcile blocked：不要清理已有数据库；需要隔离时改用另一个库名，
  例如 `PLUM_DATABASE_URL=postgresql://ai4all:ai4all-local@127.0.0.1:55432/ai4all_plum_alice make plum-local-start`。
- `chat_streaming=false`：检查 `.env` 或进程环境是否显式设置了
  `PLUM_CHAT_STREAMING_ENABLED=false`，并确认 bootstrap capability 返回值。
- 端口被占用：找出占用 `3000` 或 `8180` 的旧进程，或统一修改前端 rewrite 与后端端口。
- Python 依赖或语法异常：确认虚拟环境由 Python 3.11+ 创建，并重新安装 `requirements.txt`。
