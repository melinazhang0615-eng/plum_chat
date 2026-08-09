# Plum Chat 线上升级部署简版交接

> 用途：供线上负责人安排维护窗口、数据库升级和前后端发布。详细 nginx、systemd 与回滚配置
> 见 [HANDOFF-01-production-deployment.md](./HANDOFF-01-production-deployment.md)。

## 1. 本次上线内容

- 后端：Plum Feed、邀请码身份、会话历史、模型切换、金币扣减与 SSE 流式聊天。
- 前端：桌面/移动 Feed、角色 Profile、聊天室、流式增量与 Stop。
- 数据库：当前后端代码要求 schema migration `69`。

前后端均从 `main` 发布，并在发布记录中保存：

```bash
git rev-parse HEAD
```

## 2. 上线前必须确认

1. 准备 PostgreSQL 可恢复备份并校验备份文件存在。
2. 查询线上版本：

   ```sql
   SELECT COALESCE(MAX(version), 0) AS schema_version FROM schema_migrations;
   ```

3. 按查询结果选择路径：

   - `69`：不需要迁移，直接进入后端部署。
   - `46–68`：停掉全部 writer 后，由唯一中心节点受控迁移到 `69`。
   - `<46`：禁止直接启动新后端；按后端
     `docs/ops/platform/multi_product_phase1_release_runbook.md` 逐检查点迁移到 `46`，每个
     contract 前必须 precheck 全绿，再继续到 `69`。

4. 迁移窗口内停止所有 API、scheduler、worker 和临时写库脚本；不要混跑新旧 writer。
5. 不在线上运行 `scripts/seed_plum_dev.py`，该脚本只服务 local/development/test。

## 3. 后端先上线

生产 `.env` 至少确认以下非密钥项；密钥只保存在服务器：

```dotenv
APP_ENV=production
DATABASE_URL=postgresql://...
PLUM_ENABLED=true
PLUM_DEV_MODE=false
PLUM_PUBLIC_TEST_AUTH_ENABLED=true
PLUM_SESSION_COOKIE_SECURE=true
PLUM_CHAT_STREAMING_ENABLED=false
```

中心节点 systemd service 保留以下一次性迁移授权，禁止写入 `.env`：

```ini
Environment=AI4ALL_ALLOW_AUTO_MIGRATE=1
```

先只启动唯一中心节点，确认迁移与健康检查成功，再恢复其他节点和 writer：

```bash
sudo systemctl restart ai4all-weixin-backend
sudo systemctl status ai4all-weixin-backend --no-pager -n 80
curl -fsS http://127.0.0.1:8180/health/ready
```

若启动失败，保持 writer 停止并查看日志；不要清空 `DATABASE_URL` 回退 SQLite，不要手工修改
`schema_migrations`。

后端健康后，为每位测试者生成独立邀请码：

```bash
.venv/bin/python scripts/create_plum_access_invite.py \
  --label "tester-name" --expires-days 30
```

邀请码明文只输出一次，应通过安全渠道分别发送。

## 4. 前端与 HTTPS

构建时写入后端内网地址；只在 `next start` 时设置不会更新 rewrite：

```bash
npm ci
PLUM_API_ORIGIN=http://127.0.0.1:8180 npm run build
sudo systemctl restart plum-chat
```

浏览器只访问前端 HTTPS 域名。nginx 的 SSE 精确路径必须关闭缓冲、gzip，并把读写超时设为
至少 300 秒；配置模板见详细交接文档。

先在 `PLUM_CHAT_STREAMING_ENABLED=false` 下完成同步聊天冒烟。确认 nginx 与 Next.js 代理正常后：

1. 设置 `PLUM_CHAT_STREAMING_ENABLED=true`；
2. 重启后端；
3. 通过真实 HTTPS 域名确认完成事件前收到多个 `message.delta`；
4. 验证 Stop 能终止继续追加。

## 5. 最小验收清单

- [ ] `/health/ready` 返回 200，数据库 schema 为 69。
- [ ] 未登录用户出现邀请码登录；两个邀请码得到两个独立账号和各自 1000 金币。
- [ ] Feed 能进入聊天室，会话刷新后可恢复，不出现 405/404。
- [ ] 快速、均衡、沉浸三档模型均真实回复，并分别扣减 1/3/5 金币。
- [ ] SSE 有增量事件，Stop 有效；nginx、Next.js、后端日志无持续错误。
- [ ] 用户之间无法读取对方会话、余额、点赞或收藏。
- [ ] 桌面和移动浏览器均通过 HTTPS 验收。

## 6. 失败处理

- 前端失败：回到上一个已验证前端 commit，重新构建并重启；数据库不回滚。
- 后端失败：停止放量并看日志。migration 46 之后保持 app-aware 数据模型，优先前向修复，
  不恢复旧 writer。
- 只有确认要丢弃维护窗口内全部变更时，才整库恢复上线前备份；恢复必须与应用版本和全部节点
  一起协调。

上线结束后归档：前后端 commit SHA、迁移前后 schema、备份位置、健康检查结果、邀请码发放人和
验收结论。
