# Plum Chat 公网多人内测身份方案（路线 B）

> 文档编号：TECH-07
> 状态：已实现、待部署验收
> 日期：2026-08-08

## 1. 结论

公网内测采用“一人一码 + HttpOnly Cookie Session”。它不是匿名身份：每个邀请码绑定一个稳定的平台用户，用户拥有独立的 Plum membership、入口 account、钱包、1000 初始金币、会话、消息、点赞收藏和 Persona。

首版不做手机号/SMS、邮箱密码、OAuth、找回密码和付费。相同邀请码可在新浏览器恢复同一测试账号；测试负责人应把邀请码当作临时账号凭证保管。

## 2. 请求流程

```text
创建邀请码脚本
  → 仅保存 code_hash
  → 测试者输入明文邀请码 + 称呼
  → 首次兑换：创建 platform_user / membership / account / wallet / 1000 金币
  → 签发 HttpOnly plum_session + 可读 plum_csrf
  → 后续 API 从 Cookie 解析 product-scoped principal
```

同一邀请码后续兑换不会新建用户或重复赠币，只更新最后使用时间和显示称呼。

## 3. API

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/api/v1/products/plum/auth/access-code` | 兑换邀请码，签发 Cookie |
| GET | `/api/v1/products/plum/auth/me` | 返回当前测试用户和钱包 |
| DELETE | `/api/v1/products/plum/auth/session/current` | 注销当前 session 并清 Cookie |
| GET | `/api/v1/products/plum/bootstrap` | 登录后初始化用户、钱包和模型 |

所有登录后的非 GET/HEAD/OPTIONS 请求必须同时携带 `plum_csrf` Cookie 和同值 `X-Plum-CSRF` Header。

## 4. 数据与隔离

- `plum_access_invites`：邀请码哈希、状态、有效期、绑定用户、认领与最后使用时间。
- `platform_user_sessions`：复用共享 session 技术模块，固定 `app_id=plum`。
- `product_memberships`、`accounts`、`runtime_ownerships`、wallet/ledger：复用业务无关平台能力。
- Feed、角色、互动和 Plum conversation 继续属于 Plum 产品域，不进入共享 Human-AI Runtime。
- 消息正文与模型执行继续复用共享 Runtime；每个 conversation 的 owner 必须与 session principal 一致。

数据库 migration 67 将已有 `fibre_*` 产品表、共享表中的 `app_id=fibre` 和关联列前向迁移为 Plum。迁移保留 64–66 历史，支持 SQLite/PostgreSQL、幂等执行，并在新旧同名业务表同时存在时拒绝猜测合并。

## 5. 安全基线

- 邀请码使用高熵随机值，数据库只存 SHA-256。
- session Cookie：HttpOnly、SameSite=Strict、Path=/；生产必须 Secure。
- CSRF 使用 double-submit Cookie/Header。
- 登录接口每来源 IP 每分钟最多 10 次。
- 未知、撤销、过期邀请码统一返回无效，避免泄露状态。
- 服务端固定 Plum audience，不接受客户端动态 app_id 或 user ID。
- 生产环境若 Cookie 非 Secure，Settings 启动即 fail-fast。

## 6. 本地与生产配置

本地验证路线 B：

```bash
DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/python scripts/create_plum_access_invite.py --label "tester-01"

PLUM_DEV_MODE=false DATABASE_URL= DATABASE_PATH=data/plum_public_test.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8180
```

生产最少配置：

```dotenv
APP_ENV=production
DATABASE_URL=postgresql://...
PLUM_ENABLED=true
PLUM_DEV_MODE=false
PLUM_PUBLIC_TEST_AUTH_ENABLED=true
PLUM_SESSION_COOKIE_NAME=plum_session
PLUM_CSRF_COOKIE_NAME=plum_csrf
PLUM_SESSION_DAYS=30
PLUM_SESSION_COOKIE_SECURE=true
AI4ALL_BRIDGE_SECRET=<strong-random-secret>
ADMIN_TOKEN=<strong-random-token>
```

前端必须在 `npm run build` 阶段设置 `PLUM_API_ORIGIN` 指向后端内网地址。浏览器始终请求前端同源的 `/api/v1/products/plum/*`，由 Next.js rewrite 转发；不要让浏览器直接跨域访问后端。

## 7. 验收

- 未登录访问 bootstrap 返回 401 并展示登录弹层。
- 两个邀请码创建两个不同用户，各自初始 1000 金币。
- 两个用户的 conversation、消息、余额和互动互不可见。
- 缺少或错误 CSRF 的写请求返回 403。
- 同一码在新 Cookie 会话中恢复原用户，不重复赠币。
- 注销后旧 session 不再可用。
- 三档模型切换、真实回复和固定 1/3/5 金币扣费继续生效。
