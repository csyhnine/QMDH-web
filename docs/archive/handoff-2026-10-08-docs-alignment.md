# 正式文档对齐 — 2026-10-08

任务 docs-align-001，本地完成，未提交/push/部署。继续使用 `feature/studio-perf-003-history-pagination`（基于 `65c47a0`）；没有新增业务代码改动。

## 结果

- `docs/plan.md` 更新为 1.0 生产内测与稳定化，不再宣称仅有模拟 provider、无测试或无迁移。
- `docs/tasks.md` 收束为当前任务与后续/暂缓索引。旧 June 合并序列、完整 DONE 任务、prod-001 大量阶段记录与旧上云清单保存于完整快照，不再作为优先排期。尚未完成/有歧义的旧任务保留待核对索引，不擅自标 DONE。
- `docs/continuity.md` 合并互相矛盾的生产快照，区分 GitHub `65c47a0`、生产文档合并 `fe3adb5` 与运行镜像 `1783bec`。迁移为 z1a2b3c4d5e6；生产事实来自交接/用户补充，本轮未连接复核。
- 纠正服务器不能快进却推荐 --ff-only、按旧 stash 序号 pop、不存在的 npm smoke 脚本及旧“未提交助手隐藏”部署建议。
- 架构/决策说明对齐有效 ops 角色、账号历史授权、无来源资产项目授权、真实图像编辑、数据库会话和媒体直出。
- 代码仍在启动时 create_all/ensure_schema，与历史“已彻底移除补列”描述不一致；当前文档明确此事实，不修改启动行为。生产依然必须核对 Alembic 与 schema。

## 验证与边界

只读核对 auth/roleAccess、router、bootstrap/main、API/数据加载器、nginx/Compose、迁移及 package.json。检查当前文档代码路径与归档文件可解析，归档包含旧全部任务说明。仅文档修改，不重跑已经完成的代码检查。

旧正式文档完整保存于 `docs/archive/document-baseline-before-2026-10-08-alignment/`，包括整理前 handoff。当前 handoff 保留 3 条，旧 Chat 交接有原专项归档。

原访客样式、比较文档、临时脚本保持不动；不提交密钥、库或存储，不接触生产、不碰 18010。CAD 等待官方 Linux ODA 包，所有旧图保护边界继续有效。

## 下一步

优先最小自动检查，明确已有类型错误与外部服务依赖；前两项 Studio 变更仍未提交/部署。用户明确要求后才单独整理提交与部署。

Safe to hand off: Yes。
