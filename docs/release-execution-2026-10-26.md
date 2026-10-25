# 修复发布执行（2026-10-26）

本次沿用2026-10-25发布交接授权，未扩展冻结项或重新全项目审查。当前状态：**已部署并核验**。运行源码提交e6add450685d2bf7d2f728025a9b20cb3be5c5cb已推送；草稿PR [#5](https://github.com/csyhnine/QMDH-web/pull/5)，未合并main。后续提交仅更新发布证据。

- 分支bugfix/migration-bootstrap-001；起始HEAD 798dccde24dc90fe3dd77368f1bf819e4e3a6d0a。显式选择288个源码/测试/CI文件，另选当前发布文档；其余原工作树内容保持。local私有快照覆盖3895个原改动/未跟踪文件，SHA256 4b7072732c572179375bc45c15a2ded6a126df94f301e965cbf3cc3f9804fac9。
- 后端覆盖包76文件SHA256 f5fdfa1c61eaf87f8be80bbb54bf6f461158b3aeb7daadda70a1cfcfbbd75392。75项为保全的工作树实现，image_aspect_ratio.py是既有已提交源码与线上差异；其归属和逐文件原始字节SHA见candidate-ownership.json。102个仅换行差异不覆盖。
- 复测内存可用1491MiB、盘余8.96GiB；生产10容器身份与启动时间保持。COPY-only构建backend sha256:65a9cfbe7969a31110ae37030aa866fa7d0139636fe2eee8fdff0ef46fbbbc94、worker sha256:3783fe13579c4e56f9bdc7b3ef9972fdcc534fce02f41bc7c0fa61adbc031cb9。保留实际旧镜像及工具，不安装依赖。
- 临时PostgreSQL：空库全链到e51、构造b27结构到e51均通过。这不是生产库迁移结果。
- 受控应用lifespan通过；PG/Redis健康200、OpenAPI任务/Chat/搜索/CAD接线、模型列齐备及easy seed的2^50含上界通过；随机与批量路径另做源码接线核对，无真实生成。调度start/shutdown、种子数据写入/下载和搜索初始化由测试替身关闭；不代表这些后台作业已验收。内部网络无生产卷/凭据/公网端口，backend512MiB+PG192MiB+Redis32MiB，CPU合0.65。临时容器与网络已删除。
- 初次构建裸镜像ID被Docker误解析为远程仓库，改用指向固定本地ID的候选专用标签后成功。首次启动缺少测试Fernet key被正常拒绝；补独立随机测试key。启动测试错误健康路径404已改为/api/v1/health。隔离初轮种子下载DNS失败，最终明确替身关闭种子，未成功外呼；实际应用代码未改动。OpenAPI有既有重复operation ID警告。
- 线上active index-CTTka0hF.js引用ChatPage-26nJ0uMr.js，SHA256 85d5bd39cc2efa8fad4f5679d9fe64b0516da4c915954973f594bd3773ec49ed。实际编译代码r=n??!1及function Zl(e){return e&&!1}确认Chat UI环境覆盖为false，默认agent mode=false；因此可复用已过离线false/false前端包，保留管理员开关行为。此为运行产物行为证据，未声称找到了历史构建环境。
- 生产门槛只读统计：tasks只有completed6593/failed1644，dispatch只有done27；Redis队列0、GPU锁不存在；上游GET /queue确认running0/pending0。生产projects.owner_user_id及canvas_projects已存在，b27保持。
- 未运行全套/安全专项/视频/GPU/付费/补账/清理或未知重试。提交使用[skip ci]防止PR触发全套自动工作流；不将既有局部自验写作72项独立验收，review=PENDING和25冻结不变。

证据位于archive/release-execution-2026-10-26/。凭据、业务数据、备份、生成包、私有脚本不进入GitHub。上线前必须核私有DB+env/媒体链与旧镜像/配置备份；回退只成套旧镜像、不降迁移或覆盖新业务库。

## 实际生产结果

- backend65a9cfbe7969 healthy，worker3783fe13579c三副本running（无healthcheck），frontenddf9975fa4bb7 running，后端/worker重启计数0。生产Alembic已实际升级到e51fa962c846。暂停入口、再次核排空、停止backend/worker后刷新DB备份，迁移后先等新后端健康，再恢复前端。未执行回滚。
- 4个后端/worker各76文件SHA匹配，51前端文件匹配，公网首页/主包逐字节一致。主包SHA256 f5f845f6e5579ec9f36d520406458649ff20cac12c2e2de15853bc811f101c47。首页/Studio/健康200；匿名tasks按既有合同200且空数组，6条CAD代理路由401。验证脚本初轮漏favicon、误设匿名tasks预期401，修正验证范围/预期后通过，未修改产品代码。
- 后端/worker全部环境值、挂载来源/读写和网络与发布前相同，env文件SHA保持；FFmpeg/Xvfb/ODA可定位。PG/Redis/search/FRP等其余容器ID与启动时间保持。7个当前工作流已单独归档并核SHA。临时测试容器/网络剩余0，盘余约8.90GiB。
- 私有备份 /www/backup/qmdh-release-20261026 ↔ E:/backups/QMDH-web/release-20261026，23文件两端SHA256匹配，含刷新后DB/env、旧镜像引用、Compose/FRP/workflows、Git bundle与验证/恢复清单。媒体5843文件，本次15文件增量66179868字节，增量tar已完整读验。
- 旧链引用的management-workbench/restore-media-chain.json在服务器缺失，本机配对清单存在；未改旧归档，在新备份resolved-media-chain.json中解析为24归档恢复顺序。14个基础归档14871113316字节已在本机重新计算SHA并完整读tar流（5831成员），其中12包现存服务器副本SHA匹配。完整基础包和一个早期增量只在本机既有私有备份，恢复必须结合本机基础包和后续服务器/本机配对增量，不能只用服务器本次目录或最后增量。
- 当前必须保留主Compose + /opt/qmdh-frp/compose.frp.yml + /opt/qmdh-release-candidate-20261025/compose.release.yml，使用--no-build --pull never --scale worker=3。该candidate目录已承载有效发布材料，不得当测试目录清理。服务器旧Git仍c70eac02，不能代表运行源或用于重建。实际镜像与包SHA见archive/release-execution-2026-10-26/RELEASE.json。
- 回滚模板/opt/qmdh-release-candidate-20261025/compose.rollback.yml及旧镜像qmdh-release-backup-{backend,worker,frontend}:20261026保留；回滚前暂停入口/核在途与上游，只回镜像、不降迁移/覆盖新业务库。未运行真实生成、GPU、付费、补账、搜索重建或业务清理；72项IN_PROGRESS/review=PENDING、25冻结STOPPED、R98唯一DONE保持。
