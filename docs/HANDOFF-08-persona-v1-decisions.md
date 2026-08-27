# Plum Persona V1 产品决策与上线复核说明

> 状态：前端入口、真实 Persona CRUD，以及按 Persona 创建或恢复独立故事的切换链路已完成。
> 本文记录当前准备采用的 V1 方案，同时明确标记需要服务端同事在开发和上线前复核的设计点；它不是不可修改的永久约束。

## 1. 当前前端范围

- My Studio 使用可扩展的一级导航，目前包含 `Characters` 和 `Personas`。
- 聊天页 Role Card 面板展示当前 Persona、其他可用 Persona、创建和管理入口。
- My Studio 与聊天页共用 `/personas/new` 创建入口。
- 创建页当前只收集 Name、Description 和默认 Persona 意图。
- 前端通过 owner-scoped Persona API 展示、创建、编辑、软删除和设置默认项，不使用
  `localStorage` 伪造 Persona 持久化。
- 已用于 Connection 的 Persona 会永久锁定身份字段；V1 禁止删除，避免现有故事失去 Prompt 身份。

## 2. V1 切换语义

V1 选择另一个 Persona 时，为该 `Persona × Character` **创建或恢复独立 Connection 和
Conversation**，随后进入该 Persona 自己的故事：

- 第一次选择该 Persona 时创建新故事；再次选择时恢复其已有故事和历史。
- 原 Persona 的 Conversation、关系、记忆、Pins 和 Runtime Context 保持原样，不迁移也不删除。
- 不在一条 Conversation 上覆盖 `persona_id`，历史消息不需要被重新解释或改写。
- `Restart Story` 只重开当前 Persona 的故事，仍是独立操作。

同一 Conversation 即时换头像和名字的体验仍可作为后续方案研究，但它需要消息 Persona 快照、
结构化切换事件、Persona 级记忆隔离及 Prompt Resolver 改造。当前后端以 Connection 作为
`Locked Persona × Scenario` 的关系和记忆边界，因此 V1 选择安全、可追溯且不会串线的独立故事方案。

## 3. V1 数据边界

1. Persona 列表、详情、CRUD 和故事入口全部按 `platform_user_id` 校验所有权。
2. Connection 固定引用一个锁定的 Persona；Persona 首次建立 Connection 后身份字段不可修改。
3. Connection 分别拥有关系状态、跨 Conversation 记忆和 Runtime Binding。
4. Conversation、消息、Pins、剧情状态和局部记忆只属于其 Connection。
5. 再次选择同一 Persona 与 Character 时恢复已有 active Conversation，不重复创建。
6. 选择另一个 Persona 时不得读取或复制原 Connection 的关系、记忆、消息或 Runtime Context。

## 4. 后续连续切换方案的复核点

如果未来希望像部分竞品一样在同一可见聊天里即时换 Persona，必须先独立设计并复核：

- 每条消息与 Turn 的 Persona 快照及历史头像展示；
- 切换事件的摘要、重放、Debug Console 和审计语义；
- Persona 身份记忆、Connection 关系记忆与 Conversation 剧情记忆的分层；
- Prompt Resolver 如何清除旧 Persona 身份，同时保留允许延续的剧情；
- relationship level 是否跨 Persona 延续，以及这是否符合用户预期。

在这些问题冻结并完成迁移前，不得把 V1 API 改成原 Conversation 覆盖 Persona。

## 5. 编辑、删除与默认项的暂定规则

- 默认 Persona 只影响没有显式选择 Persona 的新故事入口，不回写已有 Connection。
- 已参与 Connection 的 Persona 身份锁定且不可删除；未使用 Persona 使用软删除。
- 删除默认 Persona 前必须先设置另一个默认项。
- 锁定 Persona 仍可设为默认项；V1 不提供身份版本或“复制并编辑”入口。

## 6. 隐私与后续公开能力

- V1 Persona 默认 `private`，角色创作者与其他用户不可见。
- V1 直接通过 owner-scoped API 强制私有，不提前暴露无效的可见性开关；后续开放可见性时使用
  可扩展的 `visibility` 枚举，而不是 `is_private` 布尔值。
- 首期至少预留 `private`、`public`；开放 Public 前需另行确认公开字段、审核、搜索展示和撤回后的缓存处理。

## 7. 上线验收与同事复核清单

- [ ] 首次选择 Persona B 时创建与 Persona A 不同的 Connection 和 Conversation。
- [ ] 再次选择 Persona A / B 时分别恢复各自原有的 Conversation 和历史。
- [ ] Persona B 的 Prompt、关系、记忆和 Pins 不包含 Persona A 的私有上下文。
- [ ] 刷新页面后当前 Role Card 与 Connection 绑定的 Persona 一致。
- [ ] 未授权用户不能读取、修改或选择他人的 Persona。
- [ ] 默认 Persona 只影响未显式选择 Persona 的故事入口。
- [ ] 桌面和移动端的创建、编辑、切换、失败重试与加载状态一致。

## 8. 上线说明必须明确的已知决策

上线记录中应单列以下内容：

> Persona V1 为每个 Persona 建立或恢复独立故事。切换不会覆盖原 Conversation，也不会复制关系、
> 消息、Pins、记忆或 Runtime Context；切回原 Persona 会恢复它自己的故事。未来若研究同一
> Conversation 连续换 Persona，必须先完成消息快照、记忆隔离和 Prompt Resolver 设计，不能直接覆盖身份字段。
