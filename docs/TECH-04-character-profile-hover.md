# TECH-04：角色 Profile Hover 与后端字段草案

状态：前端验证版 / 后端需求草案
范围：聊天页左侧角色 Profile；不调整 Human-AI 对话 Runtime

## 1. 目标

聊天页的角色立绘默认保持纯视觉展示。鼠标进入立绘后，渐显一层可滚动的角色资料浮层，让用户在不离开当前对话的前提下了解角色、创作者、社区反馈和公开故事记忆。

该区域属于 Plum 产品/社区业务域。它可以引用现有对话和角色，但不应进入共享 Human-AI Runtime；共享 Runtime 继续只负责用户与 AI 的核心对话执行。

## 2. 参考交互拆解

### 默认态

- 全尺寸角色立绘。
- 顶部保留 CID 和 Hide Profile。
- 不展示详情文案，避免遮挡美术资产。

### Hover / 键盘聚焦态

- 立绘轻微放大、降低饱和度，并覆盖自上而下加深的暗色渐变。
- 资料层在约 260ms 内淡入并轻微上移。
- 顶部 CID / Hide Profile 始终可用。
- 资料层自身可以纵向滚动，鼠标离开后恢复默认态。

### 浮层内容顺序

1. 角色头像、名称、徽章。
2. 标签组，例如 OC、Dominant、Spicy。
3. Creator、Interactions、Connectors 三列统计。
4. Hot Comments：评论总数及两条精选评论。
5. Memory：公开记忆总数及三条记忆摘要。
6. Tagline。

触屏设备没有 hover，前端应默认显示资料层，或后续改为点击立绘切换。

## 3. 字段字典

| 前端字段 | 类型 | 含义 | 建议来源 |
| --- | --- | --- | --- |
| `character.id` | string | Plum 角色业务 ID；不是 Runtime Session ID | 现有角色表 |
| `character.display_name` | string | 展示名称 | 现有角色表 |
| `character.avatar_ref` | string/null | Profile 小头像 | 现有角色表 |
| `character.cover_ref` | string/null | 全尺寸立绘 | 现有角色表 |
| `character.tagline` | string | Profile 底部及聊天开场上方短句 | 现有角色表 |
| `character.badges[]` | object[] | 官方、活动、精选等徽章 | 角色徽章关联表 |
| `character.tags[]` | object[] | 展示及检索标签 | 角色标签关联表 |
| `creator.id` | string | 创作者用户 ID | 用户/创作者表 |
| `creator.display_name` | string | 创作者名称 | 用户/创作者表 |
| `creator.avatar_ref` | string/null | 创作者头像 | 用户/创作者表 |
| `stats.interaction_count` | integer | 累计有效对话轮次，或产品确认后的互动口径 | 聚合统计表 |
| `stats.connector_count` | integer | 与角色建立过连接的去重用户数；最终口径需产品确认 | 连接关系 + 聚合统计表 |
| `stats.comment_count` | integer | 可见评论总数 | 聚合统计表 |
| `stats.memory_count` | integer | 可见公开 Memory 总数 | 聚合统计表 |
| `hot_comments[].id` | string | 评论 ID | 评论表 |
| `hot_comments[].author` | object | 评论者 ID、名称、头像 | 评论表 + 用户表 |
| `hot_comments[].content` | string | 评论正文 | 评论表 |
| `hot_comments[].source_locale` | string | 原文语言，决定是否显示翻译入口 | 评论表 |
| `hot_comments[].like_count` | integer | 点赞数 | 评论聚合字段 |
| `hot_comments[].viewer_has_liked` | boolean | 当前用户是否点赞 | 评论点赞关系表 |
| `hot_comments[].created_at` | datetime | 评论时间 | 评论表 |
| `memories[].id` | string | 公开 Memory ID | Memory 表 |
| `memories[].title` | string | Memory 标题 | Memory 表 |
| `memories[].owner` | object | 发布者 ID、名称、头像 | Memory 表 + 用户表 |
| `memories[].message_count` | integer | 被发布故事包含的消息数 | Memory 表 |
| `memories[].engagement_count` | integer | 评论/互动数；图标口径需产品确认 | Memory 聚合字段 |
| `memories[].published_at` | datetime | 公开时间 | Memory 表 |

### 待产品确认的两个口径

- `Interactions`：建议 MVP 定义为已完成的用户消息 + AI 回复轮次，而不是页面访问量。
- `Connectors`：建议 MVP 定义为至少成功完成过一轮对话的去重用户数。若未来它表示关注/收藏，则应改成独立 Follow 关系和统计。

## 4. 建议数据库实体

以下为逻辑结构，命名可按后端现有 Plum 表规范调整。

### `plum_character_profiles`

角色表的一对一产品扩展。只存角色 Profile 业务属性，不复制 Prompt 或 Runtime 配置。

- `character_id` PK/FK
- `creator_user_id`
- `profile_visibility`
- `hover_enabled`
- `content_rating`
- `created_at`
- `updated_at`

名称、tagline、intro、avatar、cover 已在现有角色实体中时，应继续复用现有字段。

### `plum_character_tags` / `plum_character_tag_assignments`

当标签需要用于 Feed 筛选、运营和排序时建议规范化；若短期只展示，可继续沿用现有 JSON 字段。

- tag：`id`、`slug`、`display_name`、`sort_order`、`status`
- assignment：`character_id`、`tag_id`、`sort_order`

### `plum_character_badges` / `plum_character_badge_assignments`

- badge：`id`、`code`、`display_name`、`icon_ref`、`style_token`
- assignment：`character_id`、`badge_id`、`starts_at`、`ends_at`

### `plum_character_connections`

表示某个用户是否真正与角色建立过关系，属于 Plum 业务域，不属于共享 Runtime。

- `user_id`
- `character_id`
- `first_connected_at`
- `last_interacted_at`
- `conversation_count`
- `completed_turn_count`
- `state`
- 唯一键：`(user_id, character_id)`

对话成功后由 Plum 应用服务幂等更新；不要让 Runtime 直接维护产品统计。

### `plum_character_stats`

用于 Feed 和 Profile 的反范式聚合快照，避免每次打开 Profile 扫描消息和关系表。

- `character_id` PK
- `interaction_count`
- `connector_count`
- `comment_count`
- `memory_count`
- `stats_version`
- `updated_at`

计数由事件/异步任务更新，必要时提供离线重算任务。

### `plum_character_comments`

- `id`
- `character_id`
- `author_user_id`
- `content`
- `source_locale`
- `status`：pending / visible / hidden / deleted
- `like_count`
- `is_featured`
- `featured_rank`
- `created_at`
- `updated_at`
- `deleted_at`

### `plum_character_comment_likes`

- `comment_id`
- `user_id`
- `created_at`
- 唯一键：`(comment_id, user_id)`

点赞接口需幂等，同时异步/事务内维护 `like_count`。

### `plum_character_memories`

这里的 Memory 建议定义为用户主动发布的“公开故事快照”，不是模型的私有长期记忆。

- `id`
- `character_id`
- `owner_user_id`
- `plum_conversation_id`
- `title`
- `summary`
- `cover_ref`
- `message_count`
- `engagement_count`
- `visibility`：private / unlisted / public
- `moderation_status`
- `published_at`
- `created_at`
- `updated_at`

只引用 Plum 业务会话 ID，不直接引用共享 Runtime Session ID。公开 Memory 必须由用户主动发布，不能默认暴露私人聊天内容。

## 5. 建议 API

### Profile 首屏聚合接口

`GET /api/v1/products/plum/characters/{character_id}/profile?comments_limit=2&memories_limit=3`

```json
{
  "status": "ok",
  "profile": {
    "character": {},
    "creator": {},
    "badges": [],
    "tags": [],
    "stats": {
      "interaction_count": 48200,
      "connector_count": 12400,
      "comment_count": 2154,
      "memory_count": 18
    },
    "hot_comments": [],
    "memories": []
  }
}
```

首屏接口返回少量精选内容，控制打开聊天页时的请求数量；View All 使用分页子接口。

### 后续子接口

- `GET /characters/{id}/comments?cursor=...`
- `POST /characters/{id}/comments`
- `PUT /comments/{id}/like`
- `DELETE /comments/{id}/like`
- `GET /characters/{id}/memories?cursor=...`
- `POST /conversations/{id}/memories`：用户主动发布故事快照
- `PATCH /memories/{id}`：修改标题、可见性等

## 6. 边界与风险

- 评论必须有审核、隐藏、软删除和举报扩展能力。
- 评论/Memory 的作者信息应返回公开资料视图，不能直接透出测试账号或内部用户字段。
- Memory 默认 private；公开发布必须是显式用户操作。
- 聚合统计允许最终一致，不能阻塞聊天主链路。
- Profile 接口失败时不应影响发送消息；前端可退化为仅展示角色立绘和基础字段。
- 共享 Human-AI Runtime 不感知 Feed、评论、Connectors、Memory 发布等产品概念。

## 7. 建议迭代顺序

1. Profile 基础字段、Creator、tags、聚合统计只读接口。
2. Connections 聚合和 Hot Comments 只读列表。
3. 评论发布、点赞、审核。
4. 用户主动发布公开 Memory。
