# Plum 手写记忆前后端联调需求

> 文档编号：HANDOFF-08
> 状态：前端已实现并合入分支，等待服务端接口；本文是联调基线，不是最终数据库设计
> 更新日期：2026-08-19
> 前端页面：`/chat/[characterId]`
> 关联文档：[TECH-06](./TECH-06-data-ownership-and-backend-plan.md) · [TECH-05](./TECH-05-chat-controls.md) · [TECH-03](./TECH-03-backend-agent-integration.md)
> 前端提交：`247fc85 feat(chat): 记忆支持手动输入与编辑`

## 1. 目的与边界

聊天页的「记忆」此前只能从 AI 回复长按保存。本次前端新增**手写记忆**：用户从顶栏记忆入口直接输入一段文字，作为长期事实存进本次会话。

本文只约定手写记忆涉及的接口、字段语义与校验。记忆的召回策略、条数上限的产品口径、跨会话记忆和记忆删除不在本文定稿。

**本文最重要的一条不是新接口，而是第 6 节**：目前记忆根本没有进入模型上下文，前端面板底部至今写着「Fallback build: not yet written into model context」。接口做完但第 6 节没做，这个需求对用户就是零价值。

## 2. 前端现状

已实现并可联调：

- 顶栏记忆图标 → 面板标题栏的入口按钮。桌面端弹出居中弹窗，移动端进全屏编辑页。
- 手写记忆**每个会话唯一**：已存在时入口按钮变成铅笔，点开即预填编辑，保存走改写；不存在时才是 ＋，保存走新建。
- 手写记忆在记忆列表中**置顶**，且是列表里唯一带编辑入口的一条。
- 字数上限 **2000**，输入框实时显示 `n/2000`。
- 游客点击入口不进编辑，直接拉起登录。

前端**区分手写与长按保存**只依赖一个字段：`message_id`。`message_id` 为 `null` 的 pin 即手写记忆。

## 3. 数据语义

沿用 TECH-06 §7.3 的 `plum_conversation_pins`，本次只明确既有字段在手写场景下的取值：

| 字段 | 手写记忆 | 长按保存 |
| --- | --- | --- |
| `source_message_id` | `NULL` | 来源 assistant message id |
| `content_snapshot` | 用户输入原文 | 被保存气泡的正文 |
| `sort_order` | 见 §5.3 | 现状不变 |

响应给前端的 `ConversationPin` 结构不变：

```ts
type ConversationPin = {
  id: string;
  content: string;
  sort_order: number;
  message_id?: string | null;   // null = 手写
  created_at?: string;
};
```

## 4. 接口

统一前缀 `/api/v1/products/plum`。

### 4.1 新建手写记忆（已有端点，需支持 `message_id: null`）

```
POST /conversations/{conversation_id}/pins
```

请求：

```json
{ "content": "She hates being called \"kid\" — it ends any good mood instantly.", "message_id": null }
```

响应 `201`：

```json
{ "status": "ok", "pin": { "id": "pin_12", "content": "…", "sort_order": 0, "message_id": null, "created_at": "2026-08-19T21:09:00+08:00" } }
```

要求：

- `message_id` 允许显式传 `null`，不能因为缺少来源消息而拒绝。
- 该会话已存在手写记忆时的行为见 §5.2。

### 4.2 改写手写记忆（**新增，当前返回 501**）

```
PATCH /conversations/{conversation_id}/pins/{pin_id}
```

请求：

```json
{ "content": "改写后的正文" }
```

响应 `200`：

```json
{ "status": "ok", "pin": { "id": "pin_12", "content": "改写后的正文", "sort_order": 0, "message_id": null } }
```

要求：

- 只允许改写 `source_message_id IS NULL` 的 pin。对长按保存的 pin 返回 `409`，前端不会发这种请求，但需要防串改。
- 必须校验 pin 属于该 `conversation_id`，且会话属于当前用户。
- 响应必须回带完整 pin 对象，前端直接用它替换本地副本。

### 4.3 会话详情

```
GET /conversations/{conversation_id}
```

`experience.conversation_tools.pins` 返回该会话全部 pin。**排序由前端负责**（手写置顶），后端按 `(status, sort_order)` 返回即可，不需要为手写做特殊排序。

### 4.4 删除（本次不做，登记待办）

TECH-06 §7.4 里已列了 `DELETE /conversations/{id}/pins`，前端本次没有做删除入口。后端如果顺手实现，前端可以在下一轮接上。

## 5. 校验与约束

### 5.1 长度

- `content` 去除首尾空白后长度必须在 **1–2000** 之间。
- 超限返回 `422`，前端已在输入侧用 `maxLength` 拦住，服务端仍需兜底。

> 口径提醒：CrushOn 参考稿的移动端是 300 字上限，前端现在按 web 参考稿取 2000，两端统一。**如果产品要改成别的数字，请在联调前定下来**，改动涉及前端常量 `MEMORY_DRAFT_MAX`、服务端校验和 Prompt 预算三处。

### 5.2 每会话手写记忆唯一

前端保证「有则改写、无则新建」，但并发或多端同时编辑会绕过它。**服务端需要自己兜底**，二选一并告知前端：

- **方案 A（推荐）**：`POST` 时若该会话已存在手写记忆，直接 upsert 覆盖，仍返回 `201`/`200` 与该 pin。前端无需改动。
- **方案 B**：返回 `409` 并在响应体里带上已存在的 pin id。前端需要加一段冲突处理。

未确认前后端按方案 A 实现，前端当前行为与之兼容。

### 5.3 排序

手写记忆建议固定 `sort_order = 0`，长按保存的从 1 递增，便于后续服务端直接按顺序拼 Prompt。前端不依赖这一点。

### 5.4 权限与配额

- 会话 owner 校验照旧；非 owner 返回 `403`。
- 游客（visitor/guest）不应写入手写记忆，前端已拦在登录前；服务端按现有 pins 策略返回 `401`。
- TECH-06 §7.3 提到的「限制每个会话 pin 数量和总字符数」在本次落地：手写 1 条 × 2000 字符需要计入 Prompt 预算。

## 6. 记忆真正进入模型上下文（本文重点）

TECH-06 §8 的编译链路里已经写了 `active Pins` 会进 `ProductPromptContext`，但当前构建没有生效——前端面板底部那句 fallback 说明就是为此保留的。需要服务端确认并落地：

1. 每轮 turn 编译 Prompt 时读取该会话的 pins，手写记忆优先级最高（放在长按保存的之前）。
2. 明确注入形式：作为长期事实块，而不是伪装成对话历史。
3. 明确预算：pins 总字符占 `ProductPromptContext` 的上限，超出时的截断顺序（建议保留手写、截断长按保存的）。
4. 生效后前端会删掉面板底部的 fallback 说明文案。

**请在回复本文时明确这一项的排期。** 前面所有接口都完成、这一项没做，用户写的记忆角色依然不会记得。

## 7. 前端兜底行为（联调时会看到）

后端接口未上线期间，前端对 `404 / 405 / 501` 做了降级：**只更新本地副本并照常提示成功**，刷新后丢失。这是沿用仓库里 pins 已有的兜底套路，目的是让面板与用户刚做的操作一致。

联调时的现象：

- 本地 mock 后端目前 `PATCH /pins/{id}` 返回 `501 Unsupported method ('PATCH')`，所以**编辑改不动库，刷新回到原文**；新建是真的落库（`201`）。
- 服务端接口上线后前端**不需要改代码**，降级分支自动不再命中。

## 8. 验收清单

- [ ] `POST /pins` 接受 `message_id: null`，返回完整 pin
- [ ] `PATCH /pins/{pin_id}` 返回 `200` + 完整 pin，刷新后内容仍是改写后的
- [ ] 改写长按保存的 pin 返回 `409`
- [ ] 跨会话 / 跨用户改写返回 `403`
- [ ] `content` 为空或超 2000 返回 `422`
- [ ] 同一会话第二次 `POST` 手写记忆按 §5.2 的确定方案表现一致
- [ ] 会话详情的 `pins` 包含手写记忆且 `message_id` 为 `null`
- [ ] **手写记忆出现在下一轮的模型上下文中，角色的回复能体现它**

## 9. 待确认

1. §5.2 唯一性用方案 A 还是 B？
2. §5.1 字数上限最终取 2000 还是别的值？
3. §6 记忆注入 Prompt 的排期？
4. 手写记忆是否需要过审核链路（长按保存的内容来自 AI 已审过的回复，手写内容是用户直接输入的，两者风险不同）？
5. 是否需要 `DELETE`，本轮还是下轮？
