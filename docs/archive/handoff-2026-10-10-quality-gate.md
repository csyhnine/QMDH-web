# 最小自动检查 — 2026-10-10

quality-gate-001 本地完成，未提交/push/部署。分支仍为 `feature/studio-perf-003-history-pagination`，基于 `65c47a0`；前序未提交 Studio/文档改动保留。

## 变化

- 前端 package.json 新增 typecheck、typecheck:baseline、test:studio、test:checks 和 check 命令。统一检查先跑 13 项回归，再比较全源码 TypeScript 诊断，最后 build。
- 新类型基线脚本按文件/错误码/完整消息/重复次数匹配，允许已有错误消失，不允许新错误或重复增加；TypeScript 版本变化需复核。基线初始记录 23 项错误，完整 tsc 仍非零失败，不宣称全绿。
- 后端开发依赖明确 pytest 9.0.3；scripts/check.py 用当前 Python 运行选定关键回归。进程内隔离 QMDH 环境和 .env，临时媒体/SQLite，关闭 Meilisearch 和第三方 pytest 插件自动加载。
- 旧软删除统计测试新增 admin 夹具，并断言 ops 返回403，再核对 admin 返回统计。业务代码不变，完整该文件纳入检查，不跳过已知失败。
- GitHub workflow 对 pull_request、main push、手动运行触发两组检查。只读权限，不持久保存 checkout 凭据，不使用生产秘密、不部署。Actions v7 用法按官方文档核对。

## 验证

- `npm run check`：13 项回归通过；类型基线23/23，无新增；Vite build通过。
- `.venv/Scripts/python.exe scripts/check.py`：66 passed、16 subtests passed。不是全后端测试集。
- Python 依赖安装 dry-run（ignore-installed）解析成功，实际未安装/升级本地或生产依赖。存在历史依赖警告，详情见 docs/checks.md。
- workflow YAML、事件、只读权限和无 continue-on-error 检查通过。
- 本轮没有提交，因此 GitHub runner 没有实际运行；Ubuntu clean install/runtime 与仓库分支保护仍需提交后的验证。没有启动本地端口或访问生产。

## 交接

运行及基线维护见 `docs/checks.md`。基线不能为 CI 变绿自动扩大，后续应逐步修复已有类型错误。前后端真实服务、搜索、迁移和模型调用仍需另行验收。

原访客样式、compare 文档、scripts/_tmp_* 不属于本轮。提交前明确列文件，排除 .env、业务库与存储；用户明确要求才提交/push/部署。下一候选是媒体治理的只读预览与引用保护审计。

CAD 当前边界完整保留在 `docs/archive/handoff-2026-10-08-cad-production.md` 与 continuity。Linux ODA 包尚未提供，不自行下载/安装，不重转旧记录、不改布置算法。

Safe to hand off: Yes。
