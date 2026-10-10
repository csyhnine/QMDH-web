# Development Checks

2026-10-10 自助临时凭证（skill-feedback-003，514de69 已部署）：最新后端 **122 passed + 16 subtests、1 skipped**；新增固定 ID 登记/停用、同名分离/改名聚合/升级沿用 ID、公开会话、共享申请/提交配额、20 并发争抢 5 次、代理伪造/信任、匿名统计、绑定/撤销/到期和新迁移保留/降级拒绝回归。前端 **16 项**、23 既有/0 新增 TS 错误、Vite 构建通过；新增组件渲染证明无需先加载才能看到创建入口。GitHub 功能 CI 38040818927 success，Linux 123 passed + 16 subtests/前端 16 项。新 PostgreSQL 隔离恢复/迁移/身份/并发配额、nginx 413/429、生产公网与管理只读查询已验证；真实浏览器/平台联调仍待做。详见 archive/handoff-2026-10-10-feedback-public-release.md。

2026-10-10 最新安全改造（55216ab 已部署）：后端关键集 102 passed、16 subtests、1 skipped；专项 24 passed，含并发配额、专用凭证、待核实隔离、迁移保留及降级拒绝。前端新增反馈真实组件渲染回归 2 项，统一检查 15 项通过、23 既有/0 新增类型错误、Vite 构建通过。最新版 GitHub Linux CI 103 passed + 16 subtests；隔离 PostgreSQL 与 nginx 运行验证通过。下方旧数字及未运行 CI 描述是历史记录。

2026-10-10 Skill 反馈改造追加：自动采集/状态/来源/权限/去重/聚合/关联与旧表单回归、SQLite 迁移升降级，纳入隔离检查集。完整关键集 93 passed、16 subtests passed、1 skipped；最终反馈专项 23 passed；前端统一检查通过（23 既有/0 新增类型错误）。真实 PostgreSQL、平台/浏览器联调未验收。

2026-10-10 追加媒体审计回归（`tests/test_media_audit.py`）：临时数据库与文件、只读/引用保护/报告边界。媒体专项 5 passed、1 skipped（Windows 链接权限不足）；前序 66 项关键回归通过。详见 `docs/media-audit.md`，Linux/真实 PostgreSQL 验证尚未执行。

Updated: `2026-10-10`。本地质量检查已经实现；`.github/workflows/check.yml` 尚未提交，GitHub 未实际运行。

## Frontend

在 `frontend` 目录运行：

```text
npm ci
npm run check
```

统一命令依次执行：

1. `npm run test:checks`：Studio 加载器 10 项、类型基线检查器 3 项、反馈恶意文本、核实入口与凭证创建入口 3 项回归。
2. `npm run typecheck:baseline`：编译整个前端并逐项对比已有错误。
3. `npm run build`：Vite 生产构建。

`npm run typecheck` 是完整、严格的 `tsc --noEmit`，目前仍因 23 项已有错误失败。基线检查通过仅表示没有新增错误，不能宣称类型检查全绿。

`frontend/typecheck-baseline.json` 记录 TypeScript 5.9.3 下的文件、错误码、完整消息和重复次数；不依赖行号。新文件/错误码/消息、同类错误数量增加，或 TypeScript 版本变化都会失败。已有错误减少可通过，同时提示移除失效条目。

基线不由 CI 自动更新。只有明确审阅原因后，才运行 `node scripts/typecheck-baseline.mjs --write-baseline`，逐项审阅 JSON diff。不能为了 CI 变绿扩大基线。长期目标仍是修复已有错误并使用完整 typecheck。

## Backend

Python 3.12，开发依赖在 `backend/requirements-dev.txt`。在 `backend` 目录运行：

```text
python -m pip install -r requirements-dev.txt
python scripts/check.py
```

本机已有解释器可直接运行：

```text
.venv\Scripts\python.exe scripts/check.py
```

检查集覆盖列表分页与账号归属、认证边界、角色、健康、CORS/限流、任务恢复和完整软删除测试。名单在脚本中明确列出，**不是整个后端测试集**。

脚本仅在自身进程内清除 QMDH 环境变量、忽略绝对路径的项目 `.env`，使用 SQLite/临时媒体路径，关闭外部 Meilisearch，关闭第三方 pytest 插件自动加载。测试自身使用独立数据库或 mock，无需启动 Redis/PostgreSQL/Meilisearch，不读取/写入真实业务库与存储。外部服务集成、迁移升级、真实上游模型及浏览器交互仍须另外验收。

历史 dashboard 测试已修正：ops 应返回 403，统计核对使用真实 admin 测试账号。没有放宽权限代码或将失败测试 xfail。原 Meilisearch 连接失败由明确的离线配置解决，真实搜索集成不在这组检查覆盖范围。

## CI

工作流分别运行前端与后端检查，触发于 pull_request、main push 和手动 dispatch；只读仓库权限，不使用部署密钥或生产配置、不含部署步骤。使用 Node 22、Python 3.12 与 Ubuntu 24.04；CI 内 npm ci 按 lockfile 安装，Python 按项目运行依赖及开发依赖安装。

Actions v7 的使用方式已参考官方 [checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node)、[setup-python](https://github.com/actions/setup-python) 文档。GitHub 实际执行和仓库分支保护尚未配置/验证，不能把本地检查通过等同于云端检查已通过。

当前 Python 依赖解析 dry-run 通过，但有历史依赖警告（cryptography 45.0.0 被撤回、huggingface-hub inference extra 不存在）。本轮不修改生产依赖版本；依赖升级应另行验证。
