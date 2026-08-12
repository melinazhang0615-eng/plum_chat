# Plum 新用户注册登录 PRD

状态：已冻结，进入实施

版本：V1.0

日期：2026-08-12

适用端：Plum Web；后续原生 App 复用同一身份与账号模型

## 1. 背景

Plum 当前允许游客浏览角色 Feed，但聊天、收藏、创作和钱包能力依赖“一人一码”的 PRIVATE BETA 登录。该方案适合小规模测试，不适合正式获客：新用户在体验角色价值前就需要向测试负责人获取邀请码。

本期将入口升级为“先浏览、有限体验、在高意图点注册登录”：用户无需账号即可浏览 Discover，并可用受控免费模型体验有限聊天；达到游客额度、主动点击登录或进入会员能力时，再通过 Email 或 Google 完成正式注册。登录后保留游客阶段的 Profile、聊天与行为记录，并幂等发放新用户奖励。

此前的交互原型 PR #13 仅作为视觉和状态机参考。其中身份、额度、奖励和 OAuth 均为 `localStorage` mock，不属于可合并实现。

## 2. 产品目标

### 2.1 目标

1. 降低首次角色体验门槛，让新用户在注册前看到真实聊天价值。
2. 在服务端安全控制游客额度、模型和回复长度，避免前端计数被绕过。
3. 支持 Email OTP 和 Google 正式身份，能够恢复同一 Plum 账号。
4. 登录后无缝保留游客期全部会话，并续接触发登录墙前的操作。
5. 保持账号、会话、钱包、内容和 CSRF 安全边界，不能信任客户端提交的 owner。
6. 保留邀请码账号并允许其绑定正式身份，避免历史、金币和角色资产丢失。

### 2.2 非目标

- 本期不实现密码登录、手机号/SMS 登录或找回密码。
- Apple 登录复用本期身份模型与 UI 位置，但默认关闭；待原生 App 上架计划和 Apple 配置就绪后启用。
- 不实现充值、订阅、首充奖励或支付。
- 不实现未成年人分龄内容池；V1 仅面向自行声明已满 18 岁的用户。
- 不根据游客行为上线推荐算法；仅安全记录必要事件，供后续使用。
- 不重做角色 Feed、聊天视觉体系或角色创建流程。

## 3. 已冻结产品决策

| 议题 | V1 决策 |
| --- | --- |
| 首屏策略 | Discover 可匿名浏览，不用 Welcome 或登录墙阻塞 |
| 游客创建时机 | 用户首次打开角色聊天或主动登录时，服务端按需创建 Guest Session |
| Welcome 时机 | 首次聊天前完成；直接登录的新会员在登录后完成 |
| 年龄策略 | 仅 18+；自我声明，不收集生日，不提供未成年内容池 |
| 正式登录 | Email OTP 为基础兜底，Google 同期接入；Apple 默认关闭 |
| 用户称呼 | 使用可编辑 `preferred_name`；provider 名称仅作初始建议 |
| 游客聊天 | 免费模型、回复限长、服务端额度、真实保存会话 |
| Continue | 独立服务端动作，不伪装成用户文本，不显示隐藏消息 |
| 新用户奖励 | 1000 金币；仅首次获得 Plum Membership 时幂等发放 |
| 登录后数据 | 新账号原地晋升；已有账号事务性合并游客全部会话与 Profile |
| 同角色冲突 | 游客当前故事成为 active；原账号旧 active 故事归档并保留历史 |
| 邀请码 | 迁移期保留；邀请码账号可绑定正式身份，正式身份稳定后再下线入口 |

## 4. 用户与身份状态

### 4.1 状态定义

| 状态 | 含义 | 能力 |
| --- | --- | --- |
| Visitor | 尚无 Guest 或 Member Cookie | 浏览公开 Discover、搜索与筛选 |
| Guest | 服务端签发 Guest Session，尚未绑定正式身份 | 有限聊天、保存游客 Profile 与会话 |
| New Member | 首次获得 Plum Membership | 完整会员能力、1000 新用户金币 |
| Returning Member | 已有 Plum Membership，再次登录 | 恢复钱包、聊天、Profile 和资产 |
| Disabled | User 或 Membership 被停用 | 登录失败，不创建或恢复产品资产 |

客户端不得用 `localStorage` 自行判定身份。页面身份以服务端 `/auth/context` 为唯一事实来源。

### 4.2 Profile 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `adult_confirmed` | 是 | 用户确认已满 18 岁；拒绝时不得聊天 |
| `pronouns` | 是 | `she_her`、`he_him`、`they_them`、`other` |
| `relationship_preference` | 否 | `male`、`female`、`non_binary`、`no_preference` |
| `preferred_name` | 会员必填 | 角色称呼用户的名字，可编辑；1–40 字符 |
| `genres` | 否 | V1 不展示声明式选择器，预留给后续推荐 |

年龄确认是内容访问门禁，不是可靠的法定年龄验证。上线前需要在 Terms、Privacy 和 Community Guidelines 中写明 18+ 要求及处理规则。

## 5. 核心用户流程

### 5.1 首次浏览与游客开聊

1. Visitor 打开首页，可直接浏览、搜索和筛选角色。
2. 点击角色卡片时，如果尚无 Guest/Member 身份，打开 Welcome。
3. 用户确认 18+ 并选择 pronouns；偏好可跳过。
4. 前端创建 Guest Session 并保存 Profile。
5. 服务端创建或恢复该 Guest 与角色的会话，进入真实聊天页。
6. 游客只能使用 `guest_free` 模型，不能切换付费模型。

用户拒绝 18+ 确认时仍可返回 Discover，但不能进入聊天、打开 Limitless 或使用创作能力。

### 5.2 游客额度与登录墙

游客额度由服务端按 Guest 身份原子校验：

| 行为 | 限额 | 达到后的行为 |
| --- | --- | --- |
| Typed message | 全局成功 2 次 | 第 3 次提交前显示登录墙 |
| Continue | 全局成功 8 次 | 第 9 次请求前显示登录墙 |
| Continue | 每角色成功 2 次 | 当前角色第 3 次请求前显示登录墙 |

补充规则：

- 打开新角色不会重置全局额度，也不会绕过全局硬上限。
- 额度只在服务端接受一个新的幂等请求时消耗；重放、失败前拒绝和纯页面刷新不重复消耗。
- 第二次 Continue 的服务端指令应推动角色向用户提出可回答的问题，替代原型中与“每角色 2 次”冲突的第 4 次软催促。
- 登录墙可显示本地模糊悬念占位，但不能为了占位调用模型或消耗额度。
- 用户选择 `Not now` 时保留输入草稿，不发送被拦请求。

### 5.3 Email OTP 注册登录

1. 用户输入邮箱并请求验证码。
2. 无论邮箱是否存在，页面展示一致的成功提示，避免账号枚举。
3. 用户输入有效验证码。
4. 服务端解析或创建正式身份，并完成 Guest 晋升/合并。
5. 若用户没有 `preferred_name`，使用 provider 建议名或邮箱前缀预填，要求用户确认。
6. 登录墙关闭，自动提交之前被拦的消息或 Continue。
7. 新会员展示 1000 金币到账结果；回流用户不展示新用户奖励。

### 5.4 Google 注册登录

1. 用户点击 `Continue with Google`。
2. 浏览器通过同源后端发起 OAuth Authorization Code + PKCE 流程。
3. 回调验证成功后进入与 Email 完全相同的 Guest 晋升/合并出口。
4. 返回原页面并恢复待执行动作。

取消授权、state 失效、provider 不可用时保留游客会话和输入草稿，不得造成半注册账号或重复奖励。

### 5.5 新账号晋升

当外部身份尚未对应任何 Member：

- 当前 Guest 原地晋升为 Member，不复制会话。
- 创建 active Plum Membership。
- 将游客入口 Runtime 晋升为正式产品入口。
- 创建或激活钱包，并以稳定幂等键发放 1000 金币。
- Guest Cookie 失效，签发 HttpOnly Member Session 和新的 CSRF Cookie。
- Profile、会话、消息和行为记录保持原 owner，因此无数据断裂。

### 5.6 回流账号合并

当外部身份已经对应 Returning Member：

- 合并当前 Guest 的所有角色会话，而非只合并当前页面。
- Profile 仅补齐 Member 的空字段，不覆盖用户已经明确设置的值。
- 当前 Guest 会话成为同角色 active 会话；Member 原 active 会话归档，可在历史中恢复查看。
- 游客行为事件去重并入 Member。
- Member 钱包、奖励记录和正式入口 Runtime 保持不变；Guest 的零余额钱包不叠加。
- 合并成功后撤销 Guest Session；失败则整体回滚并保持 Guest 可继续使用。

### 5.7 邀请码账号升级

- 现有邀请码用户继续使用原账号、钱包、会话和角色资产。
- 用户可从账户设置或登录墙绑定 Email/Google。
- 绑定成功只新增外部身份，不创建第二个 Platform User，也不重复发放 1000 金币。
- 如果该外部身份已属于其他账号，返回冲突并进入人工恢复流程，不做静默合并。

## 6. 页面与交互要求

### 6.1 Welcome

- 使用原型的卡片视觉作为参考，删除 `0–13`、`14–17` 等未成年选项。
- Discover 不自动弹出；首次聊天或新会员缺少 Profile 时弹出。
- 明确说明 AI 内容、18+ 要求、Terms 和 Privacy。
- 键盘可达、焦点锁定、Escape/关闭行为符合当前对话框规范。

### 6.2 登录墙

- Google 为主按钮，Email 为稳定兜底；Apple 只有在后端 capability 为 true 时显示。
- 显示触发原因：保存故事、额度用尽、收藏、创作或主动登录。
- 登录墙必须允许关闭；关闭不会清空游客聊天和输入草稿。
- 不同时展示旧邀请码弹窗和正式登录墙；邀请码入口作为 `Use an invite code` 次级入口。

### 6.3 登录后续接

- 被拦 typed message 使用原 `client_message_id` 发送，防止回调或页面恢复造成重复消息。
- 被拦 Continue 使用独立 action id 发送。
- 如果登录成功但自动发送失败，将内容恢复到输入框并展示可重试错误。
- 新会员奖励弹窗展示服务端返回的实际到账数，点击按钮只确认 UI，不执行发币。

## 7. 安全、隐私与滥用控制

- Guest 和 Member 均使用 HttpOnly、SameSite=Strict Cookie；生产必须 Secure。
- 所有 Guest/Member mutation 均校验同源请求与 double-submit CSRF。
- Guest 创建、OTP 发送/验证、OAuth 回调和聊天均需独立限流。
- OTP 不写明文日志或数据库；验证码短时有效、有限尝试、单次消费。
- OAuth state、nonce、PKCE verifier 必须绑定当前浏览器和 Guest；不在 state 中放消息正文。
- 服务端不信任客户端提交的 `platform_user_id`、Guest quota、奖励值或模型档位。
- 游客账户与事件设置保留期；未晋升 Guest 到期后按隐私策略清理。
- 日志不得记录 Cookie、OAuth token、OTP 或完整邮箱；邮箱使用脱敏形式。

## 8. 成功指标

首版上线观察：

- Discover → 首次聊天进入率；
- Welcome 完成率；
- 游客首条消息成功率及首包延迟；
- 登录墙曝光 → Email/Google 完成率；
- Guest → Member 晋升/合并成功率；
- 登录后待消息续接成功率；
- 重复奖励、重复账号和数据合并失败数量；
- Guest 单位模型成本与限流拒绝率。

事件只记录必要的产品状态和稳定 ID，不发送聊天正文、邮箱或 OAuth token 到分析系统。

## 9. 验收标准

### 9.1 核心功能

- Visitor 不登录可以浏览 Feed，但不能绕过 Welcome 进入聊天。
- Guest 可在真实后端创建多个角色会话，刷新后全部恢复。
- Typed、Continue 全局/单角色额度在多标签页和重放下保持一致。
- Guest 无法选择会员模型、收藏、创作或伪造零成本会员请求。
- Email 与 Google 首次登录只创建一个 Member/Membership/Wallet，并只发一次奖励。
- 同一身份换浏览器登录恢复原账号，不重复奖励。
- 新用户晋升保留所有游客会话；Returning Member 合并全部游客会话。
- 同角色 active 冲突按“游客 active、旧会话归档”处理且历史可读。
- 邀请码老用户绑定正式身份后保持原余额和历史。
- 登录、退出、过期恢复、CSRF、Cookie Secure/Strict 均通过真实 HTTPS 验证。

### 9.2 失败与恢复

- OTP/OAuth 失败不会丢失游客会话或草稿。
- 晋升/合并任一步失败时不签发 Member Session、不部分转移 owner、不发奖励。
- provider 不可用时 fail closed，并允许用户改用 Email 或稍后重试。
- 并发回调和重复提交不会创建重复 User、Membership、Identity、会话或奖励。

## 10. 发布策略

1. `guest_chat`、`email_auth`、`google_auth`、`invite_auth` 使用独立服务端 capability/feature flag。
2. 先在本地与测试环境启用 Guest + Email；Google 配置通过后再启用。
3. 生产先对内部账号灰度，验证成本、Cookie、SSE 与合并事务，再逐步开放。
4. 邀请码入口至少保留一个稳定版本；确认正式身份覆盖和升级完成后另行下线。
5. Guest 功能出现成本或安全异常时可关闭；公开 Feed 和现有 Member 登录恢复不受影响。

## 11. 交付组织

本需求作为一个产品交付、按多个可回滚 commit 实施。由于 `plum_chat` 与 `weixin_bot` 是两个独立 Git 仓库，GitHub 无法创建跨仓库原子 PR：前端仓库承载产品文档与前端主 PR，后端仓库使用同名分支和关联 PR/合并记录。两个仓库必须使用同一技术设计版本和联合验收清单，不允许只部署其中一侧。
