# Plum Chat 线上部署交接说明

> 适用版本：后端 PR #79 已合并；前端 `codex/plum-public-test-auth`
> 目标：通过一个 HTTPS 域名访问 Plum Chat，并完成邀请码登录、真实模型聊天和金币扣减测试。

## 1. 上线前准备

- 准备 Plum Chat 域名，例如 `plum.example.com`，并将 DNS 指向部署机。
- 部署机安装 Node.js 20.9+、npm、nginx；后端机安装 Python 3.11+。
- 生产数据库必须使用 PostgreSQL；上线前先做数据库备份。
- 准备 TLS 证书、GitHub 仓库读取权限和生产模型密钥。
- 浏览器只访问前端 HTTPS 域名；后端 `8180` 端口只允许本机或内网访问。

代码版本：

- 前端：`git@github.com:huanshanxiaoyao/plum_chat.git`
- 后端：`git@github.com:huanshanxiaoyao/ai4all_bridge.git`
- 后端使用 `main`。前端部署前应先把 `codex/plum-public-test-auth` 合并到 `main`；未合并时只能明确部署该分支。

## 2. 更新并启动后端

在现有后端部署目录执行：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
.venv/bin/pip install -r requirements.txt
```

生产 `.env` 至少确认以下配置；真实值只保存在服务器，不提交 Git：

```dotenv
APP_ENV=production
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>

PLUM_ENABLED=true
PLUM_DEV_MODE=false
PLUM_PUBLIC_TEST_AUTH_ENABLED=true
PLUM_SESSION_COOKIE_NAME=plum_session
PLUM_CSRF_COOKIE_NAME=plum_csrf
PLUM_SESSION_DAYS=30
PLUM_SESSION_COOKIE_SECURE=true

AI4ALL_BRIDGE_SECRET=<strong-random-secret>
ADMIN_TOKEN=<strong-random-token>

LLM_API_KEY=<deepseek-or-compatible-key>
LLM_OPENAI_API_KEY=<openai-compatible-key>
LLM_ANTHROPIC_API_KEY=<anthropic-compatible-key-if-used>
```

中心节点的 systemd service 必须包含下面一行，且不要写进 `.env`：

```ini
Environment=AI4ALL_ALLOW_AUTO_MIGRATE=1
```

重启后端时会在 PostgreSQL advisory lock 保护下应用 migration 67，并把历史 `fibre_*` 产品数据迁移为 `plum_*`。建议在低流量时段执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart ai4all-weixin-backend
sudo systemctl status ai4all-weixin-backend --no-pager -n 50
curl -fsS http://127.0.0.1:8180/health
curl -fsS http://127.0.0.1:8180/health/ready
```

若启动失败，先查看日志，不要通过清空 `DATABASE_URL` 回退到 SQLite：

```bash
journalctl -u ai4all-weixin-backend -n 200 --no-pager
```

## 3. 构建并启动前端

以下示例把前端部署到 `/opt/plum-chat`，实际路径可调整：

```bash
cd /opt
git clone git@github.com:huanshanxiaoyao/plum_chat.git plum-chat
cd /opt/plum-chat
git switch main
npm ci
PLUM_API_ORIGIN=http://127.0.0.1:8180 npm run build
```

`PLUM_API_ORIGIN` 必须在 `npm run build` 时设置；只在运行 `next start` 时设置不会改变已生成的 rewrite。

创建 systemd service `/etc/systemd/system/plum-chat.service`。先用 `command -v npm` 确认 npm 的绝对路径；如果使用 nvm，还要在 `Environment=PATH=...` 中加入对应 Node 目录。

```ini
[Unit]
Description=Plum Chat Web
After=network-online.target ai4all-weixin-backend.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/plum-chat
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=3
User=<deploy-user>
Group=<deploy-group>

[Install]
WantedBy=multi-user.target
```

启动并验证：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now plum-chat
sudo systemctl status plum-chat --no-pager -n 50
curl -I http://127.0.0.1:3000/
```

## 4. 配置 HTTPS 入口

nginx 的核心配置如下。证书可由现有证书系统或 Certbot 管理：

```nginx
server {
    listen 443 ssl http2;
    server_name plum.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 135s;
    }
}
```

验证并 reload：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://plum.example.com/
```

不要单独把 `/api/v1/products/plum/*` 从 nginx 转发到 FastAPI；请求应先进入 Next.js，再由构建时配置的同源 rewrite 转发到后端，这样 Cookie 和 CSRF 才保持同源。

## 5. 创建内测邀请码

确认后端已完成迁移且健康后，在后端部署目录执行：

```bash
.venv/bin/python scripts/create_plum_access_invite.py \
  --label "tester-name" \
  --expires-days 30
```

输出中的 `access_code` 明文只出现一次。每位测试者生成一个邀请码，并通过安全渠道分别发送；同一码再次兑换会恢复原账号，不会重复赠送金币。

## 6. 上线验收清单

- [ ] 手机和桌面浏览器均可通过 HTTPS 打开 Feed 和聊天页。
- [ ] 未登录时出现邀请码登录弹层。
- [ ] 两个不同邀请码分别获得不同账号和 1000 初始金币。
- [ ] 三档模型可切换，刷新后选择仍保留。
- [ ] 三档模型均能返回真实回复，并分别扣减 1/3/5 金币。
- [ ] 用户 A 无法看到用户 B 的会话、消息、余额、点赞和收藏。
- [ ] 同一码换浏览器登录后恢复原账号，余额不重复赠送。
- [ ] 注销后旧会话失效。
- [ ] 后端 `/health/ready` 正常，前后端 systemd 无持续报错。

## 7. 回滚原则

- 前端故障：切回上一个已验证的前端 commit，重新以正确的 `PLUM_API_ORIGIN` 构建并重启 `plum-chat`。
- 后端故障：先停止放量并查看日志；代码可切回上一版本，但数据库已执行的 migration 67 不应靠清空 `DATABASE_URL` 或切 SQLite 回滚。
- 数据库恢复按后端现有生产 Runbook 执行，并保留上线前备份。
