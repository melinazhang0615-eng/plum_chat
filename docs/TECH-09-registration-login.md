# Plum 新用户注册登录技术设计

状态：已冻结，进入实施

版本：V1.0

日期：2026-08-12

关联 PRD：[PRD-02 Plum 新用户注册登录](./PRD-02-registration-login.md)

## 0. 实现状态（截至 2026-08-13）

本文正文是**已冻结的设计契约，保持原样**；下表说明各部分与当前代码的对应关系。契约描述了
目标形态，未实现项属于「尚未交付」而非「设计有误」。

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Guest Session / Profile / 服务端额度 | 已实现 | 额度默认 打字 2、Continue 全局 8 / 单角色 2 |
| Guest 免费模型与回复限长 | 已实现 | 服务端强制 `guest_free` |
| Email OTP 登录与原地晋升 | 已实现 | SMTP adapter 已接通并本地验证 |
| 返回用户 Email 合并 | 已实现 | 事务性合并游客全部会话与 Profile |
| Google OAuth（Authorization Code + PKCE） | 已实现 | 本地已验证授权跳转与回跳 |
| 首登 1000 金币幂等发放 | 已实现 | |
| §6.5 邀请码账号绑定正式身份 | **未实现** | `POST /auth/identities/email/*`、`GET /auth/identities/google/start` 尚未落地；§14 交付项 6 未开始。邀请码账号目前只能继续用邀请码登录 |
| Apple 登录 | **未实现** | 仅保留 capability 位 `apple_auth`（恒为 false）与前端 UI 位置，没有 Apple adapter 或路由。§6.4 末尾「Apple 使用相同接口形状」描述的是目标形态；当前 start 路径返回 404 是因为路由不存在。待原生 App 上架计划与 Apple 配置就绪后再实现并验证 |

## 1. 设计目标

在保留现有 Plum `SessionPrincipal`、Membership、Runtime、钱包、Conversation 和 SSE 能力的基础上，引入受限 Guest 身份及 Email/Google 正式身份，实现：

1. 服务端权威 Guest Session、Profile、额度和免费模型；
2. 新身份将 Guest 原地晋升为 Member；
3. 已有身份将 Guest 资源事务性合并到 Member；
4. 所有正式登录出口复用现有 provider-neutral `create_plum_login_session`/产品 provisioning 语义；
5. 邀请码账号可以绑定正式身份；
6. 前端只有一套服务端驱动的 Auth Context，不存在 mock 登录态。

## 2. 当前系统与约束

### 2.1 已有能力

- `platform_users`：跨产品真人主体，当前 `phone NOT NULL UNIQUE`。
- `product_memberships(app_id='plum')`：Plum 产品资格。
- `platform_user_sessions`：带 `app_id` audience 的正式会话。
- `create_plum_login_session(verified_platform_user_id)`：幂等准备 Membership、产品入口 Runtime、钱包和 session。
- Plum 使用 HttpOnly `plum_session`、可读 `plum_csrf` 和 `X-Plum-CSRF`。
- Conversation、Connection、Persona、Runtime ownership 和钱包都以 `platform_user_id` 隔离。
- 流式聊天已经具备 `client_message_id` 幂等、固定价格预占/结算和取消语义。

### 2.2 关键约束

- 多个 Plum 表要求 `platform_user_id NOT NULL`，为 Guest 另建一整套 Conversation/Runtime 表会造成长期双轨。
- Guest 不能拥有 active Membership，也不能被 Member-only API 当作正式用户。
- Guest 免费 turn 不能领取或消耗正式 1000 金币奖励。
- owner 转移涉及 Conversation、Connection、Persona、Runtime ownership、消息、互动和行为数据，必须单事务完成。
- `plum_chat` 与 `weixin_bot` 为两个仓库，接口变更需 capability 兼容发布，不能依赖原子部署。

## 3. 总体架构

```text
Browser
  │ same-origin cookies + CSRF
  ▼
Next.js /api/v1/products/plum/* rewrite
  ▼
Plum API
  ├─ Actor resolver
  │    ├─ MemberPrincipal <- plum_session
  │    └─ GuestPrincipal  <- plum_guest_session
  ├─ Guest application service
  │    ├─ profile / quota / behavior
  │    └─ guest-free conversation + turn policy
  ├─ Shared identity adapters
  │    ├─ Email OTP
  │    ├─ Google OIDC
  │    └─ Apple OIDC (disabled V1)
  └─ Identity completion service
       ├─ promote provisional user
       ├─ merge into existing member
       ├─ ensure Plum provisioning/reward
       └─ issue member session + revoke guest session
```

### 3.1 Actor 类型

```python
PlumActorPrincipal = MemberPrincipal | GuestPrincipal

GuestPrincipal(
    guest_session_id: str,
    platform_user_id: str,
    app_id: Literal["plum"],
    expires_at: str,
)
```

路由必须显式选择 guard：

- `require_plum_member`：钱包、收藏、点赞、创作、账户设置、模型切换等。
- `require_plum_actor`：Profile、允许的 Conversation read/create、Guest turn。
- `optional_plum_actor`：`/auth/context`、公开 Feed 的个性化补充。

不能把 Guest 塞进当前 `SessionPrincipal` 并伪造 active Membership，否则所有 Member-only API 都可能被意外开放。

## 4. 数据模型

以下名称为目标 schema；迁移需使用全局下一个 migration 版本，并同时支持 PostgreSQL 测试与生产。

### 4.1 `platform_users` 扩展

```sql
ALTER TABLE platform_users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE platform_users ADD COLUMN subject_kind TEXT NOT NULL DEFAULT 'member';
ALTER TABLE platform_users ADD COLUMN merged_into_platform_user_id TEXT;
ALTER TABLE platform_users ADD COLUMN merged_at TEXT;

CHECK (subject_kind IN ('guest', 'member', 'merged'));
CHECK ((subject_kind = 'merged') = (merged_into_platform_user_id IS NOT NULL));
```

规则：

- `guest` 是可晋升 provisional subject，不是 active Plum Member。
- `member` 是正式权利主体；可拥有多个 provider identity。
- `merged` 仅保留审计与旧 ID 追踪，不得再签发 session。
- 现有数据全部回填 `member`，现有 phone 语义不变。
- 所有仍假定 phone 非空的共享代码必须聚焦审查；展示和日志不得把 phone 当作永久主键。

### 4.2 `platform_external_identities`

```sql
id                          TEXT PRIMARY KEY
platform_user_id            TEXT NOT NULL REFERENCES platform_users(id)
provider                    TEXT NOT NULL
provider_subject            TEXT NOT NULL
normalized_email            TEXT
email_verified              BIGINT NOT NULL DEFAULT 0
profile_json                TEXT NOT NULL DEFAULT '{}'
status                      TEXT NOT NULL DEFAULT 'active'
created_at / updated_at     TEXT NOT NULL
last_authenticated_at       TEXT

UNIQUE(provider, provider_subject)
INDEX(platform_user_id, status)
INDEX(normalized_email, status)
```

`provider_subject`：Email 使用规范化邮箱；Google/Apple 使用经过 issuer 校验的 `sub`，不能使用可变邮箱作 OAuth 主键。

### 4.3 `plum_guest_sessions`

```sql
id                          TEXT PRIMARY KEY
token_hash                  TEXT NOT NULL UNIQUE
platform_user_id            TEXT NOT NULL UNIQUE REFERENCES platform_users(id)
csrf_hash                   TEXT NOT NULL
status                      TEXT NOT NULL
expires_at                  TEXT NOT NULL
last_seen_at                TEXT NOT NULL
created_ip_hash             TEXT
user_agent_hash             TEXT
promoted_at / revoked_at    TEXT
created_at / updated_at     TEXT NOT NULL
```

- 数据库只存 session token SHA-256；明文只进入 HttpOnly Cookie。
- Guest Cookie：`plum_guest_session`，HttpOnly、SameSite=Strict、Path=/、生产 Secure。
- CSRF 继续使用 `plum_csrf`；创建/登录完成时轮换。
- 默认 Guest TTL 为 30 天，可滑动延长但不超过隐私保留策略。

### 4.4 `plum_guest_profiles`

```sql
platform_user_id            TEXT PRIMARY KEY REFERENCES platform_users(id)
adult_confirmed_at          TEXT NOT NULL
pronouns                    TEXT NOT NULL
relationship_preference     TEXT
genres_json                 TEXT NOT NULL DEFAULT '[]'
created_at / updated_at     TEXT NOT NULL
```

Member 正式 Profile 继续以 `plum_user_personas`/产品 Profile 为事实来源。晋升时将 Guest Profile 转为或补齐默认 Persona；合并到已有 Member 时只填空字段。

### 4.5 `plum_guest_usage`

```sql
platform_user_id            TEXT PRIMARY KEY REFERENCES platform_users(id)
typed_accepted              BIGINT NOT NULL DEFAULT 0
continue_accepted           BIGINT NOT NULL DEFAULT 0
updated_at                  TEXT NOT NULL
```

### 4.6 `plum_guest_character_usage`

```sql
platform_user_id            TEXT NOT NULL REFERENCES platform_users(id)
character_id                TEXT NOT NULL REFERENCES plum_characters(id)
continue_accepted           BIGINT NOT NULL DEFAULT 0
updated_at                  TEXT NOT NULL
PRIMARY KEY(platform_user_id, character_id)
```

### 4.7 `plum_guest_action_receipts`

```sql
platform_user_id            TEXT NOT NULL REFERENCES platform_users(id)
client_action_id            TEXT NOT NULL
action_kind                 TEXT NOT NULL
conversation_id             TEXT
status                      TEXT NOT NULL
response_json               TEXT
created_at / updated_at     TEXT NOT NULL
PRIMARY KEY(platform_user_id, client_action_id)
```

用于 Guest quota + turn 接受的幂等边界。已有 `runtime_turn_runs` 继续负责模型 turn 幂等；receipt 负责在进入 Runtime 之前确保额度只扣一次。

### 4.8 `plum_identity_challenges`

```sql
id                          TEXT PRIMARY KEY
kind                        TEXT NOT NULL       -- email_otp / oauth_state
provider                    TEXT NOT NULL
target_hash                 TEXT
secret_hash                 TEXT
guest_platform_user_id      TEXT
attempt_count               BIGINT NOT NULL DEFAULT 0
max_attempts                BIGINT NOT NULL
status                      TEXT NOT NULL
expires_at                  TEXT NOT NULL
consumed_at                 TEXT
metadata_json               TEXT NOT NULL DEFAULT '{}'
created_at / updated_at     TEXT NOT NULL
```

验证码、state、nonce 和 PKCE verifier 均不明文持久化或记录日志。

### 4.9 `plum_identity_merge_runs`

```sql
id                          TEXT PRIMARY KEY
guest_platform_user_id      TEXT NOT NULL UNIQUE
target_platform_user_id     TEXT NOT NULL
identity_id                 TEXT NOT NULL
status                      TEXT NOT NULL
result_json                 TEXT
created_at / updated_at     TEXT NOT NULL
completed_at                TEXT
```

提供并发回调幂等、审计和故障定位；资源移动仍在一个数据库事务中完成。

## 5. Provisioning 与钱包

### 5.1 创建 Guest

`ensure_plum_guest()` 在事务中：

1. 创建 `platform_users(subject_kind='guest', phone=NULL)`；
2. 创建 Guest Session；
3. 创建 Guest 默认 Persona；
4. 创建 `guest_entry` Runtime ownership/account；
5. 创建零余额钱包，但不写新用户奖励 ledger；
6. 不创建 `product_memberships`。

Guest Conversation 复用正式 Connection、Storyline、Runtime Session 和消息表，owner 从创建起稳定。

### 5.2 免费模型

- 增加内部 profile `guest_free`，价格为 0，映射到配置指定的小模型并限制最大输出。
- `guest_free` 不在 Member 模型选择列表显示；Guest 所有 create/send 请求由服务端强制该 profile。
- Guest turn 的 cost event 标记为平台获客成本，不记用户账单。
- 客户端提交其他 profile 时返回 `403 guest_model_restricted`。
- 晋升/合并后，将 Guest active conversation 切换到 Member 默认模型；历史消息不变。

### 5.3 新会员奖励

沿用 Membership 首次创建作为“新用户”口径，ledger 使用稳定键：

```text
plum:new-member-grant:<platform_user_id>:v1
```

前端只展示响应中的 `grant.amount` 和 `grant.was_applied`，不调用独立“领取金币”接口。

## 6. HTTP API

所有接口位于 `/api/v1/products/plum`。

### 6.1 Auth Context

`GET /auth/context`

```json
{
  "status": "ok",
  "actor": {
    "kind": "visitor|guest|member",
    "user": {"id": "...", "display_name": "..."},
    "profile_complete": true
  },
  "capabilities": {
    "chat_streaming": true,
    "guest_chat": true,
    "email_auth": true,
    "google_auth": true,
    "apple_auth": false,
    "invite_auth": true
  },
  "guest_quota": {
    "typed_remaining": 2,
    "continue_remaining": 8
  },
  "wallet": null,
  "session_expires_at": "..."
}
```

Visitor 返回 200，不用 401。Feed 可与 Auth Context 并行加载。

### 6.2 Guest Session/Profile

`POST /auth/guest/session`

- 无已有 actor：创建 Guest，设置 Cookie，返回 Context。
- 已有 Guest：幂等恢复并刷新 last_seen。
- 已有 Member：不降级，直接返回 Member Context。
- 防护：严格 Origin/Fetch Metadata、IP/设备速率限制；这是唯一无需既有 CSRF 的写入口。

`PATCH /auth/guest/profile`

```json
{
  "adult_confirmed": true,
  "pronouns": "they_them",
  "relationship_preference": "no_preference"
}
```

要求 Guest + CSRF。`adult_confirmed=false` 不持久化为聊天资格并返回 `403 adult_confirmation_required`。

### 6.3 Email OTP

`POST /auth/email/challenges`

```json
{"email": "user@example.com"}
```

统一返回 `202 {"status":"accepted","challenge_id":"pich_...","retry_after_seconds":60}`，不暴露账号是否存在。`challenge_id` 是后续 verify 的必需入参；`retry_after_seconds` 供前端做重发倒计时。限制：单 IP、单邮箱、单 Guest、全局 provider 限流。

`POST /auth/email/verify`

```json
{
  "challenge_id": "pich_...",
  "code": "123456",
  "preferred_name": "Alex"
}
```

成功返回：

```json
{
  "status": "ok",
  "actor": {"kind":"member", "user":{"id":"...","display_name":"Alex"}},
  "is_new_membership": true,
  "merge": {"mode":"promoted", "conversations_moved":0},
  "grant": {"amount":1000, "was_applied":true},
  "wallet": {"balance":1000, "unit":"金币"}
}
```

### 6.4 Google OAuth

`GET /auth/oauth/google/start?return_to=<allowlisted-relative-path>`

- 生成 state、nonce、PKCE challenge；challenge 绑定 Guest 和浏览器。
- `return_to` 只允许站内相对路径，不允许 open redirect。
- 307 到 Google Authorization Endpoint（callback 回跳用 303）。

`GET /auth/oauth/google/callback?code=...&state=...`

- 原子消费 state，验证 issuer、audience、nonce、PKCE 和签名。
- 使用 provider `sub` 解析 external identity。
- 完成 promotion/merge，设置 Member/CSRF Cookie，清 Guest Cookie。
- 303 回 allowlisted `return_to`，只携带不敏感结果码。

Apple 使用相同接口形状，V1 capability 为 false 时 start 返回 404。

### 6.5 邀请码绑定

现有 `POST /auth/access-code` 迁移期保留。新增 Member-only：

`POST /auth/identities/email/*`、`GET /auth/identities/google/start`

绑定接口与登录使用相同验证器，但必须校验当前 Member + CSRF；目标 identity 已属于其他 Member 时返回 `409 identity_link_conflict`。

### 6.6 Conversation/Turn

`POST /conversations` 改为接受 `PlumActorPrincipal`：

- Guest 必须 Profile complete、18+，服务端强制 `guest_free`。
- Member 沿用现有行为。

同步与流式 turn 请求增加兼容字段：

```json
{
  "client_message_id": "uuid",
  "action": {"kind":"message", "text":"hello"}
}
```

或：

```json
{
  "client_message_id": "uuid",
  "action": {"kind":"continue"}
}
```

过渡期保留旧 `text` 请求给 Member；Guest 必须使用 `action`。`continue` 由服务端注入非持久化系统指令：

- 不创建 user message；
- Runtime 只保存 assistant reply；
- 当前角色第二次 Continue 时附加“推进剧情并自然提出可回答问题”的指令；
- 不向客户端返回内部 prompt。

额度不足统一在模型调用前返回：

```http
HTTP 403
{"detail":"guest_sign_in_required","reason":"typed_limit|character_continue_limit|global_continue_limit"}
```

响应和 SSE `turn.accepted` 均返回最新 `guest_quota`，前端不自行加减计数。

## 7. 身份解析与账号合并

### 7.1 外部身份解析规则

1. 始终先按 `(provider, provider_subject)` 查找，存在则得到 Returning Member。
2. Email OTP 的 subject 是规范化邮箱，可直接恢复该 identity。
3. Google 首次登录只有在 `email_verified=true` 且系统中存在唯一、active 的同邮箱 Email identity 时才自动链接；多候选或状态异常返回 conflict。
4. 不以 Apple relay email 或未验证邮箱自动合并。
5. 外部 identity 绑定、challenge 消费和 promotion/merge 必须在同一事务边界或以幂等 merge run 串联，不能先绑定后失败。

### 7.2 新身份：原地晋升

锁定 Guest user/session/challenge 后：

1. 确认 Guest 未 promoted/merged，challenge 未消费。
2. 将 `platform_users.subject_kind` 更新为 `member`，补齐 display name。
3. 插入 external identity。
4. 创建 active Plum Membership。
5. 将 `guest_entry` ownership 改为 `product_entry`；保留 Runtime account/session/message ID。
6. 将 Guest Profile 投影到默认 Persona/Profile。
7. conversation model 从 `guest_free` 切到 Member 默认模型。
8. 幂等发放 1000 金币。
9. 标记 Guest Session promoted/revoked，创建 Member Session。
10. 提交后设置 Cookie；Cookie 写入前数据库已经是完整可恢复状态。

### 7.3 已有身份：事务性合并

按 user ID 固定顺序锁 Guest 和 Member，创建或读取 merge run：

1. 校验 target User/Membership active；disabled 状态 fail closed。
2. Profile：Member 非空字段优先，Guest 仅补空；Guest Persona 保留为 imported Persona。
3. 同角色 active 冲突：先归档 Member 旧 active conversation；Guest conversation 保持 active。
4. 更新 Guest Conversation、Connection、Storyline、Persona、互动、行为事件的 owner 到 Member。
5. 更新 Guest Runtime ownership 为 Member，source 改为 `guest_import`，保留 account/session/messages。
6. 去重 likes/favorites 等唯一关系；冲突时保留 Member 状态和最早创建时间。
7. Guest 零余额钱包关闭，不转移新用户奖励；Member 钱包不变。
8. Guest user 标记 `merged` 和 `merged_into_platform_user_id`。
9. 撤销 Guest Session，创建新的 Member Session。
10. merge run 标记 completed 并记录移动数量。

需要为每张带 owner 的 Plum/共享表建立显式 merge adapter 和测试清单；禁止使用遍历 schema 的动态 SQL 猜测 owner。

### 7.4 失败与重放

- 任一资源迁移失败，整个事务回滚，Guest 仍可使用。
- 同一 challenge/callback 重放读取 completed merge run，返回同一 Member，不重复发奖励或移动资源。
- 两个 callback 并发只允许一个消费 challenge；另一个返回已完成结果或 `identity_verification_invalid`。

## 8. 前端设计

### 8.1 单一 Auth Context

新增 `AuthProvider` 或等价 hook，启动时调用 `/auth/context`：

```ts
type AuthContext =
  | { kind: "loading" }
  | { kind: "visitor"; capabilities: Capabilities }
  | { kind: "guest"; profile: GuestProfile; quota: GuestQuota; capabilities: Capabilities }
  | { kind: "member"; user: AuthUser; wallet: Wallet; capabilities: Capabilities };
```

- 删除任何 `mockAuthed`、`plum_mock_auth` 和 localStorage quota。
- `sessionStorage` 仅可保存非权威 UI 草稿和待续接 action；不能保存身份或额度。
- Member/Guest 跨标签一致性通过 Cookie + 页面重新取 context；可使用 `BroadcastChannel` 触发刷新，但消息不作为事实来源。

### 8.2 路由流程

```text
点击角色
  member -> create/restore conversation
  guest + profile complete -> create/restore conversation
  visitor -> Welcome -> create Guest -> save profile -> conversation

发送 action
  accepted -> render SSE
  guest_sign_in_required -> save pending action -> SignIn Gate
  login complete -> refresh context -> replay pending action once
```

OAuth 返回后用短期 `sessionStorage` 恢复 pending action；若草稿丢失，只恢复聊天页并提示用户重新发送，不能从 OAuth state 还原消息正文。

### 8.3 原型移植策略

从 PR #13 手工移植：

- `WelcomeModal` 视觉结构；
- `SignInCard`、奖励结果卡；
- 登录墙、模糊 teaser 和 Continue 控件样式。

不 cherry-pick：

- `lib/guest.ts`；
- 页面级 mock 登录态；
- localStorage quota/reward；
- 作为文本发送的 `CONTINUE_PROMPT`；
- 与注册登录无关的全页翻译改动。

## 9. 安全设计

### 9.1 Cookie 与 CSRF

- Member Cookie 和 Guest Cookie 都是 opaque random token，数据库仅存哈希。
- Member 优先：同时存在两个有效 Cookie 时，以 Member 为 actor，并异步/显式撤销同浏览器 Guest。
- 登录成功轮换 CSRF，避免 session fixation。
- `POST /auth/guest/session` 使用 Origin、Host、Sec-Fetch-Site 和限流保护；后续 mutation 全部 double-submit CSRF。

### 9.2 OTP

- 6 位随机码，10 分钟过期，最多 5 次尝试，成功后单次消费。
- 发送间隔 60 秒；IP、邮箱、Guest 和全局多层限流。
- 数据库保存 HMAC/慢哈希，不保存明文；比较使用 constant-time。
- 响应和日志不区分“邮箱存在/不存在”。

### 9.3 OAuth

- Authorization Code + PKCE；校验 state、nonce、issuer、audience、签名和 token 时间。
- OAuth client secret 只在后端环境；前端不接触 refresh/access token。
- callback/return_to 固定 allowlist；禁止从请求动态拼任意域名。
- provider profile 只保存白名单字段；原始 token 不落库。

### 9.4 滥用与成本

- Guest quota 是账号级硬上限；另加 IP/device velocity，防止清 Cookie 批量建 Guest。
- `guest_free` 有独立 RPM、并发、输入/输出长度和每日总成本熔断。
- feature flag 可关闭新 Guest 创建或 Guest turn，不影响已有 Member。

## 10. 错误合同

| HTTP | detail | 客户端行为 |
| --- | --- | --- |
| 400 | `identity_verification_invalid` | 保留 Guest，允许重试 |
| 400 | `return_to_invalid` | 返回安全首页 |
| 401 | `authentication_required` / `session_expired` | 刷新 context |
| 403 | `adult_confirmation_required` | 打开 Welcome |
| 403 | `guest_sign_in_required` | 打开登录墙 |
| 403 | `guest_model_restricted` | 刷新模型/context |
| 403 | `csrf_validation_failed` | 刷新 context，不静默重放 mutation |
| 409 | `identity_link_conflict` | 提示账号恢复/人工处理 |
| 429 | `too_many_auth_attempts` | 展示 retry-after |
| 503 | `identity_provider_unavailable` | 保留 Guest，切换 Email/稍后重试 |
| 503 | `plum_user_provisioning_failed` | 不视为登录成功，保留 Guest |

## 11. 测试策略

### 11.1 后端聚焦测试

- migration：现有 member 回填、phone nullable、约束和 rollback；
- Guest session：幂等、TTL、token hash、Cookie、Origin、CSRF；
- Profile：18+、枚举、owner 隔离；
- quota：typed 2、global continue 8、per-character 2、多并发、幂等重放；
- Guest model：强制免费档、输出限制、会员 API 拒绝；
- Continue：无 user message、系统指令、第二段 question nudge；
- Email OTP：过期、尝试限制、单次消费、枚举保护、并发；
- Google：state/nonce/PKCE、issuer/audience、provider unavailable；
- promotion：资源 ID 保持、一次 Membership/奖励、session 轮换；
- merge：多角色、同角色冲突、Runtime/messages owner、钱包不叠加、事务回滚；
- 邀请码升级：不创建第二 user、不重复奖励；
- 跨产品 audience 与 disabled User/Membership fail closed。

### 11.2 前端测试

- Auth Context 四态及 capability；
- Visitor 浏览不弹窗、首次聊天触发 Welcome；
- Guest quota 以响应为准；
- Email/Google 成功、取消和错误恢复；
- pending typed/continue 只续接一次；
- 奖励展示使用服务端金额；
- Member 不重复 Welcome；
- 邀请码次级入口；
- desktop/mobile 可访问性和焦点管理。

### 11.3 端到端验收

至少覆盖：新 Guest → Email 新会员、Guest → Google 新会员、Guest → 已有会员合并、邀请码账号绑定 Email、换浏览器恢复、SSE 首包/完成、Cookie Secure/Strict、CSRF 拒绝、并发回调和 feature flag rollback。

## 12. 可观测性

结构化事件只记录 ID 和结果，不记录正文/验证码/token：

- `plum_guest_created`
- `plum_guest_turn_accepted|rejected`
- `plum_identity_challenge_sent|verified|failed`
- `plum_identity_promoted`
- `plum_identity_merge_completed|failed`
- `plum_new_member_grant_applied|deduplicated`

指标按 provider、结果码和阶段聚合；告警覆盖 merge failure、重复身份冲突、Guest 成本熔断和 provider 错误率。

## 13. Feature Flags 与兼容发布

后端 capability：

```text
PLUM_GUEST_CHAT_ENABLED
PLUM_EMAIL_AUTH_ENABLED
PLUM_GOOGLE_AUTH_ENABLED
PLUM_APPLE_AUTH_ENABLED
PLUM_PUBLIC_TEST_AUTH_ENABLED
```

能力位只是开关；开启后还必须提供下列配置，否则代码 fail closed（邮箱返回
`503 email_provider_unavailable` 或 `503 email_auth_not_configured`，Google 能力位保持 false）：

```text
# Email OTP
PLUM_EMAIL_OTP_PEPPER            # >=32 字符；不与其他签名密钥复用
PLUM_EMAIL_SENDER_MODE           # disabled | smtp
PLUM_EMAIL_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM
PLUM_EMAIL_SMTP_STARTTLS
PLUM_EMAIL_OTP_EXPIRES_MINUTES   # 默认 10
PLUM_EMAIL_OTP_MAX_ATTEMPTS      # 默认 5
PLUM_EMAIL_OTP_RESEND_SECONDS    # 默认 60，前端重发倒计时取此值

# Google OAuth
PLUM_GOOGLE_CLIENT_ID
PLUM_GOOGLE_CLIENT_SECRET
PLUM_GOOGLE_REDIRECT_URI         # 与 GCP 登记值逐字符一致
PLUM_OAUTH_STATE_PEPPER          # >=32 字符；缺省时回落到 OTP pepper，生产应单独配置
PLUM_OAUTH_STATE_TTL_SECONDS     # 默认 600
```

注意开启正式登录会**关闭开发固定身份**：`PLUM_EMAIL_AUTH_ENABLED` 或
`PLUM_GOOGLE_AUTH_ENABLED` 为真时，无论 `PLUM_DEV_MODE` 如何都不再注入 dev seed 身份。

发布顺序：

1. 先部署加性 migration 和关闭状态的后端能力。
2. 部署支持 visitor/guest/member 的前端；未开启 Guest 时保持现有邀请码流程。
3. 测试环境开启 Guest + Email，完成真实模型和合并验收。
4. 配置 Google redirect/secret 后开启 Google。
5. 生产内部灰度，观察成本与合并指标，再扩大流量。

回滚时先关闭新 Guest/登录入口；已晋升 Member 和已合并数据不回滚。已有 Guest 保留只读/登录升级窗口，避免突然丢失数据。

## 14. Commit 与交付计划

一个交付按以下可独立审查、可回滚 commit 组织：

1. `docs(auth): freeze registration and guest-login contracts`
2. `feat(auth): add guest principal, profile and server quotas`
3. `feat(chat): enforce guest-free turns and native continue actions`
4. `feat(auth): add external identities and email OTP`
5. `feat(auth): add Google adapter and guest promotion/merge`
6. `feat(auth): support invite-account identity binding`
7. `feat(web): add server-driven auth context and onboarding UI`
8. `feat(web): add sign-in gate and seamless pending-action resume`
9. `test(auth): add cross-stack registration and merge acceptance coverage`

受仓库边界限制，前后端各自保留同名分支和提交序列；PR 描述互相链接，并使用同一验收清单。任何生产发布必须记录两个仓库的 commit SHA。

## 15. 实施前检查项

- Email 发送 provider、发件域名、模板与测试收件策略；
- Google OAuth client、正式/测试 redirect URI；
- Guest TTL 与隐私删除周期；
- Terms、Privacy、Community Guidelines 的 18+ 和 AI 内容文本；
- `guest_free` provider/model、最大输出和成本预算；
- 生产 Feature Flag 初始值与告警阈值。

上述外部配置未提供时，代码必须保持 capability=false、测试使用 fake adapter，不能用假凭证或开发默认值在生产宣称可用。
