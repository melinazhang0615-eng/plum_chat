# Plum Persona V1 产品决策与上线复核说明

> 状态：前端体验原型已完成，Persona CRUD、会话切换与记忆隔离尚未接入后端。
> 本文记录当前准备采用的 V1 方案，同时明确标记需要服务端同事在开发和上线前复核的设计点；它不是不可修改的永久约束。

## 1. 当前前端范围

- My Studio 使用可扩展的一级导航，目前包含 `Characters` 和 `Personas`。
- 聊天页 Role Card 面板展示 `Recommended Persona`、当前 Persona 和 `Add Persona`。
- My Studio 与聊天页共用 `/personas/new` 创建入口。
- 创建页当前只收集 Name、Description 和默认 Persona 意图。
- 前端不使用 `localStorage` 伪造 Persona 持久化；后端 API 接入前不会宣称创建成功。

## 2. 当前建议的切换语义

V1 暂定允许用户在**同一个 Conversation 内即时切换 Persona**：

- 不创建新 Conversation，不重置用户可见的消息历史。
- 当前场景与关系进度继续保留。
- 切换后名称、头像和身份描述立即使用新 Persona。
- UI 展示轻量事件：`You switched to {persona_name}`，并提示 `Now chatting as {persona_name}`。
- `Restart Story` 仍是独立操作，不能与 Persona 切换混为一谈。

采用这一方案是因为已观察的同类产品都在原聊天中持续对话；强制创建新故事不符合用户对“切换身份卡”的直接预期。

## 3. 上线前必须满足的数据边界

直接切换不能只修改一段前端文案或覆盖 Conversation 上的一个字段。服务端至少需要保证：

1. Conversation 记录当前 `active_persona_id`。
2. 每条用户消息或 turn 保存发送当时的 `persona_id` 快照。
3. 历史消息保留发送时的 Persona 名称和头像，不因之后切换而整体重写。
4. Prompt 只把当前 Persona 的身份资料作为当前用户身份注入。
5. Persona 切换以结构化事件进入上下文，模型能识别身份边界。
6. 从聊天中提取的用户身份事实或长期记忆必须携带 `persona_id`，只向对应 Persona 回注。
7. 切回旧 Persona 时恢复该 Persona 自己的身份记忆，不能混入其他 Persona 的职业、年龄、背景或称呼。
8. 所有列表、详情、切换和写操作继续按 `platform_user_id` 做所有权校验。

如果上线版本无法满足第 2、4、6、7 项，应该关闭聊天内切换，只允许新 Conversation 选择 Persona；不能以身份记忆串线作为可接受降级。

## 4. 需要重点复核的 Connection 设计

现有服务端模型把 Persona、Connection、关系和记忆紧密关联；而“同一 Conversation 内切换 Persona、场景和关系继续”会改变这一假设。服务端实现前必须明确：

- Connection 继续代表角色关系，还是代表“角色 × Persona”的关系？
- 切换 Persona 后，relationship level 是否继续沿用当前 Conversation？
- Persona 级长期记忆与 Conversation 级剧情记忆如何分层？
- Prompt Resolver 如何避免旧 Persona 的身份摘要继续生效？
- Persona 切换事件是否需要参与摘要、重放、Debug Console 和审计？

当前产品倾向是：**剧情与关系属于 Conversation，用户身份事实属于 Persona**。如果现有 Connection 模型无法稳定表达这一点，应先调整领域模型，再开放切换接口。

## 5. 编辑、删除与默认项的暂定规则

- 默认 Persona 只影响新 Conversation 的初始选择，不回写已有 Conversation。
- 已发送消息保存 Persona 快照，之后编辑 Persona 不得改写历史展示。
- 已参与 Conversation 的 Persona 不应硬删除；优先归档。
- 删除默认 Persona 前必须先设置另一个默认项。
- 是否锁定已使用 Persona、或允许编辑后生成新版本，仍需在 CRUD API 设计时最终确认。

## 6. 隐私与后续公开能力

- V1 Persona 默认 `private`，角色创作者与其他用户不可见。
- 后续会支持用户修改可见性，因此数据库和 API 应使用可扩展的 `visibility` 枚举，而不是只用 `is_private` 布尔值。
- 首期至少预留 `private`、`public`；开放 Public 前需另行确认公开字段、审核、搜索展示和撤回后的缓存处理。

## 7. 上线验收与同事复核清单

- [ ] 在 Persona A / Persona B 间反复切换，Conversation ID 和可见历史不变。
- [ ] 切换后的下一轮 Prompt 只使用当前 Persona。
- [ ] 历史用户消息仍显示发送时的 Persona。
- [ ] Persona A 的身份事实不会在 Persona B 下被召回。
- [ ] 切回 Persona A 后能恢复 A 自己的身份记忆。
- [ ] 切换事件在刷新、历史恢复和摘要后仍然成立。
- [ ] 未授权用户不能读取、修改或选择他人的 Persona。
- [ ] 默认 Persona 只影响新 Conversation。
- [ ] 服务端同事已复核 Connection、关系进度和长期记忆的归属模型。

## 8. 上线说明必须明确的已知决策

上线记录中应单列以下内容：

> Persona V1 采用同一 Conversation 内即时切换。剧情与关系延续；当前身份 Prompt 立即替换；消息保存 Persona 快照；身份记忆按 Persona 隔离。该设计参考当前竞品的连续切换体验，仍需在真实长对话数据下复核 Connection 与长期记忆模型。若出现身份记忆串线，应立即关闭聊天内切换并回退为新 Conversation 选择 Persona。
