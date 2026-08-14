# Plum Create V1 前后端联调需求

> 文档编号：HANDOFF-05
> 状态：草稿与媒体联调评审稿，不是最终数据库设计
> 更新日期：2026-08-10
> 前端页面：`/create/v1`
> 关联文档：[HANDOFF-04](./HANDOFF-04-create-prototype-decisions.md) · [HANDOFF-06](./HANDOFF-06-create-post-v1-research-backlog.md) · [HANDOFF-07](./HANDOFF-07-mvp-moderation-and-takedown.md) · [COMPETITOR-TAG-REFERENCES](./COMPETITOR-TAG-REFERENCES.md) · [TECH-06](./TECH-06-data-ownership-and-backend-plan.md)

> **2026-08-10 范围决定：**审核与发布流程将作为独立产品议题重新设计。本文只确认 Create V1 表单、草稿、媒体和字段语义；文中出现的 `Create`、Public / Private 和确认项只代表当前 UI 收集的信息，不构成审核状态机、发布端点、上线门槛、拒绝／申诉或下架流程的正式合同。服务端不得依据本文先行固化这些流程。

## 1. 目的与边界

本文用于让 Plum Create V1 前端与服务端对齐字段、草稿、图片、标签和错误处理，作为基础接口设计与联调验收的共同基线。审核、发布和上线后的治理流程不在本文定稿。

文档包含两类内容：

- **已确认需求**：来自当前产品讨论，前后端实现不得自行改变。
- **建议方案 / 待确认项**：帮助服务端起步，但不规定最终表名、ORM 模型或代码分层；双方确认后才能成为正式 API 合同。

Create V1 首期只提供**单角色创建 UI**。服务端和数据库不能因此永久固化为“一个作品只能有一个角色”，但首期也不要求提前实现多角色 UI、世界书或用户身份等完整能力。

当前 `/create/v1` 同时保留浏览器自动恢复和正式服务端草稿。`Save draft` 通过 `POST/PATCH /creator/works` 保存不完整快照；`Publish` 先保存最新 revision，再调用 `POST /creator/works/{work_id}/publish` 提交同一快照审核。默认审核适配器尚未配置时发布失败关闭，但服务端草稿保持可恢复。

## 2. 已确认的产品决定

### 2.1 首期能力

- 一次创建一个角色。
- 用户先填写角色名称，再上传一张角色立绘。
- 支持上传 JPG / JPEG、PNG、WebP、HEIC / HEIF 静态图片。
- 首期不支持 AVIF、GIF、BMP、TIFF、视频或其他动态图片。
- 头像不单独上传，由立绘裁切生成；用户通过拖动立绘调整圆形头像取景位置。
- 提供 Character Intro、Opening Scene、Character Settings。
- More Settings 只保留 Example Dialogues 与 Response rules，均为选填。
- Tags 必须从服务端给出的受控选项中多选，不允许自由输入；至少选 1 个，当前页面上限为 5 个。
- Content rating 只提供 Limited / Limitless。
- Visibility 只提供 Public / Private。
- 当前 Create UI 要求用户确认角色为 18 岁或以上，并确认拥有图片和内容的使用权；确认记录如何参与审核、发布和法律留痕，留待审核发布专项设计。

### 2.2 明确不在首期范围

- 多角色创建 UI。
- 用户身份 / Persona 创建。
- Voice、声音上传、选择、克隆。
- 对话测试。
- 对话风格预设。
- 独立回复长度、主动程度控件。
- AI 图片生成。
- GIF、MP4 或其他动态角色形象。
- 小说解析的服务端实现。
- 最终世界书和正式多角色数据结构。

### 2.3 创建规则文案

前端保留下列原文，不改写：

> **Character creation rules:** All depicted characters must be adults aged 18 or older. Do not upload nudity, sexually explicit content, unedited low-quality images, or images you do not own or have permission to use. Violations may block or remove public display.

该确认只是用户声明，不能替代服务端格式校验、内容审核、权限校验和后续下架能力。

## 3. 字段清单

### 3.1 正式字段语义

| UI 字段 | 建议 API 字段 | Create 表单完整度 | 当前前端限制 | 消费者可见性 | 是否参与角色回复 |
| --- | --- | --- | --- | --- | --- |
| Name | `name` | 必填 | 1～50 字符 | 首页卡片、聊天等公开界面 | 需要进入角色上下文 |
| Gender | `gender` | 必填 | `male` / `female` / `non_binary` | 当前卡片不展示；是否用于筛选待确认 | 是否注入模型上下文待确认 |
| Portrait | `portrait_media_id` | 必填且只能 1 张 | JPG / JPEG、PNG、WebP、HEIC / HEIF；最终大小限制待确认 | 角色封面及头像来源 | 否 |
| Avatar crop | `avatar_crop` | 有立绘时必有默认值 | `x`、`y` 均为 0～100，默认 50 | 头像展示 | 否 |
| Character Intro | `character_intro` | 必填 | 1～500 字符 | 首页角色卡及未来公开资料 | 默认不作为核心私有人设；是否进入 Prompt 待确认 |
| Opening Scene | `opening_scene` | 必填 | 1～2000 字符 | 进入真实聊天时作为开场内容；首页卡片不展示 | 作为会话开场，不应每轮重复注入 |
| Character Settings | `character_settings` | 必填 | 1～5000 字符 | 不直接公开 | 是，核心角色设定 |
| Example Dialogues | `example_dialogues` | 选填 | 0～4000 字符 | 不直接公开 | 是，用于稳定说话方式和反应方式 |
| Response rules | `response_rules` | 选填 | 原型暂未限制；正式上限待确认 | 不直接公开 | 是，作为回复约束 |
| Tags | `tag_ids` | 至少 1 个 | 最多 5 个；只接受有效 ID | 首页卡片、搜索和推荐 | 否 |
| Content rating | `content_rating` | 必填 | `limited` / `limitless` | 可用于展示、访问控制和发现 | 不应被理解为绕过平台安全规则 |
| Visibility | `visibility` | 必填 | `public` / `private` | 表达期望发现范围；实际生效规则待专项设计 | 否 |
| Adult confirmation | `adult_confirmed` | 必须为 `true` | 正式记录方式待审核发布专项设计 | 不展示 | 否 |
| Rights confirmation | `rights_confirmed` | 必须为 `true` | 正式记录方式待审核发布专项设计 | 不展示 | 否 |

说明：

- “必填”只指当前 Create 表单的完整度规则，不代表已经满足未来审核或发布条件。草稿保存必须允许字段不完整。
- 字段长度来自当前前端原型，是首轮联调基线；尤其是 `response_rules` 上限仍需双方确认。
- API 枚举建议统一使用小写稳定值；前端负责显示 `Limited`、`Non-binary` 等英文标签。
- 所有字符串在服务端校验前应进行首尾空白处理；只包含空白的必填字段视为未填写。

### 3.2 公开数据与私有模型数据

| 数据层级 | 字段 | 约束 |
| --- | --- | --- |
| 公开发现数据 | Name、Portrait、Avatar crop、Character Intro、Tags、Content rating、Visibility | 可以进入角色公开 DTO；Private 角色不得进入公共 Feed、搜索或推荐 |
| 会话入口数据 | Opening Scene | 用户进入该角色真实聊天时可见，但不在 Create V1 首页卡片预览中展示 |
| 结构化角色元数据 | Gender | 当前消费者卡片不展示；是否进入筛选 API、公开详情或 Prompt 需另行确认 |
| 私有模型上下文 | Character Settings、Example Dialogues、Response rules | 不得出现在 Feed、公开详情、日志明文、分析事件或前端消费者 DTO 中 |
| 合规记录 | 两项确认、规则版本、确认时间、确认用户 | 仅供服务端审计，不属于公开角色资料 |

服务端不得把“前端不展示”当作安全边界。公开角色 DTO 和创作者编辑 DTO 应使用不同响应模型，避免私有人设被序列化后仅靠 CSS 隐藏。

## 4. 建议的资源模型（待服务端确认）

### 4.1 为什么建议保留作品层

首期页面虽然只创建一个角色，但长期方向包括多角色、世界和关系。建议服务端内部保留下面的最小关系：

```text
Work / Creation
  ├─ Character 1（V1 唯一角色，也是 primary character）
  ├─ Character 2...（未来）
  ├─ Work ↔ Character relation / ordering（未来可扩展）
  └─ World / relationship / user persona（未来，不在首期建空接口）
```

V1 可以只接受一个 `characters` 元素或只暴露一个 `character` 字段，但数据库迁移不能依赖 `work.character_id` 永远唯一。建议使用作品与角色关联或等价的可扩展关系，并支持 `primary_character_id`。

当前已选择 `/creator/works` 作为创作者资源主语；V1 每个 Work 只有一个主要角色，但合同不把 Work 永久等同于 Character。

### 4.2 建议端点

所有端点沿用 Plum 前缀：

```text
/api/v1/products/plum
```

建议资源：

| 方法与路径 | 用途 | 首期必要性 |
| --- | --- | --- |
| `POST /creator/works` | 创建空白服务端草稿，返回 `work_id`、首个 `character_id` 和 revision | 必要 |
| `GET /creator/works/{work_id}` | 恢复创作者草稿或读取最新编辑状态 | 必要 |
| `PATCH /creator/works/{work_id}` | 保存部分或完整草稿快照 | 必要 |
| `POST /creator/works/{work_id}/publish` | 审核与发布专项设计后再确定；当前不实施、不冻结路径 | 不在本次范围 |
| `GET /creator/works?status=draft` | Draft Box 列表 | 可后置；若不做，前端首期只记录当前 `work_id` |
| `DELETE /creator/works/{work_id}` | 放弃未发布草稿 | 可后置；需明确媒体回收语义 |
| `POST /creator/media/uploads` | 上传一张角色立绘 | 必要 |
| `GET /creator/tags?locale=en-US` | 返回可选标签和本地化显示名 | 必要 |

端点命名已确认使用 `/creator/works`。旧的直接创建角色入口不再公开挂载，避免绕过草稿 revision 与 Publish 审核流程。

## 5. 草稿生命周期与审核发布边界

### 5.1 本文已确认

- 草稿可以不完整，前端的星号和 `Create` 按钮只表达当前表单完整度。
- 服务端保存草稿时仍需校验字段类型、长度、枚举、媒体所有权和标签有效性，但不能把“字段完整”直接等同于“可以发布”。
- `visibility` 是创作者意图，不代表内容已经公开、通过审核或进入 Feed。
- 保存草稿不得自动触发审核、公开展示、Runtime 创建或真实聊天。

### 5.2 明确留待专项设计

以下内容不在本文决定：

- 发布端点及请求／响应结构。
- 草稿、提交、审核中、通过、拒绝、下架和归档等状态模型。
- Public / Private 的审核差异，以及 Private 何时允许创作者聊天。
- 已发布内容编辑、版本切换、重新审核和历史会话绑定。
- 审核拒绝原因、修改后重提、申诉和运营后台流程。
- 审核通过后何时进入 Feed、搜索、推荐和 Runtime。

数据模型仍应避免用一个不可扩展的布尔值同时表达草稿、审核、可见性和发现状态，但具体字段与枚举必须等专项设计完成后再定。

## 6. 图片上传与头像裁切合同

### 6.1 上传流程

建议采用两阶段流程：

1. 前端用 `multipart/form-data` 上传立绘，服务端校验真实文件内容并返回不透明 `media_id`。
2. 前端在草稿中保存 `portrait_media_id` 和 `avatar_crop`；服务端在同一事务或可靠补偿流程中把媒体标记为已引用。

建议请求：

```http
POST /api/v1/products/plum/creator/media/uploads
Content-Type: multipart/form-data
X-Plum-CSRF: <token>

file=<binary>
kind=image
purpose=character_portrait
```

建议响应：

```json
{
  "status": "ok",
  "media": {
    "media_id": "mda_example",
    "mime": "image/jpeg",
    "bytes": 1234567,
    "width": 1200,
    "height": 1800,
    "preview_url": "/api/v1/products/plum/creator/media/mda_example",
    "pending_expires_at": "2026-08-10T20:00:00+08:00"
  }
}
```

当前 `preview_url` 是登录创作者 owner-only 的同源读取地址；跨账号读取统一返回 404。它可以用于草稿预览，但媒体持久化身份只能使用 `media_id`，未来切换签名 URL 或 CDN 时不改变数据合同。

### 6.2 服务端校验

- 不信任文件扩展名或客户端 `Content-Type`，必须解码真实字节。
- 上传源格式只接受 JPEG、PNG、WebP、HEIC / HEIF 静态图片；拒绝 AVIF、GIF、BMP、TIFF、视频、损坏文件和伪造格式。
- 应处理 EXIF Orientation，并剥离 EXIF/GPS 等不必要元数据。
- 服务端必须负责 WebP、HEIC / HEIF 的解码和标准化，前端不承担转码正确性或浏览器兼容性责任。
- 不透明图片建议标准化为 JPEG；包含透明通道的 PNG / WebP 应标准化为 PNG，并保留透明通道。
- HEIC / HEIF 原始文件不作为消费者读取或 CDN 分发文件永久保存；消费者和 Create 预览读取服务端返回的标准化 JPEG / PNG。
- 校验文件大小和像素上限，避免解压缩炸弹。
- 校验媒体所有权；其他用户的 `media_id`、不存在的 ID、已失效或用途不符的媒体统一拒绝。
- 替换立绘后，旧的未引用媒体应进入可回收状态，不能无限占用存储。
- 公共显示前必须经过适用的图片审核流程。

“支持上传格式”与“最终存储 / 分发格式”是两层合同：用户可以上传 JPEG、PNG、WebP、HEIC / HEIF，服务端完成真实内容校验、方向修正、元数据清除和标准化后，消费者只读取标准化的 JPEG / PNG 资源。上传响应中的 `mime`、尺寸和预览地址均以标准化后的资源为准。

现有共享媒体基础设施已经具备不透明 `media_id`、所有权、pending/referenced、过期回收、图片解码和签名读取等能力。Create V1 已通过独立格式策略增加 WebP、HEIC / HEIF 解码与 JPEG / PNG 标准化，不改变其他产品原有 JPEG / PNG 上传白名单；部署和 CI 必须安装 `pillow-heif`。

当前前端不再设置独立字节上限，由后端共享配置暂按 8 MiB 拦截；这仍不是已经确认的最终产品合同，见第 16 节待确认项。

### 6.3 Avatar crop 语义

```json
{
  "x": 50,
  "y": 50
}
```

- `x`、`y` 是图片焦点在服务端规范化后图片坐标中的百分比，范围均为 `0..100`。
- 默认值为 `{ "x": 50, "y": 50 }`。
- 前端以 `object-fit: cover` 的圆形容器使用该焦点渲染头像。
- 更换立绘后必须重置为中心点。
- 服务端首期只需保存焦点，不必另外生成并持久化一张头像文件；消费者可使用同一立绘加 crop 参数渲染。若 CDN 后续生成缩略图，原始焦点仍应保留。

## 7. 标签合同

标签正式选项尚未确定。竞品参考仅记录在 [COMPETITOR-TAG-REFERENCES](./COMPETITOR-TAG-REFERENCES.md)，不能直接导入为 Plum 正式 taxonomy。

### 7.1 已确认约束

- 创建页只允许选择，不允许自由文本。
- Create 表单完整时至少选择 1 个，最多 5 个。
- 标签用于搜索、推荐和消费者发现。
- API 与数据库使用稳定、与语言无关的 tag ID，不能把翻译后的显示文案当主键。

### 7.2 建议读取响应

```json
{
  "status": "ok",
  "items": [
    {
      "id": "tag_romance",
      "label": "Romance",
      "category_id": "genre",
      "category_label": "Genre",
      "active": true,
      "sort_order": 10
    }
  ],
  "selection": {
    "min": 1,
    "max": 5
  },
  "taxonomy_version": "2026-08-01"
}
```

服务端保存时应验证每个 ID 存在、启用且可用于角色；前端传入重复项时可以规范化去重，但超过上限必须明确报错，不能静默截断。未来发布流程还需重新校验，具体错误合同另定。

## 8. 建议草稿请求与响应

下面是为讨论数据边界准备的示例，不代表最终 URL 和 envelope 已确认。

### 8.1 创建空白草稿

```http
POST /api/v1/products/plum/creator/works
Idempotency-Key: create_01J...
X-Plum-CSRF: <token>
```

```json
{
  "status": "ok",
  "work": {
    "id": "work_01J...",
    "revision": 1,
    "primary_character_id": "char_01J...",
    "characters": [
      {
        "id": "char_01J...",
        "position": 0
      }
    ],
    "created_at": "2026-08-10T16:00:00+08:00",
    "updated_at": "2026-08-10T16:00:00+08:00"
  }
}
```

### 8.2 保存草稿

```http
PATCH /api/v1/products/plum/creator/works/work_01J...
X-Plum-CSRF: <token>
Content-Type: application/json
```

```json
{
  "expected_revision": 1,
  "character": {
    "id": "char_01J...",
    "name": "Luna",
    "gender": "female",
    "portrait_media_id": "mda_example",
    "avatar_crop": { "x": 48, "y": 36 },
    "character_intro": "A stargazer with a secret she cannot outrun.",
    "opening_scene": "The observatory doors close behind you...",
    "character_settings": "Luna is observant, guarded, and...",
    "example_dialogues": "{{user}}: ...\n{{char}}: ...",
    "response_rules": "Never decide the user's actions."
  },
  "tag_ids": ["tag_romance", "tag_fantasy"],
  "content_rating": "limited",
  "visibility": "public",
  "adult_confirmed": true,
  "rights_confirmed": true
}
```

建议保存成功后返回完整规范化草稿和新的 revision，而不是只返回 `204`。这样前端可以以服务端裁剪、去重和默认值为权威：

```json
{
  "status": "ok",
  "work": {
    "id": "work_01J...",
    "revision": 2,
    "primary_character_id": "char_01J...",
    "character": {
      "id": "char_01J...",
      "name": "Luna",
      "gender": "female",
      "portrait": {
        "media_id": "mda_example",
        "url": "https://signed-or-cdn-url.example/...",
        "width": 1200,
        "height": 1800
      },
      "avatar_crop": { "x": 48, "y": 36 },
      "character_intro": "A stargazer with a secret she cannot outrun.",
      "opening_scene": "The observatory doors close behind you...",
      "character_settings": "Luna is observant, guarded, and...",
      "example_dialogues": "{{user}}: ...\n{{char}}: ...",
      "response_rules": "Never decide the user's actions."
    },
    "tag_ids": ["tag_romance", "tag_fantasy"],
    "content_rating": "limited",
    "visibility": "public",
    "adult_confirmed": true,
    "rights_confirmed": true,
    "updated_at": "2026-08-10T16:04:00+08:00"
  }
}
```

### 8.3 发布

完整审核与发布状态机仍按阶段扩展。当前前端 `Publish` 调用 `POST /creator/works/{work_id}/publish`，只提交已经保存的精确 revision。可插拔审核适配器可以返回 `pending_review / approved / rejected`：只有 `approved` 才原子生成公开角色；适配器未配置时返回 503，草稿保持不变。重提、申诉、下架和已发布版本切换仍等待后续专项设计。

## 9. Runtime / 聊天映射要求

创建成功后，角色必须形成可运行且可版本化的角色上下文。具体 Prompt 模板由服务端负责，前端不拼接 Runtime Prompt。

建议语义映射：

| Create 字段 | Runtime 用途 |
| --- | --- |
| Name | 角色名称及上下文身份 |
| Character Settings | 角色核心设定、背景、目标、边界和与用户的关系 |
| Example Dialogues | 风格示例，不应作为真实历史消息落库 |
| Response rules | 回复行为约束 |
| Opening Scene | 新会话的初始场景 / Greeting，只在正确的会话初始化位置使用 |
| Gender | 是否作为结构化上下文输入待确认 |
| Character Intro | 首要用途是公开介绍；是否同时注入 Prompt 待确认，不能由前端自行重复拼接 |

必须避免：

- 把 Character Settings、Example Dialogues、Response rules 返回给消费者端。
- 把 Opening Scene 在每一轮消息中重复注入。
- 把 Example Dialogues 写成用户真实聊天历史。
- 编辑草稿时无版本地改变正在进行的历史会话。
- 让 Limitless 绕过产品级或平台级安全规则。

## 10. 鉴权、CSRF、所有权与幂等

- 所有创作者写接口必须登录，并继续使用 Plum product-scoped session。
- 与现有 `lib/api.ts` 一致：同源 Cookie，非 GET 请求携带 `X-Plum-CSRF`。
- 服务端从 session 解析 owner，不能接受前端传入 `owner_user_id`。
- `GET/PATCH/delete` 都必须校验作品所有权；未来发布接口同样必须遵守所有权隔离，对非 owner 建议统一返回 `404`，避免枚举资源。
- 创建草稿使用 `Idempotency-Key` 或等价的稳定请求 ID，重复提交不能创建多个角色；发布幂等语义留待专项设计。
- 草稿保存使用 `revision` / ETag 乐观并发控制。revision 不匹配返回 `409 draft_revision_conflict`，并带当前 revision，避免两个标签页静默覆盖。
- 日志不得记录 Character Settings、Example Dialogues、Response rules、完整 Opening Scene 或上传图片二进制。

## 11. 校验与错误合同

当前 Plum 前端只读取 FastAPI 风格的 `payload.detail` 字符串。首期建议继续保留稳定的 `detail` 错误码；如需字段级提示，可增加 `field_errors`，前端再扩展类型。

建议形状：

```json
{
  "detail": "draft_validation_failed",
  "field_errors": [
    { "field": "character.opening_scene", "code": "required" },
    { "field": "tag_ids", "code": "min_items", "limit": 1 }
  ]
}
```

建议错误码：

| HTTP | `detail` | 使用场景 |
| ---: | --- | --- |
| 400 | `invalid_request` | 请求结构或枚举不合法，且不适合字段级校验 |
| 401 | `authentication_required` / `session_expired` | 未登录或会话失效 |
| 403 | `csrf_validation_failed` | CSRF 校验失败 |
| 404 | `creator_work_not_found` | 作品不存在或当前用户无权访问 |
| 409 | `draft_revision_conflict` | 保存基于过期 revision |
| 413 | `media_too_large` | 图片超过字节或像素限制 |
| 415 | `media_kind_unsupported` | 非 JPEG / PNG / WebP / HEIC / HEIF 静态图片 |
| 422 | `draft_validation_failed` | 草稿中已提供字段的类型、长度或枚举不合法 |
| 422 | `tag_invalid` | 标签不存在、停用、重复或超过数量限制 |
| 422 | `media_ref_invalid` | 媒体不存在、不属于用户、已过期或用途不符 |
| 429 | `rate_limited` | 上传或写接口频率受限 |
| 503 | `plum_disabled` / `media_unavailable` | 产品或媒体能力不可用 |

格式校验必须存在于保存逻辑，未来发布时还要重新执行，但错误码由专项设计确定。保存草稿允许“缺字段”，但不应允许超长值、非法枚举、越界 crop、其他用户媒体引用或无效 tag ID 进入数据库。

## 12. 前端从本地草稿迁移

当前浏览器草稿 key：

```text
plum.create.v1.single-character
```

现有字段到正式 API 的映射：

| LocalStorage | API |
| --- | --- |
| `name` | `character.name` |
| `gender` | `character.gender` |
| `intro` | `character.character_intro` |
| `opening` | `character.opening_scene` |
| `characterSettings` | `character.character_settings` |
| `examples` | `character.example_dialogues` |
| `replyRules` | `character.response_rules` |
| `image` | 新上传时保存 owner-only `preview_url`；旧草稿可能仍是 Data URL，不得塞进 JSON 草稿接口 |
| `portraitMediaId` | `character.portrait_media_id` |
| `avatarPositionX/Y` | `character.avatar_crop.x/y` |
| `rating` | 小写后写入 `content_rating` |
| `visibility` | 小写后写入 `visibility` |
| `tags` | 需要映射成正式 `tag_ids`；不能把旧显示文案直接当 ID |
| `adultConfirmed` | `adult_confirmed` |
| `rightsConfirmed` | `rights_confirmed` |

建议迁移顺序：

1. 用户登录后创建服务端空草稿。
2. 新上传图片已经直接取得 `media_id`；仅旧 Data URL 草稿需要转换为文件后迁移上传。
3. 从服务端标签列表映射旧标签；无法唯一映射的标签要求用户重新选择。
4. 保存完整草稿并取得新 revision。
5. 服务端确认成功后再记录 `server_work_id`；不要在任何请求失败时删除本地草稿。
6. 联调稳定后，将服务端草稿作为权威；LocalStorage 只保留短期离线恢复信息和待同步标记。

服务端保存失败时，前端必须区分 `Saved locally` 与 `Synced`，不能继续显示“Auto-saved”让用户误以为已保存到账号。

## 13. Character card JSON / TXT 导入边界

当前只有 Character card JSON 在浏览器本地完成字段映射。TXT 和小说入口不得选择、读取或上传文件，也不得展示模拟解析结果。

后端仅预留 `POST /creator/imports/text` 合同，当前固定返回 HTTP `501` 和 `creator_text_import_not_implemented`，不读取文件内容、不解析、不持久化。前端当前不调用该接口。

未来 TXT/小说解析应使用独立异步任务：上传文件 → 解析候选角色、关系、世界信息和剧情节点 → 用户审核 → 写入作品；不属于本次联调。正式接入云服务前再按厂商手册对齐上传字段、任务字段和结果合同。

## 14. 多角色兼容约束

首期无需实现第二个角色，但下列约束应在数据与服务设计评审时满足：

- 作品能够在未来关联多个角色，而不是只能保存一组固定的 `character_*` 列。
- 每个角色拥有独立 Name、Gender、Portrait、Avatar crop、Intro、Settings、Opening Scene、Example Dialogues 和 Response rules。
- 作品能够指定一个主要角色，并保存角色顺序。
- 未来角色关系属于作品内关系，不应被硬塞进任一角色的公开简介。
- Feed 卡片和默认封面可以继续由主要角色投影，不要求首期消费者 API 立即暴露整个角色数组。
- 用户身份 / Persona 未来是作品下可选实体；首期不创建无意义空字段或占位接口。
- 世界书、世界信息和触发规则未来应有独立结构，不应把所有内容永久压进 Character Settings 一个大文本框。

## 15. 审核与发布专项记录

产品已决定把审核与发布作为独立流程设计，不在本联调文档中确定方案。MVP 的人审后台、状态、下架和 Runtime 阻断基线已经记录在 [HANDOFF-07](./HANDOFF-07-mvp-moderation-and-takedown.md)，后续专项还需要覆盖：

- 图片、公开文本、私有人设、Opening Scene、标签和导入内容分别审核什么。
- 自动审核、人工审核和运营复核的关系。
- Public / Private 是否采用不同的提交、可聊天和发现规则。
- 同步与异步审核反馈，以及前端如何展示真实状态。
- 拒绝原因、可编辑范围、重新提交、申诉和下架。
- 已发布版本更新、Runtime 切换、已有会话和 Feed 缓存如何处理。
- 用户声明、规则版本、审核证据和操作日志如何留存。

在专项完成前，只能实现草稿与媒体基础能力；不能把本文过去的流程示例或当前原型弹窗当作正式审核发布需求。

## 16. 联调前必须确认的问题

### P0：阻塞正式接口

1. 已确认资源主语使用 `/creator/works`；后续多角色扩展沿 Work → Characters 关系演进。
2. 标签 taxonomy、稳定 ID、分组、排序与首批英文显示文案。
3. 图片正式字节上限；当前实现暂用共享媒体的 8 MiB 配置。
4. `response_rules` 的正式字符上限。
5. Gender 是否进入公开 DTO、Feed 筛选和 Runtime Prompt。
6. Character Intro 是否只用于公开介绍，还是也由服务端注入角色上下文。

### P1：不阻塞基础 CRUD，但应在后续迭代确认

1. 是否首期提供 Draft Box 列表、删除草稿和编辑已有草稿。
2. 自动保存节流时间、离线冲突提示及多标签页冲突 UI。
3. 替换 / 删除立绘后旧媒体的引用解绑和回收时机。
4. Private 角色是否允许分享链接；当前 V1 只有 Public / Private，没有 Unlisted。

以下问题不再归入本联调 P0 / P1，而是进入审核发布专项：Public / Private 的审核差异、可聊天时机、拒绝与申诉、发布幂等、Runtime 激活、版本切换、已有会话和发现状态。

## 17. 建议实施与验收顺序

### 阶段 A：先锁定合同

1. 确认第 16 节中与草稿、字段、标签和媒体有关的 P0 问题。
2. 固化枚举、长度、错误码和响应 envelope。
3. 输出 OpenAPI / Pydantic DTO，并让前端生成或手写对应 TypeScript 类型。

### 阶段 B：后端最小闭环

1. 创建和读取不完整草稿。
2. 带 revision 保存草稿。
3. 图片上传、所有权、引用与回收。
4. 标签读取和服务端 tag ID 校验。
5. 不实现临时发布或审核状态机；等待审核发布专项合同。

### 阶段 C：前端接入

1. 在 `lib/api.ts` 增加 creator 类型和请求，不在组件中散落 `fetch`。
2. 把本地图片上传改为 `media_id`，并保留短期本地恢复。
3. 用服务端标签替换空的 `TAG_OPTIONS`。
4. 区分本地已保存、同步中、同步失败和已同步。
5. Save draft 不触发审核；Publish 只提交已保存的精确 revision。前端展示 `Under review / Published / Changes rejected`，审核不可用时保留服务端草稿且不展示虚假成功。

### My Studio V1

- `/studio` 列出当前 Member 的 active Work，展示与消费侧一致的立绘卡片及审核状态，不展示 Chat Now。
- Published 卡片点击封面进入聊天；Draft / Changes rejected 进入编辑；Under review 不开放聊天。
- More 菜单提供 Edit 和 Delete。Delete 必须二次确认，服务端执行软删除；已发布角色同时退出公开发现并禁止新聊天，历史会话保留。
- 已发布角色 Edit 保存为未发布修改；再次 Publish 生成不可变的下一 Character Version。审核完成前旧版本继续在线，已有聊天保持原版本绑定，新聊天在审核通过后使用新版本。
- 本地联调通过 `PLUM_CHARACTER_MODERATION_MOCK_STATUS=approved|pending_review|rejected` 选择确定性审核结果；该配置仅在 `local/development/test + PLUM_DEV_MODE` 生效，生产环境始终忽略。

### 阶段 D：验收测试

- 不完整草稿可以保存；完整度判断不会自动触发发布。
- 全部必填项完成后，前端与服务端的字段完整度判断一致。
- Name 50、Intro 500、Opening 2000、Settings 5000、Examples 4000 的边界值前后端一致。
- Gender 只接受三个稳定枚举。
- Tags 为 1～5 个有效 ID；重复、停用、未知和超量均有稳定错误。
- 真实 JPEG、PNG、WebP、HEIC、HEIF 均可上传，并返回浏览器可展示的标准化 JPEG / PNG 预览资源。
- iPhone 竖拍 HEIC / HEIF 的方向正确，EXIF、GPS 等隐私元数据已清除。
- 透明 PNG / WebP 标准化后透明通道不丢失；不透明图片可以标准化为 JPEG。
- 伪造扩展名、损坏文件、AVIF、GIF、BMP、TIFF、视频和超限图片均被稳定拒绝。
- 前端预览使用服务端返回的标准化资源地址，不依赖浏览器直接解码 HEIC / HEIF。
- Avatar crop 的 0、50、100 边界保存和恢复一致；换图后回到中心。
- 他人无法读取、修改或引用其他用户的草稿和媒体。
- 重复创建请求不会产生重复角色。
- 两个标签页用旧 revision 保存时返回冲突，不静默覆盖。
- 未进入未来正式发布流程的草稿不会进入 Feed、搜索、推荐或 Runtime。
- Feed 和消费者 DTO 不泄露 Character Settings、Example Dialogues、Response rules。
- Opening Scene 只在新会话初始化时出现，不在每一轮重复注入。
- Limited / Limitless 不改变平台安全底线。
- 刷新后能从服务端恢复草稿；断网或同步失败时本地内容不丢失。
- 现有首页、登录、聊天、钱包和会话 API 回归通过。

## 18. 本次联调完成定义

满足以下条件后，Create V1 才算完成基础前后端闭环：

1. 登录用户可以创建、保存并恢复一个单角色草稿；发布不属于本次完成定义。
2. 立绘通过正式媒体链路上传，头像焦点可保存和恢复。
3. 标签来自服务端稳定 ID，草稿保存校验以后端为权威。
4. 草稿不会因 `visibility` 选择而自动公开或创建 Runtime。
5. 私有字段不会泄漏到公开或消费者接口。
6. 重复请求、并发保存、媒体所有权和失败恢复有自动化测试。
7. 服务端实现说明能够解释未来多角色扩展路径，但首期没有提前实现无用的多角色 UI 和世界书能力。
