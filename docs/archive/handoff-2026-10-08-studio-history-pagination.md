# Studio 历史分页与运行任务跟踪 — 2026-10-08

状态：本地完成、未提交、未 push、未部署。分支 `feature/studio-perf-003-history-pagination`，基于 `65c47a0`。

## 变化与原因

旧加载器传 limit，但 `api.tasks` / `api.assets` 不接参数，实际请求全量。修复 API 参数后补充按 ID 游标分页，初始/后续每页 120 条。刷新合并记录，不截掉已经翻出的历史。分页游标仅由历史页推进，不被较老运行任务改变；失败保留游标供重试。

轮询取最近 40 条与全部 pending/running；已知运行任务离开两者后，按 task_ids 批量查询终态。删除的任务不再阻断刷新。初始和翻页均按任务取完整资产，避免独立资产 limit 截掉多图任务的结果。账号切换隔离旧请求并清空历史。空闲轮询只请求任务/资产。

资产权限和收藏过滤移到 SQL limit 之前，避免其他用户的较新资产占掉当前用户的名额。原权限语义保留，后续 Python 校验仍在。

## 边界

- 不改 CAD、布置、生产配置、迁移或业务数据。
- 筛选仍作用于已经加载的账号历史，页面明确提示；不是全库筛选或搜索。
- 不做独立资产库分页、虚拟列表、缩略图生成、页面隐藏暂停。
- 前后端需要一起部署；本轮未获部署指令。
- 原有 `frontend/src/styles.css`、`docs/compare-qmdh-openclaw-codex.md`、`scripts/_tmp_*` 未触碰；不要混入提交。

## 验证

- `backend/.venv/Scripts/python.exe -m pytest tests/test_studio_perf_list_limits.py -q --tb=short`：33 passed（包含继承的账号回归）。新增覆盖游标遇到新增/删除、权限和收藏过滤、旧任务追踪到完成。
- `node --test frontend/scripts/test-studio-data-loader.mjs`（在 frontend 内运行时去掉路径前缀）：4 passed，真实 hook 的模拟运行，覆盖历史保留、较老运行任务、重试、账号切换和运行任务删除；不是浏览器视觉验收。
- `npm run build`：通过。
- 扩大后端回归：45 passed / 2 failed。两项均以 HEAD 原始 routers 在内存中加载后复现：Meilisearch 7700 未启动；dashboard 旧测试期望 designer 访问却返回 Operations access required。
- `npx tsc --noEmit` 未全绿；用 TypeScript Compiler API 对比 HEAD 源码与工作区：HEAD 27 项、当前 23 项、新增错误 0。不在本轮扩大修改旧类型问题。

## 下一步

审阅本轮 diff，必要时做浏览器交互验收；用户明确要求后单独提交/部署本任务。无 Alembic 迁移、无新依赖。生产部署遵循 Daily Update，保护加密 key 与数据卷。CAD 继续等用户提供官方 Linux ODA 安装包。

## 后续追加：studio-perf-005 后台暂停与配置刷新

用户再次要求继续，顺序完成刷新优化，仍在同一分支，未提交/部署。仅改前端加载器与其测试，上一轮后端无需重复修改。

- 登录态页面隐藏停止 4/12 秒轮询，返回立即同步；已发出的请求允许完成，返回遇到正在请求时仅排队一次补同步。
- 轮询回调使用 ref 中的最新加载函数，定时器仅随账号/运行状态变化重新设置；避免 tasks 每次更新使定时器重建。
- health、projects、providers、workflows、promptTemplates 每 5 分钟按需刷新。失败保留原配置并显示错误，按 5 分钟间隔重试。配置失败不阻断任务更新；已加载历史/游标保留。
- 初始或显式 full 加载仍刷新所有配置，首次失败后的自动重试仍走 full。访客保持一次加载，不添加轮询。
- 账号变化/卸载清理事件和定时器，旧响应失效。不取消服务端任务或强行中断网络请求。
- 累计 hook 回归 **10 passed**；新增隐藏/返回、配置到期、失败保留与恢复、监听器清理、返回遇到请求未完成、卸载后旧响应隔离。构建通过；全量类型检查仍有原错误，无本轮新增。未做浏览器视觉验收。

原本分页切片未包含后台暂停，该边界现由此后续切片补齐。其余原边界继续有效。

Safe to hand off: Yes。
