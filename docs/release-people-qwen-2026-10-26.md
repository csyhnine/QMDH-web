# 人员工作台与Qwen v1.1输入路由发布（2026-10-26）

用户已明确授权提交并部署两个改动。当前分支bugfix/migration-bootstrap-001，不合并main，不委派。源码及原工作树已私有快照，SHA256 403374ce46460ade8f2a7f705930a51ee8d26b2992065d224b641b7c1b1c5dcb；仅显式选择两个功能源码、定向测试及相关文档，不上传local/env/凭据/业务数据/生成包。

当前阶段：待服务器隔离候选验收与备份后切换。生产仍为上次e6add45运行源码，Alembic e51、backend65a9cfbe/worker3783fe13三副本/frontenddf9975fa。复测可用内存1689MiB、盘余8.64GiB，无在途Task/dispatch/Redis/GPU锁/上游队列；所需3节点object_info只读确认存在。后端本次6文件覆盖，其余生产差异、工具和env保持。无新依赖或迁移。

本地验证沿用两份功能记录：人员15项+10浏览器检查；Qwen后端定向85+36sub及新增补强10最终通过、前端28项、9目标strict0、离线Vite成功。Qwen双图从v1.1派生，只增加475与两处图片连接，50步/gpu缓存/thinking/共享seed及其余映射保持；单图SHA f0842f769bc97773b22b8852993b4e6b8ab3c8b1fe0ade15a6752d3cb4c2d504，双图SHA f18ba1fb2368895d520b4de758716cb143131ef785d500793909da92af1d9c3d。运行时拒绝旧参数回退，接收时固定具体SHA/输入数。

候选将基于当前真实镜像COPY-only构建，PG/Redis/媒体和模板使用独立内部环境，无生产凭据/卷/网络/公网端口/worker/搜索/外呼。按512+192+32MiB、合0.65CPU限制，MemAvailable<600MiB或盘余<8GiB即停候选。通过后成套备份DB/env/媒体链/旧镜像/配置/模板与Git源，排空入口后切换；回退旧镜像+旧模板+旧展示名，不降迁移、不覆盖新业务数据。

72项仍review=PENDING、25冻结STOPPED、R98唯一DONE。上线不代表独立验收全部问题。最终提交、镜像、备份与公网结果在实际完成后补齐。
