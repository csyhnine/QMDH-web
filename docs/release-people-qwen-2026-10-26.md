# 人员工作台与 Qwen v1.1 输入路由发布（2026-10-26）

状态：**DEPLOYED_VERIFIED**。两个功能的源码提交 `d96d508a6da92d553d0337428ffb38ed1ab8e6ce` 已推送并部署到 https://cityusbdisk.cn 。后续仅更新发布文档，运行源码仍以该提交为准；草稿 [PR #5](https://github.com/csyhnine/QMDH-web/pull/5) 保持未合并。用户明确授权提交与部署，本分支 `bugfix/migration-bootstrap-001` 保持，未委派。

## 上线内容

- 项目管理的“人员排期”加入可选员工/职务/余量、跨项目人员甘特图、人员和管理分工拖拽、阶段改期与转交。调整先预览，再逐项目保存；隐藏项目负荷仍计入，保存失败/版本冲突保留调整。见[人员工作台记录](people-planning-2026-10-26.md)。
- Qwen Image 2.1 图像编辑按实际上传 1/2 张选择模板；双图严格从 v1.1 派生，只增加一个 LoadImage 和两处图片连接，原 50 步、GPU 缓存、thinking、共享 seed 及其他参数/绑定全部保全。未复用 v1.0 双图。任务接收时原子固定模板 SHA/输入数，恢复不重提未知 prompt。见[接线记录](qwen-reference-routing-2026-10-26.md)。
- 单图 SHA256 `f0842f769bc97773b22b8852993b4e6b8ab3c8b1fe0ade15a6752d3cb4c2d504`；双图 SHA256 `f18ba1fb2368895d520b4de758716cb143131ef785d500793909da92af1d9c3d`。线上编辑展示名已审计修改为“本机 Qwen Image 2.1 v1.1 图像编辑”，启用状态/600 秒预算保持，公开 API 返回 `reference_input_counts=[1,2]`，旧主模板字段仍为 1。

## 验证与发布

沿用功能定向自验：人员 15 项、Chromium 实际 DOM 10 场景和 4 目标 strict0；Qwen adapter 27+12sub、派发/恢复 85+36sub、新增补强最终 10 用例、前端 28 项、9 目标 strict0 和离线 Vite 构建通过。新增补强与既有批次有重叠，不合计成一次全套执行。

服务器候选以真实生产镜像 COPY 构建，无安装依赖。独立内部网络、临时 PG/Redis/媒体/模板、合成账号和 PNG，限制 512+192+32MiB/合 0.65CPU；无生产卷/凭据/公网端口/测试 worker/搜索/外呼。真实 FastAPI+PostgreSQL 验证单图和双图接收/模板固定/重复提交、人员创建/阶段分配/管理角色/日期保存及旧版本 409，全部通过。首次合成 submission_key 长度不足返回 422，修正测试值后通过；没有为测试改产品代码。临时容器和网络已清理。

排空 Task/dispatch/Redis/GPU 锁/上游队列，暂停入口并刷新 DB 备份后成套切换。无生产迁移，Alembic 仍 `e51fa962c846`。后端健康、3 个 worker 运行、前端运行，重启计数均 0；env/key、网络、媒体和工具 ODA/FFmpeg/Xvfb 保持，其他生产服务容器身份/启动时间保持。四个后端/worker 容器各 6 文件 SHA 和前端 51 文件核对一致，公网首页/主 JS/两个功能页面 JS SHA 一致；11 个路由返回预期 200/401。最终磁盘余量约 8.60GiB。公开验收与哈希见[脱敏发布证据](archive/release-people-qwen-2026-10-26/RELEASE.json)。

| 服务 | 当前镜像 SHA256 |
| --- | --- |
| backend | `5d437ea00900c2609b2bfaeda6f5a62d08df6bc06ebad37e429d2e8ade47646f` |
| worker ×3 | `42ae707423088b0386f485459c5406598a1a48dba902f8f143260e83d8ee8467` |
| frontend | `5310a91ceac0c8bccb58391443ac70985aa700909e929986fcd1a24bcd852b62` |

当前有效目录 `/opt/qmdh-frp/releases/people-qwen-20261026` 必须保留。运维同时使用三份 Compose：

1. `/www/wwwroot/qmdh-web/docker-compose.yml`
2. `/opt/qmdh-frp/compose.frp.yml`
3. `/opt/qmdh-frp/releases/people-qwen-20261026/compose.release.yml`

保留 `--no-build --pull never --scale worker=3`。后端/worker 工作流只读绑定新目录的 `workflows` 到 `/app/integration/comfyui`；共 8 文件，旧 `/opt/qmdh-frp/workflows` 原样保留。服务器旧 Git 不能作为当前完整运行源码重建，也不能套用旧 deploy-production-rebuild.sh。

## 配对备份与回退

`/www/backup/qmdh-release-20261026-people-qwen` ↔ `E:/backups/QMDH-web/release-20261026-people-qwen`，最终 **26 文件逐个 SHA256 一致**。包括 DB/env、切换前后模板及哈希、Compose/回退配置、旧镜像引用、Git source bundle、运行清单及媒体恢复链；私密内容不入 Git。切换前工作树另有私有快照，SHA256 `403374ce46460ade8f2a7f705930a51ee8d26b2992065d224b641b7c1b1c5dcb`，原未提交内容保全。

媒体清单 5843 文件，本轮 0 文件增量；`resolved-media-chain.json` 扩展至 25 个归档。其中完整基础包与一段早期增量仅存在本机既有私有备份，恢复必须结合本机两包；不能只取服务器本轮目录。此前两包已全流读取/哈希核对，本轮核存在性/大小/mtime 连续性，服务器已有归档重新核 SHA。未清理旧包或假称服务器有全链副本。

回退前先暂停入口、排空持久待办并核对上游，不清未知 GPU 锁或重发未知 prompt。使用本发布目录 `compose.rollback.yml` 与 `qmdh-release-backup-{backend,worker,frontend}:20261026-people-qwen`，同时退回旧镜像/旧模板绑定，并按 `provider-before.json` 审计恢复展示名；保留主 Compose+FRP 及 3 worker。只回退运行版本，不降迁移、不覆盖新增业务数据/媒体/key。未执行回退。

未运行全套、安全专项、真实生成/GPU、付费任务、历史补账或清理；不作实际出图质量/耗时/显存结论。72 项仍 review=PENDING、25 冻结 STOPPED、R98 唯一 DONE，上线不代替独立验收。localhost:4384 为合成人员预览，实际体验请刷新线上项目管理/图像编辑页面。
