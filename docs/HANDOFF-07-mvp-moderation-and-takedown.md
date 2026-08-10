# Plum MVP 审核、运营后台与下架能力

> 文档编号：HANDOFF-07
> 状态：MVP 产品讨论基线，不是最终 API 或数据库合同
> 更新日期：2026-08-10
> 关联文档：[HANDOFF-05](./HANDOFF-05-create-v1-server-integration.md) · [HANDOFF-06](./HANDOFF-06-create-post-v1-research-backlog.md)

## 1. 已确认方向

Plum 的第一版审核能力保持简单：

1. 服务端必须支持角色待审核、可用和已下架状态，并在所有消费者与 Runtime 路径强制执行。
2. 前端能够展示角色正在审核或已经下架，不能继续把角色表现为正常可聊。
3. 提供一个内部角色管理／运营后台，让授权审核员查看角色内容并执行人审。
4. MVP 先由人判断并审批或下架；自动分类、风险评分和综合审核策略以后插入人审之前。
5. 审核与发布是独立产品能力，不复用当前 Create 页的表单完整性提示冒充审核结果。

## 2. MVP 推荐流程

```text
Creator draft
  → Submit for review
  → Pending review（不公开、不进入 Runtime）
      ├─ Approve → Active
      └─ Take down → Taken down

Active
  → 审核员、举报或后续策略发现问题
  → Taken down

Taken down
  → 内部复核 / 创作者后续修改流程（下一阶段再详细设计）
```

### 为什么推荐先审后公开

“创建后立即公开，再等待审核员下架”属于后置审核。它实现更快，但在审核完成前，内容可能已经：

- 出现在 Feed、搜索、推荐和分享链接。
- 被用户查看、收藏或开始聊天。
- 作为 Character Settings 或 Opening Scene 进入模型上下文。
- 产生模型输出、日志、缓存和历史会话。

在没有自动审核层时，MVP 最稳妥的底线是：**Public 角色先进入 Pending review，人审通过后才 Active。**内部运营预埋内容可以由具备权限的员工完成快速审批，但不应通过隐藏的前端参数绕过服务端状态。

如果业务明确选择“先上线后人审”，必须把它记录成风险接受决定，并定义最长暴露时间、优先队列、紧急下架和事后影响范围；不能把模型自身拒答当作补偿控制。

## 3. 最小状态

MVP 可以先用一个面向可用性的审核状态，草稿 revision 与审核状态分开保存：

| 状态 | 消费者页面 | Feed / 搜索 / 推荐 | 新建会话 | 已有会话继续发送 | 运营后台 |
| --- | --- | --- | --- | --- | --- |
| `pending_review` | 创作者看到 Pending review；普通用户不可见 | 排除 | 禁止 | 禁止 | 可审批或下架 |
| `active` | 正常展示 | 根据 Visibility 决定 | 允许 | 允许 | 可下架 |
| `taken_down` | 展示统一的不可用状态 | 排除并清缓存 | 禁止 | 禁止，历史只读 | 可查看原因和复核 |

建议不要删除已下架角色的数据库记录。下架需要保留内容快照、操作人、时间和原因，以便复核、申诉和追踪已有会话。

### 前端文案

消费者端不暴露内部审核细节，首版可以统一显示：

> This character is unavailable.

创作者自己的管理页可以显示：

- Pending review
- Active
- Taken down
- 安全处理过的原因分类，例如 `Image policy`、`Character content`、`Rights issue`

是否展示详细原因、允许修改后重提和申诉，后续专项讨论。

## 4. 下架必须在哪里生效

下架不能只是隐藏一个前端卡片。后端必须在下列路径统一校验角色状态：

- Feed、Trending、Latest、Popular、Following。
- 搜索、标签筛选、推荐和分享链接。
- 角色详情和公开 DTO。
- 创建新会话。
- 已有会话发送新消息。
- Runtime 加载 Character Settings、Example Dialogues、Response rules 和 Opening Scene。
- 后台任务、缓存重建和索引同步。

推荐返回稳定错误，例如 `character_unavailable`，但消费者响应不返回内部审核笔记、审核员信息或敏感证据。

已有聊天建议保留历史为只读，并在输入框位置展示角色不可用。直接删除历史会导致用户困惑，也会破坏审计；是否允许用户导出或删除自己的历史可以另行讨论。

## 5. 运营后台 MVP

### 5.1 最小页面

一个角色列表和一个角色审核详情页即可，不需要先建设完整 CMS。

角色列表至少展示：

- Character ID、角色名称和缩略图。
- 创作者 ID / 显示名。
- 创建时间、提交时间和当前状态。
- Visibility、Limited / Limitless。
- Pending review、Active、Taken down 筛选。
- 按 Character ID、角色名称或创作者 ID 搜索。

审核详情至少展示：

- Portrait 原图标准化预览和头像裁切结果。
- Name、Gender、Character Intro、Opening Scene。
- Character Settings、Example Dialogues、Response rules。
- Tags、Content rating、Visibility 和用户确认项。
- 当前 revision 或审核内容快照，避免审核员看的内容与最终生效内容不同。
- 创作者基础信息和该角色过去的审核动作。

### 5.2 最小动作

- Approve：从 Pending review 变为 Active。
- Take down：从 Pending review 或 Active 变为 Taken down。
- Restore to review：误操作或复核后回到 Pending review；不建议直接恢复 Active。
- 填写标准原因分类，可选内部备注。

即使是 MVP，也应保留：

- `reviewed_by`
- `reviewed_at`
- `reason_code`
- 内部备注
- 操作前状态和操作后状态
- 被审核的内容 revision / snapshot ID

这些数据是最小审计日志，不等于建设复杂审核系统。

### 5.3 最小安全要求

- 运营后台使用独立的员工权限或明确 RBAC，普通 Plum 用户会话不能访问。
- 所有审批、下架和恢复操作必须由服务端鉴权。
- 操作需要 CSRF、防重复提交和幂等保护。
- 两名审核员同时操作时，使用 revision 或状态条件更新，避免后提交者静默覆盖。
- 日志不得把完整私有人设和图片二进制复制到普通应用日志。
- 生产后台不能通过猜测 URL 访问，且不应暴露在普通导航中。

## 6. 用户输入能否直接交给 AI

结论：**不能把模型的内生安全当成平台的底线安全边界。**模型拒答和供应商安全训练可以作为纵深防御的一层，但不能替代输入审核、权限、状态校验、输出控制和人审。

原因包括：

1. 用户可以在 Character Settings、Opening Scene、Example Dialogues、导入文件甚至图片文字中放入提示注入或越狱指令。
2. 模型安全能力会随模型、版本、语言、上下文和提供商改变，不能作为稳定业务合同。
3. 模型的安全政策不一定等于 Plum 的角色上架规则、版权规则、未成年人规则和运营判断。
4. 模型可能漏放，也可能过度拒绝；两种情况都会造成不可控的产品体验。
5. 模型只控制自己的回复，不能阻止违规图片已经公开、侵权内容已经存储或已下架角色仍被 API 读取。
6. 角色固定设定即使经过审核，用户之后发送的实时聊天消息和模型输出仍是新的风险面。

OWASP 将 Prompt Injection 和 Overreliance 都列为 LLM 应用的重要风险，并明确外部文件等不可信内容也可能形成间接提示注入。NIST 的生成式 AI 风险框架同样建议采用内容审核、独立评估、持续监控、人类监督和业务规则，而不是只依赖基础模型。

## 7. MVP 的模型调用边界

### 7.1 角色图片

当前 Portrait 只服务于封面和头像，不影响角色回复，因此**没有必要把图片发送给聊天模型**。不发送是最简单也最可靠的数据最小化措施。

未来如果需要从图片提取外貌、做图生图或让多模态模型理解形象，再单独加入：图片审核、OCR 文本检查、权限确认、用途告知和专用调用链。

### 7.2 角色文本

Character Settings、Opening Scene、Example Dialogues 和 Response rules 会影响回复，应被当作“不可信创作者数据”，而不是系统指令本身。

MVP 至少做到：

- 只有 `active` 角色可以被 Runtime 加载。
- 在 Prompt 结构中明确区分平台 System rules 与创作者内容。
- 平台底线规则位于更高优先级，创作者不能通过 Response rules 覆盖。
- 权限、下架、金币、数据访问和工具调用由后端代码决定，不让模型自行授权。
- 不向模型提供与当前回复无关的后台字段、审核备注或用户隐私。
- 针对每次模型升级运行一组固定越狱、成人内容、未成年人、仇恨、自伤和隐私泄露评测。

仅靠“用 XML 标签包住创作者内容”或“在 System Prompt 里写不要听从它”不能彻底解决提示注入，只能减少误解。

### 7.3 实时聊天输入与输出

角色人审只审核固定角色内容，不审核之后每一句用户消息。未来自动安全链应分别覆盖：

```text
User message
  → 输入分类 / 业务规则
  → 允许的 Active character prompt
  → Chat model
  → 输出分类 / 业务规则
  → Consumer
```

MVP 如果暂时没有独立自动分类器，可以先使用供应商安全能力加平台 System rules，并做限流、日志告警和人工抽样，但应把它记录为临时风险，而不是“已经安全”。对于平台明确不能处理的高风险内容，仍应在进入主模型前阻断。

## 8. 后续自动审核策略

未来在“提交”和“人审队列”之间增加策略层：

```text
Submit
  → 文件和字段硬校验
  → 文本 / 图片 / OCR 分类
  → 规则与风险评分
      ├─ 明确安全：低优先级人审或按策略放行
      ├─ 不确定：进入普通人审
      └─ 高风险：优先人审或自动阻断
  → Human review
```

可逐步加入：

- 文本与图片内容分类。
- 图片 OCR 后再次检查文字。
- 未成年人、裸露、色情、暴力、自伤、仇恨和隐私风险。
- 已知违规媒体哈希、重复角色和批量垃圾内容。
- 版权、公众人物和声音授权线索。
- 创作者历史风险、重复违规和速率异常。
- 多语言识别与审核辅助翻译。
- 模型辅助摘要和风险提示，但最终人审不能只看 AI 摘要。
- 举报进入复审队列。
- 审核采样、准确率、误杀率、漏放率和处理时长。

自动策略的输出应是风险信号和队列路由，不应未经评估就把某个通用聊天模型的“看起来没问题”当作自动批准。

## 9. 之后再讨论的运营能力

- 审核任务分配、锁定和认领。
- 优先级、SLA 和紧急队列。
- 批量审核与批量下架。
- 创作者修改后重新提交。
- 申诉、复核和恢复。
- 用户举报和证据展示。
- 创作者警告、限制创建或封禁。
- 规则版本和不同国家／地区政策。
- 审核员质量抽检与权限分级。
- 审核数据报表、策略效果和误杀／漏放分析。
- 已有会话、收藏、分享和推荐缓存的精细处置。

## 10. MVP 验收重点

- Pending review 角色不会进入 Feed、搜索、推荐、详情或 Runtime。
- 审核员可以在内部后台查看一次提交的完整审核快照。
- Approve 后角色按照 Visibility 正常可用。
- Take down 后所有发现入口立即排除角色，缓存与索引最终一致。
- 已下架角色不能创建新会话，也不能在已有会话继续发送。
- 消费者看到统一不可用提示；内部原因和私有人设不会泄漏。
- 所有审批、下架和恢复动作有操作人、时间、原因和前后状态。
- 非审核员无法读取后台数据或调用审核接口。
- 重复动作安全、并发审核不会静默覆盖。
- Runtime 不发送纯展示用 Portrait 给聊天模型。

## 11. 参考安全资料

- [OWASP Top 10 for LLM Applications 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)
- [NIST AI RMF: Generative Artificial Intelligence Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
- [OpenAI Guardrails：输入与输出防护示例](https://guardrails.openai.com/)
