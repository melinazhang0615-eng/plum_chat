# Plum 当前 UI 数据归属与后端扩展方案

> 文档编号：TECH-06
> 版本：v0.3
> 状态：P0A–P0D 已实现并完成前后端联调；P1/P2 待实施
> 日期：2026-08-08
> 关联文档：[TECH-03](./TECH-03-backend-agent-integration.md) · [TECH-04](./TECH-04-character-profile-hover.md) · [TECH-05](./TECH-05-chat-controls.md)

## 1. 结论

当前 UI 中的数据分成四类：

1. **前端代码与静态资源**：布局、SVG 图标、CSS、交互状态，以及联调期暂存在 `public/` 的十张参考角色图片。
2. **Plum 后端业务数据**：Feed 内容、角色公开资料、社区互动、用户与角色关系、点赞收藏、Role Card、Pinned、章节。
3. **共享 Runtime / Platform 数据**：真实对话消息、会话运行、模型供应商调用、钱包与账本、身份和通用审核。
4. **对象存储/CDN 资源**：角色封面、头像、徽章图和未来媒体文件；数据库只保存资源引用及元数据，不保存图片二进制。

前端现已直接消费后端返回的 `FeedCharacter` 与 `CharacterExperience` 契约；名称、文案、统计、Profile、评论、Memory、viewer state 和 Feed 顺序均以后端 seed/API 为权威。原 `lib/presentation.ts`、`lib/character-experience.ts` 业务 mock 和 `presentation` query 参数已删除，十张参考图片仍按约定保留在前端 `public/`。

本阶段不追求正式内容或版权清理。目标是先让“当前可见 UI 的每个数据元素”都有稳定后端来源，验证前后端契约。联调通过后，UI 同学可以继续调整布局和本地视觉资源，PM/运营可以替换后端内容数据，而无需再次改变核心接口。

## 2. UI 元素归属清单

### 2.1 全局 Header 与 Footer

| 元素 | 当前处理 | 最终归属 |
| --- | --- | --- |
| Logo、搜索/语言/创建等 SVG 图标、排版和 hover | 前端代码 | 前端 |
| 导航标签、Coming soon、版权及法律链接文案 | 前端常量；上线前替换 | 前端配置或 CMS，不建核心业务表 |
| 金币余额 | 已从 `/bootstrap`、会话和 turn 响应读取 | Platform 钱包/账本，后端为权威 |
| 登录按钮 | 已接邀请码登录与退出 | Plum 公网内测身份；正式账号升级后续替换 |

### 2.2 Feed 卡片

| 元素 | 当前处理 | 最终归属 |
| --- | --- | --- |
| 2×5 网格、卡片比例、遮罩、字体、hover、loading skeleton | CSS/React | 前端 |
| 十张参考封面 | `public/characters/plum-reference/` | 联调期仍由前端托管文件，但路径由后端 `cover_ref` 返回；正式版上传对象存储/CDN |
| 角色名、tagline、Creator、badge、是否支持语音 | 已由 Plum seed/API 返回 | Plum 后端为权威来源 |
| 互动数 | 后端返回原始整数，前端格式化为 `48.2K` | Plum 聚合统计表 |
| 排序与分区 | 后端 `sort_order` 返回当前固定顺序 | Plum Feed 查询与运营排序 |
| 点击后进入哪个角色 | 十张卡分别使用独立 `character_id` | Plum 角色与会话 |

`presentation` query 参数及“10 张卡映射到 2 个角色”的临时方案已经移除。每张参考卡均 seed 为独立测试角色，角色名、文案、封面、Prompt、Greeting 和 Profile 都以自己的 `character_id` 为事实源。若未来明确需要“同一角色的多个剧情入口”，再新增独立 scenario/presentation 实体。

### 2.3 角色 Profile

| 元素 | 最终归属 |
| --- | --- |
| Profile 展开/隐藏、hover 渐显、滚动位置、玻璃效果 | 前端 |
| 封面/头像文件 | 对象存储/CDN；引用保存在角色表 |
| 名称、tagline、Creator、内容分级 | Plum 角色/Profile 表 |
| tags、badges | Plum 标签/徽章及关联数据 |
| Interactions、Connectors、评论数、公开 Memory 数 | Plum 聚合统计 |
| Hot Comments、评论点赞状态 | Plum 评论域 |
| Profile Memory | Plum 用户主动发布的公开故事快照；不是 Runtime 私有记忆 |

### 2.4 聊天顶部

| 控件 | 最终归属 |
| --- | --- |
| 角色头像、布局、tooltip、弹层开关 | 前端 |
| `Lv`、XP | Plum 用户—角色关系 |
| 书本 + 章节号 | Plum conversation chapter |
| Auto voice | 首版禁用；以后属于多媒体/偏好能力 |
| 点赞与计数 | Plum character like + stats |
| 收藏与计数 | Plum character favorite + stats |
| 三点菜单、显示/隐藏 Profile | 前端；重新开始仍调用现有 Plum conversation API |

点赞和收藏已接入后端幂等写入；前端保留 optimistic 即时切换，请求失败回滚，刷新后以后端状态为准。

### 2.5 消息区与输入工具栏

| 元素 | 最终归属 |
| --- | --- |
| 消息气泡、typing、错误态、滚动到底部 | 前端 |
| 消息正文、角色开场白、历史、发送幂等 | 现有 Plum + 共享 Human-AI Runtime |
| 模型档位、价格、切换结果 | 现有 `plum_model_profiles` 与会话 API |
| Role Card | Plum 用户 persona 与会话选择；发送前由 Plum 编译到 Runtime 上下文 |
| Pinned | Plum 私有会话置顶事实；发送前由 Plum 编译到 Runtime 上下文 |
| Inspiration | 当前通用前端模板；若以后做角色定制/运营配置，再由后端返回 |
| 图片、视频、图库 | 首版禁用；以后复用对象存储、任务和审核等通用技术能力，业务记录仍属 Plum |

## 3. 前端改造基线

本轮前端已完成以下收口：

- 删除 `lib/presentation.ts` 与 `lib/character-experience.ts` 业务 mock；十张图片仍作为前端视觉资源。
- `lib/types.ts` 定义已落地的 `FeedCharacter`、`CharacterExperience`、公开用户摘要、评论和公开 Memory 契约。
- Feed/Chat 页面不再保存 `119`、`120`、`12.4K`、测试评论等业务值，只消费后端契约。
- badge、统计数、Creator、tags、评论、Memory、关系等级、章节、点赞收藏和工具栏均从契约渲染。
- 模型选择、文本 turn、钱包、消息历史继续走共享 Runtime/Platform；首版保持非流式。

当前聚合契约：

```ts
type CharacterExperience = {
  profile: {
    creator: PublicUserSummary;
    badges: Badge[];
    tags: string[];
    stats: CharacterStats;
    hot_comments: CharacterProfileComment[];
    memories: CharacterPublicMemory[];
  };
  viewer_state: {
    relationship_level: number;
    relationship_xp: number;
    current_chapter: number;
    has_liked: boolean;
    like_count: number;
    is_favorite: boolean;
    favorite_count: number;
  };
  conversation_tools: {
    role_card: UserPersona | null;
    pins: ConversationPin[];
  };
  inspiration_prompts: string[];
};
```

后端未上线前不应让前端请求一个必然 404 的假接口；P0 接口完成后，在 `lib/api.ts` 扩展会话详情返回类型，以响应中的 `experience` 替换 `buildMockCharacterExperience()` 即可。

## 4. 联调阶段后端测试数据包

### 4.1 目标与约束

联调第一阶段把当前前端抓取并整理的参考元素定义为 `reference_fixture_v1`。它只用于 local/test 环境，不代表正式内容，但必须完整走数据库、Repository 和 API，不能在 API handler 中硬编码，也不能继续依赖前端 query 参数拼装角色。

- seed 必须幂等，重复执行只做可控 upsert，不重复创建角色、评论、Memory、徽章或赠送流水。
- 每张 Feed 卡是一条独立测试角色；不保留“10 张卡共用 2 个角色”的临时映射。
- 当前图片仍由前端 `public/characters/plum-reference/` 托管，后端 `cover_ref` 返回该相对路径；联调通过后再换 CDN URL。
- 每个测试角色必须有自己的公开字段、Prompt、Greeting、Profile、统计及 Feed 顺序，点击卡片后名称和聊天人格不得错位。
- `fixture_version=reference_fixture_v1` 只用于 seed/审计，不进入共享 Runtime，也不要求前端展示。

### 4.2 十条角色 seed

| sort | character_id | display_name | asset filename | interactions | badge / voice |
| ---: | --- | --- | --- | ---: | --- |
| 10 | `char_ref_after_hours` | Kai · After Hours | `feed-01.avif` | 48200 | Editor’s Pick / voice |
| 20 | `char_ref_dangerous_promise` | The Dangerous Promise | `feed-02.avif` | 31400 | — |
| 30 | `char_ref_no_rules` | No Rules Tonight | `feed-03.avif` | 26800 | voice |
| 40 | `char_ref_adrian_vale` | Adrian Vale | `feed-04.avif` | 19700 | — |
| 50 | `char_ref_romano_twins` | The Romano Twins | `feed-05.avif` | 72600 | Trending |
| 60 | `char_ref_lucien` | Lucien | `feed-06.avif` | 35100 | voice |
| 70 | `char_ref_roman_morozov` | Roman Morozov | `feed-07.avif` | 18900 | — |
| 80 | `char_ref_starlit_vow` | Luna · Starlit Vow | `feed-08.avif` | 42000 | New |
| 90 | `char_ref_midnight_escape` | A Midnight Escape | `feed-09.avif` | 15300 | — |
| 100 | `char_ref_private_lessons` | Private Lessons | `feed-10.avif` | 12800 | voice |

完整 tagline、creator handle 和图片路径以 `lib/presentation.ts` 为一次性迁移源。迁移完成后，后端 fixture 文件成为联调权威；前端不得继续根据 presentation ID 覆盖角色字段。

### 4.3 Profile 与聊天元素 seed

为保持当前 UI 不变，十个角色首批可共享以下测试值，但数据库记录必须按角色建立稳定外键：

- tags：`OC` 加角色测试标签；后续 PM 可逐角色替换。
- stats：`connector_count=12400`、`comment_count=2154`、`memory_count=18`、`like_count=119`、`favorite_count=120`；`interaction_count` 使用上表逐角色数值。
- Hot Comments：两条当前英文测试评论，点赞数分别为 91 和 63。
- Public Memory：三条当前测试 Memory，engagement 分别为 61、12 和 5。
- viewer state：每个测试账号初始 `Lv0`、`XP0`、Chapter 1、未点赞、未收藏。
- Role Card：为每个测试账号 seed 一张默认 Persona；Pinned 初始为空。
- Inspiration：首版可由 experience API 返回当前三条模板，也可继续作为前端 fallback；不进入 turn，除非用户确认发送。

Creator、评论作者和 Memory owner 不应为了展示而伪造可登录的 `platform_users`。建议新增 Plum 公共资料投影，允许测试/运营资料不绑定平台登录身份；真实用户资料则通过可空且唯一的 `platform_user_id` 关联。

### 4.4 Prompt 与 Greeting

十条角色记录都必须具有可运行的 `persona_prompt`、`scenario_prompt`、`speaking_style` 和 `greeting`。联调期允许从现有 Kai/Luna 两套模板派生，但 seed 时必须覆盖角色名、称谓和开场白，避免 Feed 显示 Adrian、实际回复却自称 Kai。正式内容由 PM 后续整体替换。

### 4.5 后端交付清单

1. 数据库 migration：公共资料、角色扩展、徽章、统计、关系、点赞收藏、评论、公开 Memory、Persona/Pinned 所需表或字段。
2. `reference_fixture_v1` 幂等 seed：十角色、公开资料、徽章、统计、评论、Memory、默认测试 Persona。
3. Repository：Feed 投影和 CharacterExperience 聚合，API handler 不直接拼 fixture。
4. API：Feed 返回十条测试角色；会话详情返回或附带 `experience`；点赞收藏提供幂等写接口。
5. Human-AI 主链：继续调用现有 `run_product_turn()`；仅在 Plum 应用层读取 Persona/Pinned 并编译中性上下文。
6. 测试：SQLite/PostgreSQL 双后端 seed 幂等、DTO snapshot、owner 隔离、like/favorite 并发、turn 回归。
7. 前端联调：删除 `presentation` query 覆盖与业务 mock，保留短期失败 fallback；验证桌面和移动端字段一致。

联调验收后，测试数据不直接改成正式数据：先冻结 `reference_fixture_v1`，由 UI/PM 提交新的内容/资源清单，再以新 fixture 版本或运营后台数据替换。这样可以随时复现本轮联调基线。

## 5. 现有后端能力：直接复用

已存在且不应重复建设：

| 现有表/模块 | 继续负责 |
| --- | --- |
| `plum_characters` | 角色基础公开字段、封面引用、私有 Prompt、Feed 基础顺序 |
| `plum_character_bindings` | 用户×角色到 runtime account 的绑定及 Prompt 版本 |
| `plum_conversations` | Plum 会话、模型档位、runtime session 映射和重开状态 |
| `plum_model_profiles` | 产品档位到 provider、费用、启停和配置版本 |
| `runtime_ownerships` | runtime account 的中性 owner 投影 |
| 共享 `sessions/messages` | 对话正文和历史 |
| Platform 用户/membership/wallet/ledger/reservation | 身份、1000 初始金币、并发安全扣费 |
| `run_product_turn()`、`PlumTurnServices` | Human-AI turn、Prompt、审核、模型调用和消息落库 |

`heat_count` 可在过渡期继续返回，但正式统计应由 `plum_character_stats.interaction_count` 统一提供，避免两个可写计数源长期并存。

## 6. 建议新增/调整的数据模型

### 6.1 P0：只读 Feed/Profile 与 viewer state

#### `plum_public_profiles`

用于 Creator、评论作者和公开 Memory owner 的产品公开资料，不等同于登录账号。

- `id` PK、`platform_user_id` NULL UNIQUE。
- `handle`、`display_name`、`avatar_ref`、`profile_type`、`status`。
- 测试/运营资料允许 `platform_user_id=NULL`；真实用户资料关联 Platform 用户。
- API 只返回公开字段，不暴露手机号、membership 或内部身份数据。

#### 调整 `plum_characters`

- 新增 `creator_profile_id`，FK 到 `plum_public_profiles.id`；不要为参考 Creator 创建可登录账号。
- 新增 `content_rating TEXT NOT NULL DEFAULT 'general'`。
- 保留 `avatar_ref/cover_ref`；其值为对象存储 key 或 CDN URL，不是二进制。
- 联调 Feed 每张参考卡一条角色记录；用现有 `status/sort_order` 上下架及排序，正式数据沿用同一契约。
- `tags_json` P0 可继续使用，待需要筛选/运营后台时再规范化。

#### `plum_character_badges`

| 字段 | 约束/说明 |
| --- | --- |
| `id` | PK |
| `code` | UNIQUE，例如 `featured` |
| `display_name`、`icon_ref`、`style_token` | 展示元数据 |
| `status` | active/inactive |
| `created_at`、`updated_at` | 审计 |

#### `plum_character_badge_assignments`

- `character_id` FK、`badge_id` FK、`sort_order`、`starts_at`、`ends_at`。
- PK `(character_id, badge_id)`。
- 索引 `(character_id, sort_order)`。

若 Feed 需要按标签筛选，再增加 `plum_character_tags` 和 `plum_character_tag_assignments`；否则 P0 不为展示标签提前拆表。

#### `plum_user_character_relationships`

一个表同时表达 Connector 和关系成长，避免再建重复的 connection 事实表。

| 字段 | 说明 |
| --- | --- |
| `platform_user_id`、`character_id` | 联合 PK |
| `state` | connected/blocked/inactive |
| `relationship_level`、`relationship_xp` | 当前成长状态，均非负 |
| `completed_turn_count` | 成功完成的 turn 数 |
| `first_connected_at`、`last_interacted_at` | 连接与最近互动时间 |
| `created_at`、`updated_at` | 审计 |

索引 `(character_id, state, last_interacted_at)`，供 Connector 聚合与运营查询。

#### `plum_character_stats`

- `character_id` PK/FK。
- `interaction_count`、`connector_count`、`comment_count`、`memory_count`、`like_count`、`favorite_count`，全部 `NOT NULL DEFAULT 0 CHECK >= 0`。
- `stats_version`、`updated_at`。

该表是可重算聚合快照，不是唯一事实源。聊天成功不能等待全表统计重算。

#### `plum_character_likes` / `plum_character_favorites`

两表结构相同：

- `platform_user_id`、`character_id`、`created_at`。
- PK `(platform_user_id, character_id)`。
- 索引 `(character_id, created_at)`。

使用 `PUT`/`DELETE` 幂等写入；计数在同一事务增减或写 outbox 后异步更新，且必须有离线重算手段。

### 6.2 P1：Role Card、Pinned 与章节

#### `plum_user_personas`

- `id` PK、`platform_user_id` FK。
- `display_name`、`avatar_ref`、`description`、`prompt_text`。
- `status`、`is_default`、`version`、`created_at`、`updated_at`。
- 每个用户最多一个 active default：局部唯一索引 `(platform_user_id, is_default)` where active/default。

公开 DTO 不返回未经处理的 `prompt_text`；它只在 Plum 应用层编译上下文时使用。

#### `plum_conversation_personas`

- `conversation_id` PK/FK。
- `persona_id` FK、`persona_version`。
- `display_name_snapshot`、`description_snapshot`、`prompt_snapshot`。
- `updated_at`。

保存快照，避免用户修改复用 Role Card 后静默改变进行中的故事身份。

#### `plum_conversation_pins`

- `id` PK、`conversation_id` FK。
- `source_message_id` 或 `source_memory_id` 可空。
- `content_snapshot`、`sort_order`、`status`、`created_at`、`updated_at`。
- 索引 `(conversation_id, status, sort_order)`。
- P0/P1 建议限制每个会话 pin 数量和总字符数，避免 Prompt 无界增长。

#### `plum_conversation_chapters`

- `id` PK、`conversation_id` FK、`chapter_no`。
- `title`、`summary`、`starts_at_message_id`、`ends_at_message_id`。
- `status`、`created_at`、`closed_at`。
- UNIQUE `(conversation_id, chapter_no)`。

`plum_conversations` 增加 `current_chapter_no NOT NULL DEFAULT 1`。章节摘要属于 Plum 故事产品能力；Runtime 只接收编译后的上下文。

### 6.3 P2：评论与公开 Memory

#### `plum_character_comments`

- `id` PK、`character_id` FK、`author_profile_id` FK 到 `plum_public_profiles`。
- `content`、`source_locale`。
- `status`：pending/visible/hidden/deleted。
- `like_count`、`is_featured`、`featured_rank`。
- `created_at`、`updated_at`、`deleted_at`。
- 索引 `(character_id, status, is_featured, featured_rank, created_at)`。

#### `plum_character_comment_likes`

- PK `(comment_id, platform_user_id)`，另有 `created_at`。
- 评论点赞接口幂等；`like_count` 可重算。

#### `plum_character_memories`

- `id` PK、`character_id` FK、`owner_profile_id` FK、`plum_conversation_id` 可空。
- 新增 `origin`：seed/user_published；user_published 时 conversation 必填，seed 测试数据允许为空。
- `title`、`summary`、`cover_ref`、`message_count`、`engagement_count`。
- `visibility`：private/unlisted/public。
- `moderation_status`、`published_at`、`created_at`、`updated_at`。
- 索引 `(character_id, visibility, moderation_status, published_at)`。

公开 Memory 是用户显式发布的故事快照，默认 `private`；绝不能把共享 Runtime 的聊天历史默认公开。

## 7. API 方案

### 7.1 Feed

扩展现有：

```http
GET /api/v1/products/plum/feed?section=for_you&limit=10&cursor=...
```

每项返回原始数据，不返回 `48.2K` 这类格式化字符串：

```json
{
  "id": "char_kai_after_hours",
  "display_name": "Kai · After Hours",
  "tagline": "...",
  "creator": { "id": "...", "display_name": "plum", "avatar_ref": null },
  "badges": [{ "code": "featured", "display_name": "Editor's Pick", "style_token": "featured" }],
  "tags": ["OC"],
  "interaction_count": 48200,
  "avatar_ref": "...",
  "cover_ref": "...",
  "capabilities": { "text": true, "voice": false }
}
```

### 7.2 Profile 与聊天聚合

- `GET /characters/{id}/profile?comments_limit=2&memories_limit=3`：公开且可 CDN/cache 的 Profile 数据。
- P0 优先在现有 `GET /conversations/{id}` 响应中增量加入 `experience`，一次返回消息、模型、钱包与当前 `CharacterExperience`；如以后需要独立刷新，再增加 `GET /conversations/{id}/experience`。
- `GET /characters/{id}/comments?cursor=...`、`GET /characters/{id}/memories?cursor=...`：View All 分页。

Profile 接口失败不能阻断 turn；聊天页可降级到角色基础资料。`experience` 中所有计数返回整数，所有时间返回带时区 ISO 8601。

### 7.3 互动写接口

- `PUT /characters/{id}/like`、`DELETE /characters/{id}/like`。
- `PUT /characters/{id}/favorite`、`DELETE /characters/{id}/favorite`。
- `POST /characters/{id}/comments`。
- `PUT /comments/{id}/like`、`DELETE /comments/{id}/like`。
- `POST /conversations/{id}/memories`：显式发布故事快照。

点赞/收藏响应返回 `active` 与最新 count，便于 optimistic UI 对账。所有写请求只使用服务端 principal，不接受可信 user ID。

### 7.4 会话上下文工具

- `GET/POST/PATCH /personas`。
- `PUT /conversations/{id}/persona`、`DELETE /conversations/{id}/persona`。
- `GET/POST/PATCH/DELETE /conversations/{id}/pins`。
- `GET /conversations/{id}/chapters`。

## 8. 与 Human-AI Runtime 的边界

核心规则不变：Runtime 只处理业务无关的人—AI turn，不维护 Plum Feed/Profile/评论/关系等表。

```text
用户发送消息
  → Plum API 校验 conversation / owner / model / wallet
  → Plum Application 读取角色 Prompt + Role Card snapshot + active Pins + chapter summary
  → 编译为有大小上限的 ProductPromptContext
  → 调用共享 run_product_turn()
  → Runtime 完成消息、审核、模型调用和终态落库
  → Plum Application 在成功终态后幂等更新 relationship/connection 与统计
```

建议以 `turn_id` 或 assistant `message_id` 作为关系成长的幂等来源，增加产品私有的处理记录或复用中性 outbox，避免重试导致 XP、turn count 和 interaction count 重复增加。统计更新失败不应把已经成功的 AI 回复改判失败；通过 outbox/补偿任务追平。

Runtime 不认识 Role Card、Pinned、Chapter、Connector、Like、Favorite 等产品词；Plum 只向其提交编译后的受控文本上下文。

## 9. 实施顺序与验收

1. **P0A（已完成）：migration + 测试资料**。建立公共资料、角色扩展、badge、stats 等结构。
2. **P0B（已完成）：`reference_fixture_v1` seed**。迁入当前十张参考卡、Profile、评论、Memory 和测试 Persona，验证重复执行无副作用。
3. **P0C（已完成）：Feed 与会话聚合**。Feed 返回十个独立角色；会话详情附带 `experience`；前端删除 `presentation` 和业务 mock 权威路径。
4. **P0D（已完成）：viewer state 写入**。关系、章节、like/favorite 真正持久化，完成 optimistic 回滚和刷新恢复测试。
5. **P1：上下文工具**。Role Card、Pinned、章节接口及 Plum 应用层编译；验证它们真实影响模型回复且不污染共享 Runtime。
6. **P2：社区数据**。评论、评论点赞、公开 Memory、审核与分页。
7. **以后**：正式资产迁移到对象存储，以及语音、图片、视频和图库。

最低验收标准：

- 后端 seed/API 能完整复现当前十张 Feed 卡和聊天 Profile；每张卡进入自己的角色与 Prompt。
- 前端不再从本地业务 mock 或 query 参数读取业务权威数据。
- 接口返回整数计数，前端统一格式化。
- like/favorite 刷新后不丢失，并发请求不产生负计数或重复关系。
- P1 完成后，Role Card/Pinned 真实进入角色上下文，但 Runtime/Platform 没有 Plum 业务表或 `app_id == plum` 分支。
- Profile、评论和统计故障不影响已有文本 turn；钱包、模型切换和消息历史继续使用现有真实链路。
