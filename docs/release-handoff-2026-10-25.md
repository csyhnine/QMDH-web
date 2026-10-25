# GitHub 更新与服务器部署交接（2026-10-25）

用户最新请求：换一个新对话，负责将修复更新到 GitHub，并部署到服务器。本文件供该新对话接手，原对话在交接后停止修改共享工作区。

## 授权与执行边界

- 新对话负责完成修复代码的发布整理、必要的本地提交/推送、服务器隔离候选验收与通过后的部署。最新发布请求覆盖此前本轮的“不提交/推送/部署”和服务器仅只读限制；这些操作须在明确候选、定向验证及可恢复备份后执行，不需逐步重复询问相同授权。
- 保留原分支和受保护未提交内容，不 reset/clean/stash/切分支或盲目覆盖；不委派。GitHub 更新使用当前分支，避免自行合并默认分支。创建 PR 后须附加到新对话。
- 25 个冻结 R 项继续停止，不展开冻结证据，不重新审查全项目，不重跑未受改动影响的检查，不运行全套/安全专项/真实视频/GPU/付费任务。
- 必要生产备份、候选隔离验证和已验证的新迁移属于部署流程；不运行历史费用补账、数据清理、搜索重建、维护生成或未知任务重试。隔离环境不得使用生产凭据、业务记录、卷或网络。
- 72 项仍是 IN_PROGRESS / review=PENDING，唯一 DONE 为 R98；发布不等于这些 R 项已经全部验收，不擅自批量 ACCEPTED/DONE。

## 工作区与入口

- 工作目录 `E:/projects/QMDH-web`。
- 当前分支 `bugfix/migration-bootstrap-001`，HEAD `798dccde24dc90fe3dd77368f1bf819e4e3a6d0a`，索引为空；修复代码仍在脏工作树中，HEAD 不是待发布源码版本。
- origin 为 `https://github.com/csyhnine/QMDH-web.git`。不将 Git diff 当成全部改动：发布准备时有 163 个已跟踪改动、38 个未跟踪运行时代码文件，另有定向测试/证据/文档。数量会随本地证据增加而变化。
- 按 `docs/protocol.md` 接手，但沿用已有冷启动/快照；只读 tasks/handoff 当前段与相关 architecture/decisions/roadmap，不重审全项目。
- 必读：`docs/release-readiness-2026-10-25.md`、`docs/server-readonly-report-2026-10-25.md`、本交接、`docs/server-operations.md` 顶部当前发布说明，以及下列候选/容量证据。历史封存不修改。

## 已完成、可复用的证据

1. R96/F83 本地实现与自验完成，尚待独立验收。`docs/archive/f83-r96-2026-10-25/evidence.md`：后端25精确节点累计通过、前端3项通过、目标strict0；不是最终整批25节点重跑。
2. `docs/archive/release-prep-2026-10-25/`：Vite 离线构建 exit0，有大分块提示；禁止 dotenv、清除继承 VITE_*，Chat 两开关设仓库默认 false。此为预览，实际线上构建开关未确认，不能直接替换线上前端。静态迁移51文件、单head e51、无缺父；615源码/配置 SHA保持。source-snapshot只是明确615文件子集，不是完整生产构建上下文。
3. `docs/archive/server-readonly-2026-10-25/`：真实服务器只读结果。backend/3 worker运行源码一致，所查213路径中35原始相同，159原始不同；再归一LF后102仅换行、57内容不同、19线上不存在。应用目录无额外 Python 文件，requirements归一后相同，所列发行包都已安装，Python3.12.15。十个既有项目容器启动时间不变。
4. 后端 `backend-overlay.tar.gz` 为 **57内容差异+19新增=76文件**，排除102仅换行路径。归档SHA256 `f5fdfa1c61eaf87f8be80bbb54bf6f461158b3aeb7daadda70a1cfcfbbd75392`；`candidate-overlay-manifest.json` 包含逐文件旧运行SHA/应不存在与候选SHA；`Dockerfile.candidate` 是继承真实镜像并COPY覆盖的未执行模板，不是已构建镜像。
5. 差异混有原有工作。例如 image_aspect_ratio.py 相对本地HEAD无未提交改动，但与运行版本不同。76文件是候选输入，不代表全部都是本轮bug修复或自动获准覆盖。必须保全并说明原有改动归属。
6. `docs/archive/server-capacity-2026-10-25/assessment.json`：2核/负载0.17，总内存3.42GiB、可用1.44GiB，无Swap，Docker盘余8.96GiB。仅为当时实测，执行前复测。本机 Docker CLI存在，但本机 Docker Desktop daemon不可用。

## 已确认的服务器基线

- 主机 `120.79.227.11`，应用 `/www/wwwroot/qmdh-web`，公开入口 `https://cityusbdisk.cn`。
- 服务器 Git main/c70eac0215e4f89fe90b2f72ad3721dbdb700b5f 干净，但实际运行来自额外发布与热修，不能直接 pull 旧服务器源码重建。
- backend `sha256:f8822343b1d1b5d3b2449ec1c89c8e1e6ad637220858da243890e6f7f931f86d` healthy。
- worker 3副本，均 `sha256:3cc0ece1b6320977ff7d1e59b2104261d9087742824fe6824a70bef13321fbcc` running，无Docker healthcheck。
- frontend `sha256:d5dfe72b66de4d95de3902f9ccc183574ec093c62bb11100f7e6c7cf9463fced` running。
- 实测生产 Alembic `b27d0f85c932`。本地新增链：c39d8e71a624 → d40e9f82b735 → e51fa962c846；尚无此次 PostgreSQL候选集成结果，不能从SQLite/静态检查推断生产迁移成功。
- backend/worker/frontend保留主Compose与 `/opt/qmdh-frp/compose.frp.yml`、3worker、FRP/workflow挂载/网络、ODA/FFmpeg/Xvfb。现有 `scripts/deploy-production-rebuild.sh` 已被运维文档标明不适用，不直接执行。
- Qwen v1.1运行源提交03e845d358c4eaa746c7521045e1f183e3ec723f；发布 `/opt/qmdh-frp/releases/qwen-v1.1-20261019/RELEASE.json` 与种子热修目录清单SHA同为d0721fb4450f5fb4a5b2bbb89cdc910ad1fb49e3b7a392dbf3ec4d77a25e3b8e。
- 线上ComfyUI adapter热修SHA `40d63ff81d7c3834da661fb152791e73ebf6a057792720c4b755f5fefd57df3d` 已核一致。本地候选也保留easy seed的0..2**50含上界，随机/显式/批量均走seed_maximum，须在候选中验证后由正式代码接替热修。
- 访问资料仅从被忽略的 `local/server-access.md` 在内存中读取，绝不输出/上传。新脚本可参考本轮只读连接脚本与已记录SSH指纹；不运行旧 scripts/_tmp_* 部署脚本，其中可能有历史凭据/破坏性操作。

## 接手后的执行顺序

1. 验证当前HEAD/分支/索引与候选清单哈希；只对新变化作增量判断。为实际发布文件创建新的保全快照，不更改旧封存。明确前后端、必要测试、迁移及文档的显式Git白名单，不 `git add .`。排除 local/、env、密钥、业务库、媒体、生成bundle/源码压缩包/依赖目录和无关归档；不要把这些发布到GitHub。
2. 复测服务器资源和镜像/容器身份。仅用独立项目/内部网络，临时PG/Redis/媒体、无生产挂载/凭据/公开端口/外呼；不启动测试worker/搜索/GPU。先COPY-only增量构建，再串行验收；复用已核验基础镜像，不在服务器重装依赖或构建前端。
3. 资源建议上限：候选backend512MiB、PG192MiB、Redis32MiB，合736MiB；合计CPU约0.65核，临时磁盘预算512MiB。开始前MemAvailable≥1280MiB，过程中低于600MiB或磁盘不足8GiB时停止本次候选，绝不清生产资源腾空间。必要临时文件若使用tmpfs，其内存也计入限额。
4. 验证临时PG空库及b27构造结构升级、明确关闭调度/外呼后的最小应用启动、关键路由与新模块接线、Comfy种子热修行为。沿用已过定向节点，不运行全套或真实任务。不要把构造旧库等同生产扩展结构；必要的schema-only核对不读取/复制业务记录。
5. 将候选固定为可追溯提交，完成必要GitHub push/PR，记录实际commit与源码/包/镜像SHA。不同平台源码换行哈希需明确LF和原始字节口径，不能只凭HEAD宣称容器代码一致。
6. 成套备份并校验现有DB+env、媒体恢复链、旧镜像、Compose/FRP/模板与发布清单。私有备份与凭据不进入GitHub。恢复是保新业务数据的镜像回退，不自动downgrade或旧DB覆盖。
7. 定向隔离结果和备份证明充分后，按现有运维合同排空Task/dispatch/上游、暂停入口，成套更新backend/3worker/frontend。实际构建开关先确认或解决，不将本地默认false冒作线上值。保持PG/Redis/Meilisearch/FRP及原挂载/加密key不变。未知上游任务不重发、不清锁。
8. 发布后核健康/镜像/提交与源码SHA/静态包/关键路由，不生成视频/图片。记录回滚触发与实际结果；仅清本次确认归属的验收资源。同步tasks/handoff/server-operations及发布证据，不把上线写成72项全验收或所有bug完成。

遇到容量不足、候选迁移失败、基线变化、真实开关不明或需要越出上述边界时，先保留现有改动和生产状态，报告具体事实，再处理该具体阻塞；不退回泛泛重复确认整个发布授权。
