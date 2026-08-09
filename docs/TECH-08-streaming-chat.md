# Plum Chat 流式对话技术方案

> 文档编号：TECH-08
> 状态：开发中（当前阶段 S5）
> 日期：2026-08-08
> 适用范围：Plum Chat Web 第一版文本聊天，不包含图片、语音和思维链展示

## 1. 结论

Plum Chat 采用 **HTTP POST + Fetch ReadableStream + SSE 事件格式** 实现真实 LLM 流式回复。

- 前端使用 `fetch()` 发起 POST，通过 `response.body.getReader()` 读取事件流。
- 后端使用 FastAPI `StreamingResponse` 输出 `text/event-stream`。
- 不使用浏览器原生 `EventSource`，因为它不适合 POST、CSRF Header 和主动取消。
- 第一版不使用 WebSocket；当前是“一次用户请求对应一次 AI 回复”，HTTP streaming 足够。
- 保留现有同步 `/turns` 接口作为回滚通道，新增 `/turns/stream`。
- Provider 协议解析、工具调用、上下文、消息持久化、审核和取消属于共享 Human-AI Runtime。
- Plum 产品域只负责登录身份、会话归属、角色/Persona、模型档位、固定金币预占与结算，以及产品 API。
- 前端不接触厂商原始流格式，三种模型协议由后端统一成稳定的 Plum SSE 契约。

## 2. 目标与非目标

### 2.1 目标

- 用户发送后立即看到自己的消息和 AI 回复占位。
- LLM 产生可展示文本后持续增量渲染，而不是等待完整回复。
- 支持停止生成、错误提示、重新发送和同步接口回退。
- 模型切换继续真实生效，三档金币计费保持一致且不重复扣费。
- 断网、刷新、重复提交、Provider 错误不会产生重复消息或重复扣费。
- 桌面端和移动端共享流式数据层，但可以有不同布局和控件表现。
- 不削弱现有用户隔离、CSRF、审核、日志脱敏和 Runtime 复用边界。

### 2.2 第一版非目标

- 不做 WebSocket 和服务端主动消息推送。
- 不做断线后从指定 token/事件序号续传。
- 不展示模型思维链、reasoning token、工具参数或内部 Prompt。
- 不展示工具调用的完整执行过程；仅可显示通用“正在整理”等产品状态。
- 不允许一个会话并行生成多条 AI 回复。
- 不做多设备实时同步正在生成的半成品。
- 不按 token 计费，继续使用模型档位固定 1/3/5 金币。

## 3. 当前基线

当前前端已经具备：

- `sendTurn()` 同步 POST `/conversations/{id}/turns`。
- 用户消息乐观插入和 `pending/failed` UI。
- `client_message_id` 与 `idempotency_key` 共用一个 UUID。
- 发送期间禁止重复发送和切换模型。
- 完整回复返回后追加 AI 消息并更新钱包余额。

当前后端已经具备：

- Session、CSRF、用户和会话归属校验。
- 根据 conversation 的 `model_profile` 解析真实 Provider。
- 生成前按 idempotency key 预占固定金币。
- 生成失败释放预占，成功或重复请求保留费用。
- `run_product_turn()` 复用共享 Runtime 的上下文、工具、消息和记忆能力。
- OpenAI Chat、OpenAI Responses、Anthropic Messages 三种非流式适配。

当前缺口：

- LLM adapters 只支持完整 JSON，没有标准化流事件。
- `run_product_turn()` 是同步完成后返回，无法在最终回复生成期间向外发 delta。
- 前端通用 request helper 固定调用 `response.json()`。
- 代理链是否逐 chunk 刷新尚未形成自动验收门禁。
- 当前消息类型只有 `pending/failed` 布尔值，不能准确描述 streaming/cancelled 状态。

## 4. 对 Tipsy 的借鉴边界

对 Tipsy 公开 Web 页面的观察确认了以下可借鉴做法：

- 使用 Next.js App Router，并为聊天页独立分包。
- 桌面端和移动端存在独立组件树，而不只是同一 DOM 的 CSS 缩放。
- 输入、角色卡、Pinned、Inspiration、消息操作等围绕“当前生成状态”组织。
- 聊天体验高度符合“乐观用户消息 + AI 占位 + 增量更新”的状态模型。

Tipsy 的准确传输编码无法从未登录公开页面确认，SSE、NDJSON 和自定义分块仍属于推测。因此 Plum 只借鉴经过验证的交互原则，不依赖或复制其内部协议。

Plum 第一版重点借鉴：

- AI 消息使用稳定占位，不用独立的全局 loading 替换内容。
- 生成期间 Send 变为 Stop，用户可以明确终止。
- 自动滚动尊重用户阅读位置；用户主动向上滚动后不强制拉回底部。
- 模型、Restart 等会改变上下文的操作在生成期间锁定。
- 桌面和移动端共享状态机，各自决定控件布局。

## 5. 总体架构

```text
Browser
  POST /api/v1/products/plum/conversations/{id}/turns/stream
  Cookie + X-Plum-CSRF + client_message_id
      │
      ▼
Plum Product API
  auth / ownership / model profile / fixed coin reservation
      │
      ▼
Shared Human-AI Runtime
  inbound persistence / context / tools / moderation / finalization
      │
      ▼
Normalized LLM Streaming Adapter
  openai_chat | openai_responses | anthropic_messages
      │
      ▼
Provider streaming response

Normalized Runtime events
      │
      ▼
Plum SSE mapping → Next/nginx same-origin proxy → Browser state machine
```

### 5.1 模块边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Provider adapter | 厂商请求、SSE/分块解析、文本/tool/usage 归一化、关闭上游连接 | Plum 金币、角色业务 |
| Shared Runtime | 上下文、工具轮次、只输出最终可见文本、审核、消息持久化、取消、幂等 turn 状态 | Feed、角色资料、模型售价 |
| Plum backend | Session、会话归属、模型档位、固定金币、API 事件映射、功能开关 | 解析各厂商原始事件 |
| Plum frontend | 请求、解析 Plum SSE、消息状态、增量渲染、停止、滚动、错误恢复 | Provider 选择、最终扣费判断 |
| nginx/Next | 同源代理、禁用缓冲、超时 | 业务事件解释 |

## 6. API 与事件协议

### 6.1 Endpoint

```http
POST /api/v1/products/plum/conversations/{conversation_id}/turns/stream
Content-Type: application/json
Accept: text/event-stream
X-Plum-CSRF: <cookie value>
```

请求体沿用现有幂等字段：

```json
{
  "text": "你好",
  "client_message_id": "uuid",
  "idempotency_key": "uuid"
}
```

模型档位以服务端 conversation 当前值为准，不接受请求临时覆盖，避免前端显示档位、实际扣费档位和 Provider 不一致。

### 6.2 HTTP 错误与流内错误

在响应流尚未打开前，继续使用标准 HTTP JSON 错误：

- `401`：Session 无效。
- `402`：金币不足。
- `403`：CSRF 失败。
- `404`：会话不存在或不属于当前用户。
- `409`：同一会话已有生成、或该 idempotency key 已释放不可复用。
- `422`：消息为空或参数非法。
- `503`：模型档位或 Provider 不可用、流式功能关闭。

一旦已经返回 `200 text/event-stream`，后续错误必须通过 `turn.failed` 事件表达，不能再依赖 HTTP status。

### 6.3 SSE 格式

所有 `data` 都是单行 JSON，UTF-8 编码。事件之间用空行分隔：

```text
event: turn.accepted
data: {"version":1,"turn_id":"turn_x","request_id":"uuid","model_profile":"balanced","reserved_coins":3}

event: message.delta
data: {"version":1,"turn_id":"turn_x","seq":1,"text":"你好"}

event: message.delta
data: {"version":1,"turn_id":"turn_x","seq":2,"text":"，很高兴见到你。"}

event: turn.completed
data: {"version":1,"turn_id":"turn_x","message_id":"msg_x","finish_reason":"stop","charged_coins":3,"wallet":{"balance":997,"balance_micros":997000000,"unit":"shell"},"deduplicated":false}
```

第一版事件集：

| Event | 说明 | 必需字段 |
| --- | --- | --- |
| `turn.accepted` | 鉴权、模型和金币预占完成 | turn/request/model/reserved_coins |
| `turn.status` | 通用阶段提示，可用于“正在整理” | phase |
| `message.delta` | 最终用户可见回答的文本增量 | seq/text |
| `turn.usage` | 可观测信息，不参与前端扣费 | input/output tokens，可选 |
| `turn.completed` | 成功完成或已完成请求的幂等回放 | message/charged/wallet |
| `turn.cancelled` | 客户端停止或连接断开 | message_id 可选、charged/wallet |
| `turn.failed` | 流打开后的失败 | code/retryable/charged/wallet |
| `ping` | 15 秒无业务事件时保活 | server_time |

协议约束：

- 每条 `message.delta` 的 `seq` 单调递增。
- 不发送 reasoning、tool arguments、Prompt、密钥或 Provider 原始错误正文。
- `turn.completed/cancelled/failed` 只能出现一次，之后立即关闭连接。
- `turn.completed` 不重复返回全文，避免大消息复制；前端用累积 delta，必要时完成后 GET 权威历史。
- 幂等命中已完成请求时，可以发送一次 `turn.accepted`、一次包含完整文本的 `message.delta` 和一次 `turn.completed`，但不会再次调用模型或扣费。
- 事件协议带 `version: 1`；新增可选字段不升级版本，破坏性变更才升级。

## 7. 后端方案

### 7.1 Provider 流式适配

在共享 `app/agent_runtime/llm` 中增加归一化流接口，保留现有 `chat_completion()`：

```python
def chat_completion_stream(...) -> Iterator[LLMStreamEvent]:
    ...
```

内部事件至少包括：

```python
LLMStreamEvent(
    kind="text_delta | tool_delta | usage | completed | error",
    text="",
    tool_call=None,
    usage=None,
    finish_reason=None,
)
```

三种协议分别处理：

- `openai_chat`：请求 `stream=true`，解析 `choices[].delta` 和 usage。
- `openai_responses`：解析 `response.output_text.delta`、完成和 usage 事件。
- `anthropic_messages`：解析 `content_block_delta`、message stop 和 usage。

要求：

- 使用 `httpx.Client.stream()`，不能先读完整 body 再伪装流式。
- 分块解析必须容忍一个 JSON/SSE 事件跨多个 TCP chunk。
- Tool call 参数可能被拆成多个 delta，必须先在 Runtime 内组装，不能发给前端。
- Client 取消时关闭 response/client，尽量终止 Provider 计费和计算。
- Provider 配置增加 `supports_streaming`；不支持时同步执行并输出单个 delta，保证协议可用但标记降级指标。
- 当前三个真实 Provider/base URL 在编码前必须做一次流式能力 spike，不能只依据官方协议假设代理兼容。

### 7.2 Runtime turn 编排

新增共享入口：

```python
def run_product_turn_stream(
    ctx: ChannelTurnInput,
    *,
    product_services: ProductTurnServices,
    cancellation: CancellationToken,
) -> Iterator[RuntimeTurnEvent]:
    ...
```

实现原则：

- 不复制一份 Plum 专属 `run_product_turn()`。
- 把现有 turn 拆成可复用阶段：prepare → persist inbound → resolve/tool loop → visible answer stream → finalize。
- 同步和流式入口共享身份、上下文、工具、记忆、消息写入和 after-turn hooks。
- 只有最终自然语言回答可以产生 `visible_text_delta`。
- 工具选择、工具参数、工具结果和中间模型轮次全部留在 Runtime 内。
- 后台摘要、记忆写入和非主回复任务继续使用非流式接口，避免无意义改造。

第一版不逐 token 写数据库：

- 用户消息仍在 turn 开始时幂等保存一次。
- AI 文本在内存中累积。
- 成功、取消或失败终结时最多写一次 assistant 消息。
- 正常服务重启后从权威消息历史恢复，不尝试恢复半条 token 流。

### 7.3 运行状态记录

建议新增共享技术表 `runtime_turn_runs`，而不是 Plum 产品表：

| 字段 | 说明 |
| --- | --- |
| `id` | turn id |
| `app_id/account_id/session_id` | 产品和 Runtime 隔离范围 |
| `client_message_id/idempotency_key` | 请求幂等键 |
| `status` | accepted/running/completed/cancelled/failed/abandoned |
| `provider_id/model_ref` | 实际模型快照 |
| `assistant_message_id` | 最终或取消消息，可空 |
| `first_delta_at` | 是否已经向用户展示内容 |
| `finish_reason/error_code` | 终结信息，不存原始敏感错误 |
| `created_at/updated_at/completed_at` | 运维与超时回收 |

约束：

- `(app_id, account_id, idempotency_key)` 唯一。
- 一个 session 同时最多一个 `accepted/running` turn。
- PostgreSQL 和 SQLite migration 都必须覆盖。
- 只记录运行状态，不存每个 token。
- 超过 TTL 的 running turn 由幂等恢复任务标记 `abandoned`，并释放仍未结算的金币预占。

### 7.4 审核与安全输出

真实流式不能在完整回复生成后才决定前面文本是否展示，因此采用以下边界：

- Provider 中间 reasoning 和 tool 内容永不发送。
- 最终文本进入短缓冲区，按句末或约 20–80 字聚合后再发，不追求逐 token 闪烁。
- 每个待展示片段先经过共享的确定性 outbound 规则；命中阻断时不发送该片段，终止 turn 并释放费用。
- 完整文本终结后继续执行现有审核/抽检和 after-turn hooks。
- 如果未来要求更严格的“完整回复先审后展示”，应切换为服务端完整生成后客户端打字机效果；不要把伪流式冒充模型实时流式。

### 7.5 金币结算政策

沿用“先预占，后保留或释放”，并明确流式边界：

| 结果 | 是否扣费 | 部分文本处理 |
| --- | --- | --- |
| 正常完成 | 扣费一次 | 保存 completed assistant message |
| 幂等回放已完成请求 | 不再扣费 | 回放权威回复 |
| 金币不足/鉴权失败/Provider 启动前失败 | 不扣费 | 不产生 AI 消息 |
| Provider/服务端错误 | 释放费用 | partial 标记 failed，默认不进入后续上下文 |
| 用户在首个 delta 前停止 | 释放费用 | 不产生 AI 消息 |
| 用户在看到 delta 后主动停止 | 保留费用，防止读一半取消套利 | 保存 cancelled partial，可进入后续上下文 |
| 网络断开/刷新 | 按客户端取消处理 | 同上；记录 disconnect 原因 |
| 审核阻断 | 释放费用 | 不展示/不进入上下文 |

所有保留和释放继续使用固定 reservation idempotency key，任何重试都不能重复扣费或重复退款。

### 7.6 Plum API 层

Plum API 负责：

1. Session、CSRF、会话 owner 校验。
2. 读取 conversation 当前 `model_profile` 和 Provider 快照。
3. 检查功能开关和 Provider streaming capability。
4. 预占固定金币。
5. 构造与同步接口相同的 `ChannelTurnInput`。
6. 把 Runtime events 映射为 Plum SSE events。
7. 在 generator 的 `finally` 中处理取消、释放/保留、关闭上游和日志。
8. 完成后返回权威钱包余额。

不把 Feed、角色 Profile、点赞收藏等逻辑加入共享 Runtime。

## 8. 前端方案

### 8.1 API 客户端

保留现有 JSON `request<T>()`，单独增加：

```ts
sendTurnStream({
  conversationId,
  text,
  requestId,
  signal,
  onEvent,
}): Promise<void>
```

新增独立 SSE parser，必须处理：

- UTF-8 中文字符跨 chunk。
- 一条 SSE 事件跨多个 chunk。
- 一个 chunk 包含多条事件。
- `\r\n` 与 `\n`。
- 未知事件安全忽略并记录指标。
- 流关闭但没有终结事件时转为 `STREAM_TRUNCATED`。

### 8.2 消息状态机

将 `pending/failed` 布尔值升级为：

```ts
type MessageStatus =
  | "sending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed";
```

页面级生成状态：

```text
idle → submitting → streaming → completed → idle
                    ├→ cancelling → cancelled → idle
                    └→ failed → idle
```

发送流程：

1. 生成 request UUID。
2. 乐观插入用户消息。
3. 同时插入空的 assistant 占位，ID 为 `local-assistant:{requestId}`。
4. 收到 `turn.accepted` 后进入 streaming 状态。
5. `message.delta` 追加到该占位消息。
6. `turn.completed` 用服务端 message id 替换本地 ID并更新钱包。
7. `cancelled/failed` 更新消息状态；必要时 GET conversation 对账。

### 8.3 渲染性能

- 网络 delta 先写入 `useRef` buffer。
- 最多每个 `requestAnimationFrame` 合并更新一次 React state。
- 不对每个字符触发整页消息列表重渲染。
- 第一版继续纯文本展示；未来接 Markdown 时只对当前消息做增量解析或完成后完整解析。
- Desktop 和 Mobile 复用同一 hook，例如 `useStreamingTurn()`，不复制网络状态机。

### 8.4 交互细节

- Send 在 `submitting/streaming` 时变为 Stop。
- 模型切换、Restart 和新 turn 在生成期间禁用。
- 输入框可以继续编辑下一条草稿，但不能发送第二条。
- 用户接近底部时随 delta 自动滚动。
- 用户主动上滚后停止自动滚动，显示“回到最新消息”。
- Stop 点击后立即停止前端追加并触发 `AbortController.abort()`。
- 流失败时保留原用户输入，提供“重新发送”；重试必须使用新的 request id。
- `401` 继续走现有登录恢复；`402` 明确显示金币不足；其他错误使用可重试文案。

## 9. 代理和部署

生产链路为：

```text
Browser → nginx → Next.js → FastAPI → Provider
```

FastAPI 响应头：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

首选仍通过 Next rewrite。nginx 应为流式 endpoint 单独声明 location，不能只依赖普通页面 location 的默认缓冲行为：

```nginx
location ~ ^/api/v1/products/plum/conversations/[^/]+/turns/stream$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;

    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

普通 `/` location 继续代理到 Next。上面的流式 location 同样进入 Next，只是显式关闭 nginx 缓冲；Cookie 和 `X-Plum-CSRF` 会按原请求透传。

部署后必须使用真实 HTTPS 域名做“首个 delta 早于 completed”验收。先登录取得 `plum_session`/`plum_csrf`，创建 conversation，再执行（生产机为 Linux，`date +%s.%3N` 输出毫秒）：

```bash
curl --no-buffer --silent --show-error \
  -H 'Content-Type: application/json' \
  -H 'X-Plum-CSRF: <csrf-value>' \
  -H 'Cookie: plum_session=<session-value>; plum_csrf=<csrf-value>' \
  --data '{"text":"请用至少300字回答，以便验证流式传输","client_message_id":"proxy-probe-001","idempotency_key":"proxy-probe-001"}' \
  'https://plum.example.com/api/v1/products/plum/conversations/<conversation-id>/turns/stream' \
  | while IFS= read -r line; do printf '%s %s\n' "$(date +%s.%3N)" "$line"; done
```

验收记录必须包含 `turn.accepted`、第一个非空 `message.delta` 和 `turn.completed` 的时间；长回复至少出现 3 个 delta，且第一个 delta 明显早于 completed。每次探针使用新的两个 request id，避免命中幂等重放。

如果 Next runtime 或托管平台仍缓冲响应，有两个可选修复：

1. 增加专门的 Next Route Handler，以 streaming response 原样 pipe FastAPI。
2. 只将上述精确流式 location 的 `proxy_pass` 改为 `http://127.0.0.1:8180`，让 nginx 同源直代 FastAPI；其余 Plum API 仍走 Next。

方案 2 不改变浏览器 URL，Session Cookie 与 CSRF 校验仍是同源；必须继续透传 Host、Cookie、`X-Plum-CSRF` 和 `X-Forwarded-*`。禁止让浏览器跨域访问后端内网地址。

## 10. 功能开关与回滚

后端增加：

```dotenv
PLUM_CHAT_STREAMING_ENABLED=false
```

Bootstrap 返回服务端能力：

```json
{
  "capabilities": {
    "chat_streaming": true
  }
}
```

前端策略：

- `chat_streaming=true` 使用 `/turns/stream`。
- `false` 使用现有 `/turns`。
- 流式接口发生协议级不兼容时，本次请求不自动改走同步接口，避免重复生成；用户重试时才按最新 capability 决定。
- 线上回滚只需关闭后端开关并重启，前端无需重新构建。

## 11. 可观测性

每个 turn 使用 `turn_id/request_id` 串联日志，但不记录消息正文和原始 Provider body。

建议指标：

- `stream_turn_started_total`
- `stream_turn_completed_total`
- `stream_turn_cancelled_total{reason}`
- `stream_turn_failed_total{stage,provider,error_code}`
- `stream_time_to_first_delta_ms`
- `stream_duration_ms`
- `stream_visible_chars_total`
- `stream_provider_fallback_total`
- `stream_truncated_total`
- `stream_coin_reserved/kept/released_total`
- `stream_active_turns`

日志阶段：accepted、provider_connected、first_delta、tool_round、completed/cancelled/failed、billing_finalized。禁止输出 API key、Cookie、CSRF、Prompt、tool arguments 和用户正文。

## 12. 测试方案

### 12.1 Provider adapter 单测

- 三种协议的文本 delta、usage、完成事件。
- JSON/SSE 跨任意 chunk 边界。
- 中文 UTF-8 字节跨 chunk。
- 多个 tool call 及 arguments 分片。
- `[DONE]`、异常关闭、HTTP 错误和超时。
- 取消后 httpx stream 确实关闭。

### 12.2 Runtime 单测

- 只发送最终回答，不泄露 tool/reasoning。
- 工具调用后最终文本仍连续、seq 单调。
- 成功、用户取消、Provider 失败、审核阻断的持久化状态。
- after-turn hooks 只执行一次。
- 同步和流式入口生成的上下文与最终消息语义一致。

### 12.3 Plum API 集成测试

- Session、CSRF、owner isolation。
- 金币不足在打开流前返回 402。
- 三档模型真实选择和 1/3/5 金币结算。
- completed/cancelled/failed 的保留与释放策略。
- 相同 idempotency key 不重复生成和扣费。
- 同一 conversation 并发第二个 turn 返回 409。
- 两个测试用户的流和消息完全隔离。
- 功能开关关闭时同步接口仍正常。

SQLite 和 PostgreSQL 两档都必须覆盖 run 状态 migration 与幂等约束。

### 12.4 前端与代理 E2E

- 首个 AI 文本在完整响应结束前可见，排除代理缓冲。
- 大于 100 字的 mock 回复至少产生 3 次可观察 UI 更新。
- Stop 后 1 秒内停止追加文本。
- 上滚阅读时不会被强制滚到底部。
- 刷新、断网、流截断后能通过 GET history 恢复权威状态。
- Desktop 与 Mobile 都完成发送、停止、错误和滚动测试。
- 生产 HTTPS 域名验证 Cookie、CSRF、Strict/Secure 属性不受影响。

## 13. 分阶段实施与跟踪

状态枚举：`TODO`、`IN PROGRESS`、`BLOCKED`、`DONE`。

| 阶段 | 状态 | 交付内容 | 完成门槛 |
| --- | --- | --- | --- |
| S0 能力 Spike | DONE | 三个真实 Provider 流式探针；本地代理 chunk 探针；生产代理探针留至 S5 | Plum 三档真实分块；Anthropic 上游 503 已记录；Next rewrite 不缓冲 |
| S1 共享 LLM Adapter | DONE | 三协议 normalized stream + parser tests | 19 个聚焦测试通过；Plum 三档真实归一化通过 |
| S2 Runtime 编排 | DONE | `run_product_turn_stream`、取消、工具、审核、run 状态 | SQLite 73 passed；PostgreSQL 22 passed |
| S3 Plum API/计费 | DONE | `/turns/stream`、SSE、固定金币、feature flag | 16 个 Plum/Runtime 聚焦测试通过 |
| S4 前端体验 | DONE | parser、hook、占位消息、Stop、滚动和错误恢复 | 4 个 parser/client 测试、typecheck/build、Desktop/Mobile 回退验收通过 |
| S5 代理与灰度 | IN PROGRESS | 真实联调、Next/nginx 验证、回归与灰度准备 | 本地真流式与取消通过；线上首包不缓冲，无重复扣费 |
| S6 默认开启 | TODO | 开关默认 true，保留同步回滚 | 灰度稳定后产品确认 |

建议每完成一个阶段，在本表更新状态，并在文末变更记录中写入 commit/PR 和验证结果。

### 13.1 S0 执行计划（2026-08-09）

本阶段先验证能力，不改动产品计费、消息表和聊天 UI。

计划：

1. 为 `openai_chat`、`openai_responses`、`anthropic_messages` 编写可重复运行的短消息探针，使用现有 Provider 配置并对日志脱敏。
2. 记录各协议的 HTTP 状态、响应 `Content-Type`、首个可见文本事件耗时、事件数量和是否早于流结束；不记录模型回复正文。
3. 使用最小本地 SSE endpoint 验证 `FastAPI → Next rewrite → fetch` 是否逐 chunk 透传；生产 nginx/HTTPS 验证在 S5 使用真实部署配置执行。
4. 把真实响应事件固化为脱敏 fixture 或 parser 测试输入，为 S1 实现提供依据。

验收条件：

- 三个当前协议均有明确的“真实流式 / 可降级 / 不兼容”结论。
- 至少当前 Plum 三档所映射的 Provider 能在完整响应结束前产生文本增量；若不能，文档记录阻塞原因和降级策略。
- 本地 Next rewrite 首个 chunk 早于终结事件到达，或明确记录需要改为专用 Route Handler。
- 探针代码不硬编码密钥，输出不包含密钥、Prompt 或模型回复正文。

S0 结果：

- `deepseek` / `openai_chat`：兼容，首个文本约 2193ms，完整约 2248ms。
- `chatgpt` / `openai_responses`：兼容，首个文本约 2575ms，完整约 2783ms。
- `deepseek-v4-pro` / `openai_chat`：兼容，首个文本约 4600ms，完整约 4651ms。
- `claude` / `anthropic_messages`：流式和现有非流式调用均返回 HTTP 503，判定为当前代理上游不可用，不是 Plum 流式实现问题；保留协议 parser 与 Mock 测试，恢复上游后再跑真实探针。
- 本地 `FastAPI → Next rewrite → client` 四个事件分别约在 101/502/902/1303ms 到达，确认 Next 16 开发链路不缓冲。

### 13.2 S1 执行计划（2026-08-09）

本阶段只改共享 LLM adapter 和对应测试，不接入 Plum API，不改变同步 `chat_completion()` 行为。

计划：

1. 在 `app/agent_runtime/llm/adapters.py` 增加统一的 `LLMStreamEvent` 与 `chat_completion_stream()`。
2. 三种协议分别解析文本、tool call 分片、usage、完成和错误；上游连接由生成器生命周期管理，调用方取消迭代时立即关闭。
3. 把 SSE framing 与协议事件解析拆成可单测的小函数，覆盖 TCP chunk 任意切分、中文、多事件和异常终止。
4. 保留现有非流式实现和请求结构，避免后台任务与现有同步聊天回归。

验收条件：

- 三协议 Mock 测试均归一化为相同事件类型与顺序。
- 文本与 tool arguments 不丢失、不重复；reasoning 与 Provider 原始错误正文不作为可见文本事件输出。
- 提前关闭迭代器会退出 `httpx` stream context。
- `tests/test_llm_adapters.py` 与新增流式 adapter 测试通过，现有同步路径不回归。

S1 结果：

- 新增统一 `LLMStreamEvent` 与 `chat_completion_stream()`，三协议均输出 `text_delta/tool_delta/usage/completed/error`。
- SSE parser 覆盖 UTF-8 与记录跨 chunk、CRLF/LF、多事件、截断流；reasoning/thinking 事件不会进入可见文本。
- 调用方关闭迭代器时会退出 Provider response/client context。
- 现有与新增 adapter 测试共 19 个通过；DeepSeek Flash、GPT、DeepSeek Pro 的真实短调用均成功归一化。

### 13.3 S2 执行计划（2026-08-09）

本阶段改共享 Human-AI Runtime，不加入 Feed、角色 Profile、金币或 Plum HTTP 协议。

计划：

1. 先梳理 `run_product_turn()` 的 prepare、上下文、工具循环、消息持久化与 after-turn hooks，抽取同步/流式共用的最小内部函数。
2. 新增 `run_product_turn_stream()` 与线程安全取消令牌；工具轮次在 Runtime 内聚合，只有最终自然语言回答产生可见 delta。
3. 新增共享 `runtime_turn_runs` 技术表和 repository，覆盖 SQLite/PostgreSQL migration、幂等状态、同 session 单活跃 turn 与终态记录。
4. 成功/取消时最多写一次 assistant 消息；Provider 失败 partial 不进入后续上下文；后台摘要和记忆任务仍走同步接口。
5. 加入超时 run 的回收入口，但本阶段只负责 run 状态与回调，不处理 Plum 金币释放，计费补偿留给 S3 产品层。

验收条件：

- 无工具和有工具的流式 turn 都只向调用方暴露最终回答文本，tool arguments/results 与 reasoning 不外泄。
- 取消能关闭 Adapter 并得到唯一 `cancelled` 终态；成功/失败/取消的消息与 after-turn hook 各自符合既定策略且最多执行一次。
- `(app_id, account_id, idempotency_key)` 幂等唯一，同 session 第二个 active run 被拒绝。
- SQLite 与 PostgreSQL migration/repository 测试通过；现有同步 Runtime 聚焦测试通过。

S2 结果：

- 同步与流式入口共用 `_prepare_turn`、`_persist_and_screen_inbound`、`_resolve_turn_reply`、`_finalize_turn`；未复制 Plum 专属对话 Runtime。
- 新增线程安全 `CancellationToken`、短文本缓冲/确定性审核、流式工具轮聚合；Plum 空工具集走真实 delta，工具内容不直接外发。
- 新增 migration 68 与 `runtime_turn_runs` repository，包含幂等唯一、同 session 单活跃 turn、首段和唯一终态、超时回收。
- SQLite 聚焦回归 73 passed/1 skipped；PostgreSQL 档 22 passed。

### 13.4 S3 执行计划（2026-08-09）

本阶段只在 Plum 产品 API 映射 Runtime，不把金币、Session 或角色业务下沉到共享 Runtime。

计划：

1. 增加 `PLUM_CHAT_STREAMING_ENABLED` 配置与 bootstrap capability；关闭时流式 endpoint 在打开响应前返回 503，同步 `/turns` 保持可用。
2. 新增 `POST /conversations/{id}/turns/stream`，沿用 Session、CSRF、owner、conversation/model profile 和请求 contract。
3. 在 Plum 层复用现有固定金币 reservation：流打开前完成预占；Runtime `completed`、首段后 `cancelled` 保留，首段前取消/失败/审核阻断释放。
4. 把 Runtime 事件映射成 version 1 SSE，并设置禁缓存/禁代理缓冲响应头；流内异常只输出安全错误码。
5. 幂等完成请求回放权威消息且不重复调用模型/扣费；同 conversation 活跃 turn 返回 409。

验收条件：

- Session/CSRF/owner/金币不足在响应打开前分别返回既有 401/403/404/402 语义。
- 三档模型仍选择真实 provider，completed/cancelled/failed 按策略最多结算一次。
- 相同 idempotency key 不重复生成或扣费；两个用户无法串流或结算对方 turn。
- feature flag 关闭时同步 endpoint 回归通过；SSE 事件顺序和终态唯一。

S3 结果：

- 新增 `PLUM_CHAT_STREAMING_ENABLED`、bootstrap capability 和 `/turns/stream`；同步 `/turns` 保留。
- Plum API 在打开流前完成 owner/model/provider/金币/active run 检查，并映射 version 1 SSE 与禁缓冲响应头。
- completed 保留固定费用；failed 释放；取消/断开按是否已展示首段决定保留或释放；幂等 release/reservation 不会重复改余额。
- Plum、Runtime 与 run repository 聚焦测试 16 passed。

### 13.5 S4 执行计划（2026-08-09）

本阶段只修改 Web 客户端；Desktop/Mobile 继续共用同一个聊天状态与 API，不复制两套网络逻辑。

计划：

1. 在 `lib/api.ts` 增加增量 UTF-8 SSE parser 与 `sendTurnStream()`，保留现有 JSON request/sync `sendTurn()`。
2. 在 bootstrap 类型中加入 capability；按服务端能力选择流式或同步，不因单次流中错误自动重复生成。
3. 把聊天消息状态升级为 `sending/streaming/completed/cancelled/failed`，发送时同时插入用户消息和空 assistant 占位。
4. 用 `AbortController` 实现 Stop；delta 通过 animation frame 合批写入当前 assistant 消息，终态更新 message id 与钱包。
5. 自动滚动只在用户接近底部时跟随；主动上滚显示“回到最新消息”；生成期间锁定模型与 Restart。

验收条件：

- parser 覆盖中文跨 chunk、单事件跨 chunk、多事件同 chunk、CRLF/LF、未知事件和无终态截断。
- Desktop/Mobile 均能看到增量、停止、失败/重试状态；停止后不再追加。
- capability=false 时现有同步聊天行为不回归；一次用户操作不会同时调用流式和同步 endpoint。
- `npm run typecheck`、`npm run build` 和相关前端测试通过。

S4 结果：

- 新增独立 `sendTurnStream()` 和增量 UTF-8 SSE parser，保留同步 `sendTurn()`；未知事件忽略，非 2xx 保留 HTTP 语义，无终态关闭判定为截断。
- 聊天页按 bootstrap capability 选择唯一传输路径；用户/assistant 双占位使用 `sending/streaming/completed/cancelled/failed` 状态，delta 按 animation frame 合批。
- Desktop/Mobile 共用生成状态、AbortController、钱包和消息数据；流式生成时 Send 变 Stop，模型和 Restart 锁定，输入框仍可编辑下一条草稿。
- 自动滚动仅在当前 viewport 接近底部时跟随；用户上滚后显示“回到最新消息”。
- `npm test` 4 passed（含 UTF-8 跨 chunk、CRLF、多事件、未知事件、截断和 HTTP 错误）；`npm run typecheck`、`npm run build` 通过。
- 浏览器以 `chat_streaming=false` 验证同步回退：均衡档完成一次真实回复并只扣 3 金币（1000 → 997）；Desktop 与 390×844 Mobile 均正确展示同一消息状态。

### 13.6 S5 执行计划（2026-08-09）

本阶段开始真实前后端联调和代理验收；不扩展 Feed/Profile 等 Plum 产品域，也不移除同步回滚接口。

计划：

1. 使用独立临时 SQLite 联调库启动 8180 后端并开启 `PLUM_CHAT_STREAMING_ENABLED`，通过现有 Next rewrite 在 3000 页面执行真实长回复，记录 accepted、首个 delta、终态和前端可见时间。
2. 分别验证 fast/balanced/immersive 三档真实模型选择、1/3/5 固定金币、消息落库与刷新恢复；确认一次前端操作只产生一个 turn/run/reservation。
3. 在首段前和首段后执行 Stop/Abort，核对 UI 停止追加、`runtime_turn_runs` 终态、partial 消息策略和钱包释放/保留；补齐发现的 disconnect 竞态。
4. 验证用户上滚、流截断/Provider 失败、同 conversation 并发冲突，以及 Desktop/Mobile 共享状态；必要时增加安全的 heartbeat 与结构化阶段日志。
5. 运行前端测试/typecheck/build、后端共享 Runtime/Plum 聚焦测试及 SQLite/PostgreSQL 回归；整理 nginx 精确配置和线上 HTTPS 首包验收步骤，生产实测作为部署灰度门禁。

联调中间决策（首轮 Stop 验证后补充）：

- 不能只用浏览器断开连接表达 Stop：断开传播与 Provider 首段可能竞态，服务端会把“尝试发送”误判成“客户端已看到”。
- 增加产品 API 的显式取消请求，但取消状态和跨 worker 信号落在共享 `runtime_turn_runs` 技术表；Plum 只做 owner 校验和 API 映射。
- `cancel_requested_at` 与 `first_delta_at` 原子竞争：取消先落库时禁止再标记首段并释放费用；首段先落库时按已展示策略保留费用。
- 前端点击 Stop 后立即冻结本地追加，先发送显式取消，再 Abort 流；随后 GET 权威钱包对账，解决 Abort 后收不到 `turn.cancelled` 事件的问题。

S5 回归收口小步（2026-08-09，编码前记录）：

1. 将 migration 69 改为 SQLite/PostgreSQL 均可安全重放，修复“版本记录回退但新列仍存在”时的重复加列错误。
2. 为会话刷新后的 assistant 状态恢复补测试，确认 cancelled partial 不会被误显示为 completed。
3. 单跑迁移重放、Runtime 流式和 Plum 聚焦用例；再执行前端 test/typecheck/build 与差异检查。

本小步验收条件：migration 69 连续执行不报错；m0036 从 35 到 head 的迁移回放通过；cancelled assistant 刷新后仍为 `cancelled`，普通 assistant 默认为 `completed`。

本小步中间结果：migration 69 已复用 `_ensure_column()`，可在 SQLite/PostgreSQL 按列存在性幂等执行；新增真实消息表与 run 表关联测试。迁移回放、状态恢复、Runtime run/stream 聚焦测试共 9 passed。

S5 并发与权限门禁小步（2026-08-09，编码前记录）：

1. 增加产品 API 的 active conversation 冲突用例，验证第二个 turn 在打开 SSE 前返回 409，并释放其金币预留。
2. 扩展双测试用户用例：用户 B 使用自己的有效 Session/CSRF 取消用户 A 的 active turn 时必须得到 404，且 A 的 run 不被写入取消标记。

本小步验收条件：并发冲突不扣费、不产生第二条 run；跨用户取消不泄露资源存在性，也不改变目标 run。

本小步结果：active conversation 的第二个请求在 SSE 打开前返回 409，金币恢复为原余额且无第二条 run；用户 B 取消用户 A 的 active turn 返回 404，目标 run 的 `cancel_requested_at` 保持为空。SQLite 与 PostgreSQL 各 2 passed。

S5 生产代理准备小步（2026-08-09，变更前记录）：

1. 在本文件给出保留 Next rewrite 的 nginx 精确流式 location，以及仅在生产实测发生缓冲时启用的 FastAPI 同源直代 fallback。
2. 明确 Cookie、CSRF、请求体、禁缓冲、压缩和超时所需配置，并给出 accepted/首 delta/completed 的时间戳验收方法。
3. 同步线上部署交接文档，移除“任何 Plum API 都不得 nginx 直代”的过时绝对表述，但仍禁止浏览器跨域访问 8180。

本小步验收条件：部署者可以直接复制配置并区分首选/回退路径；线上未实际部署前 S5 保持 `IN PROGRESS`，流式开关默认保持关闭。

本小步结果：TECH-08 第 9 节已补首选 nginx→Next 配置、精确 FastAPI 同源直代 fallback 和带事件时间戳的 HTTPS 探针；线上部署交接同步加入流式开关、禁缓冲 location、Stop 验收与 migration 68–69 说明。生产环境尚未执行，因此不把 S5 标为 DONE。

S5 已完成的本地与自动化验收：

- 真实 balanced 长回复约 4.7 秒出现可见 partial、约 14.1 秒完成，期间产生多次 UI 增量；fast/balanced/immersive 分别命中 deepseek/chatgpt/deepseek-v4-pro，并只扣 1/3/5 金币。
- 首段前 Stop 约 0.97 秒结束，`first_delta_at=NULL`、无 assistant message、余额不变；首段后 Stop 在 1 秒量级内停止追加，保存 cancelled partial 并扣完整 3 金币，刷新后仍显示“已停止”。
- 用户主动上滚后生成期间与完成后都不被强拉到底部；点击“回到最新消息”后恢复跟随。Desktop 与 390×844 Mobile 共用同一状态机并通过实测。
- capability=false 的同步回退通过；Provider 失败释放金币；同 conversation 并发、跨用户取消和 migration 重放均有双数据库门禁。
- 当前回归：前端 4 tests、typecheck、production build；包含新增迁移、状态恢复、并发和权限门禁的后端聚焦集在 SQLite/PostgreSQL 均为 22 passed。更早的 SQLite 扩大全量为 2030 passed、38 skipped，唯一 migration 69 重放失败已在本轮修复并由目标用例验证；未为此重复执行约 9 分钟全量。

S5 后端提交前审查计划（2026-08-09）：

1. 逐层审查 Provider parser/连接关闭、Runtime 线程与取消、run 状态机、Plum owner/计费/SSE 终态及 SQLite/PostgreSQL migration。
2. 只修复能导致状态不一致、重复扣费、资源泄漏、越权或明显不可维护的具体问题；不进行无关抽象和风格重构。
3. 修复后执行静态差异检查、SQLite/PostgreSQL 聚焦回归，并按共享 Runtime/持久化变更的风险补充扩大回归；后端独立分支提交并开 PR，前端继续保持未提交。

本步验收条件：没有已知 P0/P1 隐患；所有终态均能清理 active run 与金币预留；取消/失败不会泄漏线程或 Provider 连接；PR 只包含本次流式后端及必要测试。

本步审查结果：

- 修复 OpenAI Chat 在既无 `[DONE]`、也无 `finish_reason` 时误判成功的问题；兼容仅发送 finish chunk 后正常 EOF 的 Provider。
- Plum API 现在对 completed/cancelled/failed/异常/极早断开均做幂等终态兜底，避免预创建 run 长时间停留在 active；Runtime 初始化异常会释放金币并返回明确 503。
- stale run 回收改为按 app/account/session 精确执行，更新时再次校验过期条件以关闭“扫描后恢复活跃却被误回收”的竞态；下次请求会释放首段前崩溃遗留的固定金币预留，首段后仍按既定策略保留费用。
- Provider 调用前增加已取消短路，避免 Stop 已落库仍无谓建立上游连接；异常日志只记录 turn/account/异常类型，不记录消息正文。
- 新增截断、预取消、scope 回收、Runtime 异常终态与 stale 金币退款测试。最终聚焦集 SQLite/PostgreSQL 各 34 passed；SQLite 扩大全量（排除当前 Python 3.9 无法收集的无关 `test_companion_world_presets.py`）2038 passed、38 skipped。

S5 前端主干整合收口（2026-08-09）：

1. 从最新 `origin/main` 保留首页、聊天头部、账号菜单、历史会话与 profile 精简改动，人工合并聊天页的流式状态机，不覆盖同事已经合入的 UI。
2. 检查新增历史会话导航与生成状态的交互；同一角色切换 conversation query 时重新加载权威会话，生成期间锁定历史切换，避免旧流写入新会话页面。
3. 重新执行 SSE parser 测试、TypeScript 检查与 production build；提交仅包含流式客户端、必要样式/测试/文档和上述整合修复。

整合结果：最新主干与流式功能已合并且无残留冲突；首页现有登录态加载无控制台错误，前端自动化测试、类型检查和生产构建通过。

验收条件：

- 本地 `Browser → Next rewrite → FastAPI → Provider` 首个可见 delta 明显早于 completed，长回复至少产生多次前端内容更新且无乱码/重复/丢字。
- 三档模型选择真实生效并只扣 1/3/5 金币；completed/failed/cancelled 与消息、run、reservation 状态一致。
- Stop 后 1 秒内前端停止追加；首段前取消不扣费，首段后取消扣完整档位且保存 cancelled partial。
- capability 关闭后无需重新构建前端即可恢复同步路径；相关前后端回归全部通过。
- 生产 nginx/HTTPS 具备禁缓冲、超时和同源 Cookie/CSRF 配置，且上线前必须执行首包不缓冲检查；未执行生产检查时不得把 S5 标为全部完成。

## 14. 验收标准

- 用户看到的文本顺序、标点和最终数据库内容一致，不乱码、不重复、不丢字。
- 真实长回复在完整生成结束前开始显示。
- 工具、reasoning、Prompt 和 Provider 原始事件不出现在浏览器响应中。
- 一次请求最多扣费一次；服务端失败和审核阻断不扣费。
- 用户看到内容后主动取消按一次固定价格扣费，并保存 cancelled partial。
- 同一会话不会出现两个并行 AI 回复。
- 用户 A 无法订阅、取消或读取用户 B 的 turn。
- 关闭流式开关后现有同步聊天立即可用。
- 本地、生产代理、SQLite、PostgreSQL、Desktop、Mobile 均有验证记录。

## 15. 待评审决策

以下问题不阻塞 S0/S1，但进入 S2 前需要确认：

1. 用户主动取消且已经看到部分文本时，是否确认扣完整档位价格。本文默认“扣费”。
2. cancelled partial 是否进入下一轮上下文。本文默认“进入”；failed partial 默认“不进入”。
3. 输出审核采用短缓冲真流式，还是完整生成后客户端打字机。本文默认“短缓冲真流式”。
4. 生产代理优先保留 Next rewrite，若实测缓冲才切同源 nginx 精确直代。
5. `runtime_turn_runs` 的过期 TTL 和回收频率，建议初始为 10 分钟/每分钟扫描一次。

## 16. 变更记录

| 日期 | 变更 | Commit/PR | 验证 |
| --- | --- | --- | --- |
| 2026-08-08 | 初版方案：结合当前同步实现和 Tipsy 公开交互重新梳理 | 待提交 | 文档评审待进行 |
| 2026-08-09 | 完成 S0；开始 S1 共享 LLM Adapter | 开发中 | Plum 三档与本地 Next rewrite 真流式通过；Claude 上游 503 已记录 |
| 2026-08-09 | 完成 S1；开始 S2 Runtime 编排 | 开发中 | 19 个 adapter 测试及 Plum 三档真实归一化通过 |
| 2026-08-09 | 完成 S2；开始 S3 Plum API/计费 | 开发中 | SQLite 73 passed/1 skipped；PostgreSQL 22 passed |
| 2026-08-09 | 完成 S3；开始 S4 前端体验 | 开发中 | Plum/Runtime 流式 API 与固定金币测试 16 passed |
| 2026-08-09 | 完成 S4；开始 S5 真实联调与代理灰度准备 | 开发中 | 前端 4 tests、typecheck/build；同步回退 Desktop/Mobile 与 3 金币验收通过 |
| 2026-08-09 | 完成 S5 本地联调、Stop 竞态修复与部署准备 | 开发中 | 三档真实流式与 1/3/5 计费；SQLite/PG 聚焦各 22 passed；待线上 HTTPS 探针 |
