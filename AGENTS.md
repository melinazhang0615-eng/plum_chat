<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Plum 本地联调启动

- 当任务上下文是 Plum，用户说“启动服务”“启动项目”或“本地联调”时，前端使用
  `npm run dev`；后端进入同级 `weixin_bot` 仓库并使用 `make plum-local-start`。
- 仅明确要求启动前端时，不要擅自启动后端；仅明确要求启动后端时，也应在 Plum 场景使用
  `make plum-local-start`，不要直接运行通用 `uvicorn` 命令。
- `plum-local-start` 只面向本地测试：它会使用隔离 SQLite、固定测试身份，并关闭若干与联调
  无关的后台任务，不能用于线上或共享环境。
- 这些启动选项会随产品演进而变化。若当前任务需要不同数据库、鉴权方式、端口或后台任务，
  先查看后端 `Makefile` 中 `plum-local-*` 的具体封装；确认默认值不再适用时，应同步修改封装
  和本说明，不要在临时命令里长期复制一套配置。
