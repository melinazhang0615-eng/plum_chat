# plum_chat

## 文档

- [MVP 产品需求文档](./docs/PRD-MVP-v0.1.md)
- [新用户注册登录 PRD](./docs/PRD-02-registration-login.md)
- [总体技术架构](./docs/TECH-01-architecture.md)
- [前端技术方案](./docs/TECH-02-frontend.md)
- [后端与 Agent 框架集成方案](./docs/TECH-03-backend-agent-integration.md)
- [角色 Profile Hover 与字段草案](./docs/TECH-04-character-profile-hover.md)
- [聊天页控件语义与实现边界](./docs/TECH-05-chat-controls.md)
- [当前 UI 数据归属与后端扩展方案](./docs/TECH-06-data-ownership-and-backend-plan.md)
- [公网多人内测身份方案（路线 B）](./docs/TECH-07-public-test-auth.md)
- [流式聊天技术方案](./docs/TECH-08-streaming-chat.md)
- [新用户注册登录技术设计](./docs/TECH-09-registration-login.md)
- [同事本地运行交接](./docs/HANDOFF-02-local-checkout-and-run.md)
- [线上升级部署简版交接](./docs/HANDOFF-04-production-upgrade-brief.md)

## 本地联调

后端统一使用独立 SQLite，避免误连 `.env` 中已有的 PostgreSQL。模型密钥仍从
`weixin_bot/.env` 读取：

```bash
cd /path/to/weixin_bot
make plum-local-start
```

`plum-local-start` 会幂等创建固定测试账号、演示角色和 1000 初始金币，再监听
`127.0.0.1:8180` 启动 SSE 流式聊天。数据库默认保存在
`data/plum_dev.sqlite3`，可用 `PLUM_DEV_DB=data/plum_dev_alice.sqlite3` 覆盖，适合多人或
多分支隔离。

真实模型模式至少需要在 `weixin_bot/.env` 配置 Plum 三档所引用的密钥：

```dotenv
LLM_API_KEY=...          # 快速、沉浸：DeepSeek
LLM_OPENAI_API_KEY=...   # 均衡：OpenAI Responses
```

只有在需要离线调试 UI 时，才显式清空密钥进入本地 mock 模式：

```bash
LLM_API_KEY= LLM_OPENAI_API_KEY= LLM_ANTHROPIC_API_KEY= make plum-local-start
```

前端：

```bash
cd /Users/suchong/workspace/ai4all/plum_chat
npm install
npm run dev
```

打开 `http://127.0.0.1:3000`。聊天默认使用 SSE 流式输出；后端关闭流式开关或返回
不支持状态时，前端会回退到同步 JSON。

### 本地验证路线 B

邀请码脚本会初始化数据库和角色目录，不需要先创建固定开发账号：

```bash
cd /Users/suchong/workspace/ai4all/weixin_bot
DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/python scripts/create_plum_access_invite.py --label "Alice"

PLUM_DEV_MODE=false PLUM_CHAT_STREAMING_ENABLED=true \
  DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180
```

复制脚本输出中的 `access_code`，打开前端后在登录弹层兑换。每执行一次脚本生成一个独立测试账号名额；同一邀请码再次兑换会恢复原账号。

### 公网部署必要配置

- 后端使用 PostgreSQL，并设置 `APP_ENV=production`、`PLUM_DEV_MODE=false`、`PLUM_PUBLIC_TEST_AUTH_ENABLED=true`、`PLUM_SESSION_COOKIE_SECURE=true`。
- 完成同步链路冒烟和 nginx SSE 配置后，将 `PLUM_CHAT_STREAMING_ENABLED=true` 并重启后端。
- 同时设置生产级 `AI4ALL_BRIDGE_SECRET` 和 `ADMIN_TOKEN`；后端会对不安全默认值 fail-fast。
- 前端执行 `npm run build` 时设置 `PLUM_API_ORIGIN=http://<backend-internal-host>:8180`。
- 浏览器只访问前端 HTTPS 域名；Next.js 通过同源 `/api/v1/products/plum/*` rewrite 代理后端，以满足 Strict Cookie 和 CSRF 约束。
- 上线后在后端运行 `scripts/create_plum_access_invite.py`，按测试人数逐个生成邀请码。明文邀请码只在创建时输出一次。

### Discord 社区入口

仓库内置当前邀请链接，拉取代码即可使用。更换邀请链接时可在前端构建环境覆盖：

```dotenv
NEXT_PUBLIC_DISCORD_INVITE_URL=https://discord.gg/your-invite-code
```

首页、聊天页和 Create 页的 Community 按钮会在新标签直接打开 Discord。
