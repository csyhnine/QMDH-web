2026-10-27当前基线：前端源码51bf2de/镜像24aec6613906，backend6b971be9ea3b、三worker fa3f8984f8a4，迁移b94de295f179。生效第三Compose为`/opt/qmdh-frp/releases/center-confirm-20261027/compose.release.yml`，Qwen模板挂载仍依赖`management-categories-20261026/workflows`。最新前端配对备份25文件，DB/媒体继承pillars完整数据基线，不是新快照。详细接手、容量/恢复链与限制见[2026-10-27开发交接](handoff-management-2026-10-27.md)。服务器旧Git不能直接pull重建。

以下为历史发布条目；当前版本与路径以上述入口及新交接为准，不按旧段落执行。

2026-10-26Studio入口归并已上线：前端7a31b8c/01a2fb29f9df，灵感/反馈/导航归其他，画布归生成，保留原地址和权限；18定向/8目标strict0/浏览器4场景及51文件和公网资源核对通过。仅前端替换，后端/三worker和业务数据保持。当前第三Compose为/opt/qmdh-frp/releases/navigation-merge-20261026/compose.release.yml，模板仍依赖management-categories-20261026/workflows。配对备份23文件SHA一致。见[记录](navigation-merge-2026-10-26.md)，72待验收/25冻结/R98保持。

以下为此前记录，当前前端及Compose以顶部为准。

2026-10-26自动保存已上线：前端3745c5b/镜像a6acf0585e54，已有项目资料和已应用甘特/人员排期停顿约1秒保存，可按账号关闭，失败/冲突保留草稿并停止自动重试；新项目首次仍需创建。7浏览器场景/15定向/7目标strict0通过，51文件及公网包一致。后端/三worker/分院和业务数据保持；当前第三Compose为/opt/qmdh-frp/releases/planning-autosave-20261026/compose.release.yml，模板仍依赖management-categories-20261026/workflows。配对备份23文件SHA一致。见[记录](planning-autosave-2026-10-26.md)，72待验收/25冻结/R98保持。

以下为此前时点记录，当前前端及Compose以顶部为准。

2026-10-26甘特直接管理已上线：前端源码7cdfcb1/镜像6a33c791833c，显示全部工作/完整日期、明确添加编辑入口、图旁编辑人员与内容、自定义月历，真实鼠标移动/拉伸及保存/冲突/窄屏通过。仅前端替换，后端/三worker/分院权限和业务数据保持；当前第三Compose为/opt/qmdh-frp/releases/gantt-direct-20261026/compose.release.yml，继续依赖management-categories-20261026/workflows。配对备份23文件SHA一致。见[记录](gantt-direct-2026-10-26.md)，72待验收/25冻结/R98保持。

下方记录为此前时点，当前前端与Compose以顶部为准。

2026-10-26管理导航已发布：前端85c4650/3b65e290098a，固定四页宽度与子菜单吸顶，增加页面用途和分院边界说明；隔离定向22、前端15、浏览器5场景通过。后端/三worker仍8080b23，f62迁移/42名册与项目保持；仅前端替换。当前第三Compose为/opt/qmdh-frp/releases/management-navigation-20261026/compose.release.yml，并继续依赖management-categories-20261026/workflows。23文件配对备份SHA一致。见[记录](management-navigation-2026-10-26.md)，72待验收/25冻结/R98状态保持。

以下为此前记录，当前前端及Compose以顶部为准。

## 2026-10-26 分院人员与项目回收站（此前）

2026-10-26分院名册/删除已部署：运行源码8080b23，生产迁移f62ab073d957；一院15、合并后二院19、三院8，新增37/关联原5，共42人，原项目/账号分组和授权保持。已授权公司admin切换三院，院管理者仍本院。项目详情可删除到回收站并恢复。27文件配对备份SHA一致；当前第三Compose为/opt/qmdh-frp/releases/management-categories-20261026/compose.release.yml。详见[发布记录](management-categories-2026-10-26.md)。草稿PR #5未合并，72待验收/25冻结/R98保持。

当前backend8b4a302d882f/workerf940856c2fce三副本/frontendc0f7038ea117，保留主Compose+FRP+上述第三Compose、同目录workflows只读绑定。当前私有配对备份release-20261026-management-categories，媒体26归档链仍需本机两包。回退不得降迁移或覆盖新业务库；旧管理API不理解deleted，有回收站项目时必须采用兼容过滤版本或向前修复，不能直接暴露旧列表。详见发布记录。

## 2026-10-26 人员工作台与 Qwen 双图发布（此前）

2026-10-26双功能已部署：运行源码d96d508已推送，人员跨项目甘特/拖拽分工与Qwen v1.1单/双图自动路由上线。公开输入数[1,2]、隔离PG保存/409与接收/幂等、公网新包通过；backend健康/3worker/frontend运行，生产迁移仍e51，无GPU出图。26文件配对备份SHA一致，25媒体归档链仍需本机两份基础包。当前第三Compose改为/opt/qmdh-frp/releases/people-qwen-20261026/compose.release.yml，工作流绑定同目录/workflows，禁止旧Git重建。详见[发布记录](release-people-qwen-2026-10-26.md)。草稿PR #5未合并，72待验收/25冻结/R98状态保持。

当前镜像 backend `5d437ea00900`、worker `42ae70742308`（3副本）、frontend `5310a91ceac0`；三份 Compose 为主文件 + `/opt/qmdh-frp/compose.frp.yml` + `/opt/qmdh-frp/releases/people-qwen-20261026/compose.release.yml`，使用 `--no-build --pull never --scale worker=3`。发布目录现为生效运行材料，不得按临时候选清理；backend/worker只读工作流挂载从旧根改到该目录 `workflows`（8文件），旧根原样保留。

配对备份 `/www/backup/qmdh-release-20261026-people-qwen` ↔ `E:/backups/QMDH-web/release-20261026-people-qwen`。回退先暂停/排空并核上游，用当前目录 `compose.rollback.yml` 和旧镜像标签 `20261026-people-qwen`，同时恢复旧模板绑定和审计恢复旧展示名，不降迁移/覆盖业务数据。所有此前段落只反映对应历史时点，当前完整操作以本段和发布记录为准。

## 2026-10-26修复发布（此前）

2026-10-26发布完成：源码e6add45已推送，草稿PR #5未合并；backend健康/3worker运行/frontend新包生效，生产迁移e51、源码/静态包/公网核验通过。23文件私有配对备份SHA一致，24媒体归档恢复链中2个基础包依赖本机。当前第三Compose和有效发布目录必须保留，详见[执行记录](release-execution-2026-10-26.md)。72待验收、25冻结及R98唯一DONE保持。

当前镜像backend65a9cfbe7969/worker3783fe13579c三副本/frontenddf9975fa4bb7，实际迁移e51。保留主Compose + /opt/qmdh-frp/compose.frp.yml + /opt/qmdh-release-candidate-20261025/compose.release.yml，禁止旧Git重建，candidate目录现在是生效发布目录。env/key/挂载/网络/ODA/FFmpeg/Xvfb保持。

配对备份 /www/backup/qmdh-release-20261026 ↔ E:/backups/QMDH-web/release-20261026，23文件SHA一致；媒体5843文件/15增量66179868字节。resolved-media-chain.json按24归档恢复，完整基础包及一段早期增量仅本机持有，必须结合本机基础包。旧缺链已在新清单中解析，旧归档未改。回滚先暂停入口/排空与核上游，使用compose.rollback.yml和qmdh-release-backup-{backend,worker,frontend}:20261026；只退镜像、不降迁移/覆盖新业务数据。无真实生成/GPU/历史补账或清理。

## 2026-10-19 Qwen v1.1 运行切换（此前）

- 后续种子热修qwen-v11-009已发布，当前backendf8822343/worker3cc0ece1（三副本），frontend仍d5dfe72b。只更新comfyui适配器，修复easy seed 2^50含上界的随机/显式/批量范围；任务8264被拒绝的失败记录不重跑。固定源码与镜像见/opt/qmdh-frp/releases/qwen-v1.1-seed-fix-20261019，主RELEASE.json已记录热修SHA；旧Git HEAD不能用于覆盖当前镜像。
- 热修备份/www/backup/qmdh-qwen-v11-seed-fix-20261019 ↔ E:/backups/QMDH-web/frp-20261019/qwen-v11-seed-fix，21文件SHA一致，DB/env/5828媒体清单/0增量，恢复链接上一v1.1发布备份；回退镜像标签20261019-qwen-v11-seed-fix仅回到种子未修版本，不能作为继续使用的稳定方案。模板/前端/原容器/env/挂载/网络/迁移保持。Windows/Linux专项27+12sub、实际object_info范围/公开健康/六CAD通过，无GPU生成验证。下方首次切换镜像为此前状态。

- 用户明确命令切换后，03e845d准备源码已发布：backend6d3c4d91、workerfa6f6e69（3副本）、frontendd5dfe72b；活跃map ae4127ee5d20a1239a8ac597f4ae1183b9126a8c5250d4842bafca4e3b511c94。id60显示v1.1、id62显示v1.1单图编辑/API reference_input_count=1；Z/三渠道enabled/600秒预算不变。未提交GPU任务，不能声称实际生成/耗时/显存通过。
- 无commit/push/merge，服务器Git仍c70eac02且工作树未修改；运行版本以`/opt/qmdh-frp/releases/qwen-v1.1-20261019/RELEASE.json`为准。源码tar来自03e845d已核验哈希，专用Dockerfile继承发布前镜像，仅改providers/schemas/comfyui并新增静态检查器，保留生产差异。重建不得直接用服务器旧Git源码覆盖当前镜像；本地c39d8e71a624空库迁移修复未发布，线上仍b27d0f85c932。
- 排空所有Task/dispatch与上游队列/锁后暂停入口，成套替换前后端/模板；主Compose+FRP叠加文件、3worker、原挂载/网络保持。FRP/PG/Redis/Meilisearch及其他容器ID/镜像/启动时间、env/key均保持。
- 备份`/www/backup/qmdh-qwen-v11-release-20261019` ↔ `E:/backups/QMDH-web/frp-20261019/qwen-v11-release`，27文件两端SHA一致，含DB/env/旧模板/Git bundle/源码/验证；5828媒体清单/5增量51190080字节，恢复链继承comfy-feedback及原全链。旧镜像`qmdh-release-backup-{backend,worker,frontend}:20261019-qwen-v11`保留。回退须先停止新入口、排空并核对v1.1任务/上游，再还原旧模板map与旧镜像、旧展示名；不downgrade/不清锁/不覆盖新业务库。
- Linux隔离后端23+8sub、三图合同、前端53/23既有TS0新增/构建、公开单图API/三份bundle SHA/健康/六CAD401通过；backend/worker读取object_info确认节点类可用，仅GET。详细事实见qwen-v1.1-preparation.md与archive/handoff-2026-10-19-qwen-v11-activation.md。

## 2026-10-19 ComfyUI 生产闭环（此前）

- 功能7a9874b、生产功能合并cb2bc791；迁移b27d0f85c932追加两表。backend fc3ac003/worker1fbaa318/frontend3c01a252已运行，env/key不变，ODA/FFmpeg/Xvfb/Nano Banana保留；FRP/数据库/cache/search容器ID与启动时间保持。
- 必须使用 `docker compose -f docker-compose.yml -f /opt/qmdh-frp/compose.frp.yml ...` 并保留3worker；main单文件重建会丢专网/模板。最终私有构建输入 /opt/qmdh-frp/Dockerfile.closure 基于旧运行镜像复制合并后代码，源Git bundle与FRP运行包随发布备份保存。全量重建仍保留原ODA包/build args，不覆盖生产差异。
- /providers/comfyui/status只读运行状态；/tasks/{id}/comfyui-recovery为ops/admin核对原任务或安全关闭，须备注，不能全局interrupt/clear。Redis不可用保留DB待办；不手工清GPU锁或重交未知prompt。容量每人10/总100，超过429，非法参数创建前422。
- Windows用户已安装SYSTEM开机守护，受控停止原进程后自动重拉及真实GPU通过；运行材料C:/ProgramData/QMDH-FRP，health.json/私有logs，私钥权限未变。未做整机重启；旧手动前台记录不可当当前启动说明。详见本机私有windows/PRODUCTION-CLOSURE.md。
- 发布前 /www/backup/qmdh-release-20261019-comfyui-closure ↔ E:/backups/QMDH-web/frp-20261019/closure-backup，25文件SHA一致；5805媒体/3增量3881989字节、DB/env/旧镜像、source-final.bundle/frp-runtime.tar.gz与检查。发布后 /www/backup/qmdh-comfy-closure-live-20261019 ↔ closure-live-backup，10文件SHA一致；5820媒体/15增量111458315字节、DB/最终能力与产物证据；tar已完整读取，链引用发布前及旧全链。不能只恢复最后增量。
- 程序回退先排空持久待办/确认上游终态、禁用id60/61/62，再使用qmdh-release-backup-{backend,worker,frontend}:20261019-closure；不降迁移、不重置业务库/媒体/key。不让旧版对未知编辑adapter产生模拟结果。
- 九任务十一图、最终CI39215244482、四容器探活/frontend阻断、三档与幂等、六CAD/health、公网bundle一致性通过；没有声称浏览器点击/长期压测。详细事实见[comfyui-frp.md](comfyui-frp.md)。

# Server Operations Runbook

2026-10-16 自动通路 23ccfa8 已部署，运行合并 f060300c；backend/worker/前端重建，backend healthy＋3 worker，无迁移、env/key 不变。备份 release-20261016-cad-auto-route 两端校验，5773 媒体/空增量；本次 restore-media-chain.json 引用 cad-preparation 目录既有完整包链及 ODA 包（未复制/删除旧包），恢复时按该链追加空增量。最新及前次目录 ACL 仅 Admin/SYSTEM，使用 (OI)(CI) 让受限文件可继承访问。回退镜像 qmdh-release-backup-{backend,worker,frontend}:20261016-cad-auto-route，不回退/删除业务 DB/媒体。只读建议接口不需迁移；隔离 HTTP 与真实图副本试跑/公网新包/路由/健康通过，真实图部分连通结论见 handoff，不自动保存建议。

2026-10-16 CAD 布置前确认 cfdccca 已部署，运行合并 5ac68b6e。三服务镜像重建（保留 ODA 包/三项配置，DEBIAN_MIRROR 参数），backend/3 worker/前端已发布；无迁移，Alembic 仍 f7g8h9i0j1k2、env/key 不变。配对备份 release-20261016-cad-preparation，两端含数据库、5773 文件清单、9 文件媒体增量及旧全链/ODA 包；旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261016-cad-preparation 保留。回退镜像不重置 DB/媒体，新增 CAD JSON 字段可保留。新镜像隔离 HTTP 验证和公网路由/新包/健康通过，正式旧图不自动重算。

2026-10-16 CAD 布置超时修复：外层宝塔默认 60s，但真实 fitout 为 74–75s；新增 extension/120.79.227.11/qmdh-cad-extracts.conf，来源 ops/nginx/cad-extracts.conf，仅 CAD extracts 前缀 proxy_read_timeout/proxy_send_timeout 300s。现有 location ^~ / 不会阻止更长的前缀匹配。迁移/重建宝塔站点时保留此 include；nginx -t/-T 后 reload。location 前缀必须不带末尾斜杠，否则列表接口 /extracts 会被自动 301，引发后端去斜杠重定向循环；旧 301 可能被浏览器永久缓存，必须保留片段中的内部 rewrite 去掉 /extracts/ 尾斜杠（break、不向客户端重定向、保留查询）。运行 scripts/check-cad-proxy.sh 验收带/不带斜杠的列表、含查询列表与详情直接返回 401（不能只测详情/健康）。原代理配置与生效前配置两端备份 cad-timeout-20261016。回退移出新增片段后检查与 reload，不删除业务结果。

2026-10-16 DWG 转换器已发布：功能 0346eee/Qt 依赖修复 b1532b1，生产运行合并 26095b9d。官方 ODA 27.9.0.0 amd64 与 Xvfb/Qt/OpenGL 在 backend/worker 镜像内，非宿主机临时安装；安装包 backend/vendor/oda/ODAFileConverter_QT6_lnxX64_11dll_27.9.deb 不入 Git，SHA256 由生产 QMDH_CAD_ODA_SHA256 固定。QMDH_CAD_ODA_PACKAGE/同 SHA 字段由 Compose 传 build args，QMDH_CAD_DWG_CONVERTER_CMD 调用 python -m app.scripts.convert_dwg_oda --input {input} --output-dir {output_dir}。以后重建保留包与这三个配置字段；新服务器从配对私有备份恢复包，不能仅 clone 后假设已安装。按既有 DEBIAN_MIRROR=https://mirrors.aliyun.com 参数构建 backend/worker。

本次备份 /www/backup/qmdh-release-20261016-linux-oda 与 E:/backups/QMDH-web/release-20261016-linux-oda，含旧 production.env、已配置 production-after.env、数据库/媒体链、官方安装包及验证日志。仅三个转换器键变化，其他配置/加密 key 保持。回退需旧 backend/worker 镜像与旧 production.env 配对，不因回退删除数据库/媒体或降级迁移。新 DWG 可上传，ce_0abae8a9402f 等旧图不重跑。详见 archive/handoff-2026-10-16-linux-oda.md。

Last updated: `2026-10-10`

最新固定 ID/自助临时凭证发布：功能 514de69、运行镜像来自生产合并 7b310f9、迁移 d5e6f7g8h9i0；备份 /www/backup/qmdh-release-20261010-171226 与 E:/backups/QMDH-web/release-20261010-171226，媒体两包均须恢复。详见 archive/handoff-2026-10-10-feedback-public-release.md。公开接入代理信任保持空，终端用户共享预算，放开前核验真实 IP 链路。

最新反馈安全发布/备份见 `archive/handoff-2026-10-10-feedback-security-release.md`（功能 55216ab、运行镜像来自 30dfe26、迁移 c4d5e6f7g8h9）；上一轮及服务器历史差异见 `archive/handoff-2026-10-10-production-release.md`。服务器存在合并历史，不能用 --ff-only；admin 须有提交身份，本轮用一次性 git -c 配置。现有 deploy-production-rebuild.sh 仍包含旧快进/旧镜像迁移流程，不适用于本服务器，按下方 Daily Update 手工顺序操作。

## Current Production-Like Server Snapshot

- Server provider: Alibaba Cloud ECS / Baota panel
- Public IP: `120.79.227.11`
- Domain: `cityusbdisk.cn`
- Baota panel: `https://120.79.227.11:26215`
- App deploy path: `/www/wwwroot/qmdh-web`
- Reverse proxy: Baota `80/443` -> `http://127.0.0.1:8080`
- Docker frontend host port: `8080`
- Current domain status: `cityusbdisk.cn` ICP filed（京ICP备14011242号-4）; DNS → `120.79.227.11`; **HTTPS live** with Let's Encrypt; HTTP redirects to HTTPS.
- Preferred access URL: `https://cityusbdisk.cn`

## Runtime Architecture

The server runs the repo with Docker Compose:

- `frontend`: static app + `/api` reverse proxy
- `backend`: FastAPI
- `worker`: async task worker（默认 **3** 个副本，并行消费 Redis 队列；可用 `docker compose up -d --scale worker=N` 临时调整）
- `postgres`: main business database
- `redis`: queue / lock runtime

Persistent Docker volumes:

- `postgres_data`: users, provider profiles, chat history, tasks, inspiration posts, audit logs, etc.
- `redis_data`: Redis append-only data for runtime recovery
- `backend_media`: generated images, managed inspiration images, other media files

## Secrets And Sensitive State

Do **not** commit server secrets into the repo.

Server-only secrets currently live in `/www/wwwroot/qmdh-web/.env`, including:

- `QMDH_ENCRYPTION_KEY`
- model provider API keys
- bootstrap admin password

Important rule:

- Database backups and `.env` backups must be kept together.
- Changing `QMDH_ENCRYPTION_KEY` after provider keys are stored will make encrypted model keys unreadable.

## Private Repo Access

The server pulls the private GitHub repo through a Deploy Key owned by the `admin` user.

- Key owner: server `admin` user (`/home/admin/.ssh/id_ed25519`)
- GitHub access mode: `git@github.com:csyhnine/QMDH-web.git`
- Repo owner on disk: `admin:admin` at `/www/wwwroot/qmdh-web`

Important:

- `git pull` / `git fetch` must run as `admin`, not `root`
- When already logged in as `root`, use:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
- `root` has no GitHub deploy key; running `git pull` as `root` will fail with `Permission denied (publickey)` even when the deploy key itself is healthy

If clone / pull starts failing with `Permission denied (publickey)`, check in this order:

1. Are you running git as `admin`?
2. `sudo -u admin ssh -T git@github.com`
3. `/home/admin/.ssh/id_ed25519`
4. GitHub repo `Deploy keys`

## First Deployment Checklist

1. Install Docker and Docker Compose plugin.
2. Add server SSH deploy key to GitHub repo Deploy Keys.
3. Clone repo to `/www/wwwroot/qmdh-web`.
4. Create `/www/wwwroot/qmdh-web/.env` from `.env.production.example`.
5. Fill production values, especially:
   - `QMDH_DATABASE_URL`
   - `QMDH_REDIS_URL`
   - `QMDH_ENCRYPTION_KEY`
   - `QMDH_FRONTEND_ORIGIN`
   - bootstrap admin password
6. Start services:
   - `docker compose up -d --build`
7. In Baota, create a site and reverse-proxy it to `127.0.0.1:8080`.

## Daily Update Procedure

Always update in this order:

1. SSH into server.
2. Go to `/www/wwwroot/qmdh-web`.
3. Back up `.env`.
4. Back up PostgreSQL with a logical dump.
5. Back up media files from `backend_media`.
6. Pull latest code as `admin`:
   - `sudo -u admin git -C /www/wwwroot/qmdh-web pull --no-rebase origin main`
7. Build new images before running any new migration (existing containers stay running):
   - `docker compose build backend worker frontend`
   - then, if migrations are included: `docker compose run --rm --no-deps backend alembic upgrade head`
8. Confirm Alembic state:
   - `docker compose run --rm backend alembic current`
   - expected result: current revision matches repo `head`
9. Rebuild and restart:
   - `docker compose up -d --no-build --scale worker=3 backend worker frontend`
10. Validate:
   - `docker compose ps`
   - `docker compose logs --tail=100 backend`
   - `docker compose logs --tail=100 worker`
   - `curl http://127.0.0.1:8080/api/v1/health`
   - `curl "http://127.0.0.1:8080/api/v1/health?detail=full"` — expect `database: healthy`; `redis: healthy` when `QMDH_TASK_EXECUTION_MODE=redis`
   - manual smoke test for login / chat / generation / admin models

### Full Rebuild (替代 docker cp 热补)

当热补文件过多或需要固化镜像层时，用全量 rebuild 代替 `scripts/deploy-production-hotpatch.sh`：

```bash
cd /www/wwwroot/qmdh-web
./scripts/deploy-production-rebuild.sh
```

脚本会：`git pull` → `alembic upgrade head`（可用 `RUN_MIGRATIONS=0` 跳过）→ `docker compose up -d --build backend worker frontend` → health 断言。

热补仍适用于**单文件紧急修复**；rebuild 适用于**多模块变更**或 `be-image-rebuild-001` 收口。

### Update Rule Of Thumb

- No migration in this release:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
  - `docker compose up -d --build`
- Has migration in this release:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
  - `docker compose run --rm backend alembic upgrade head`
  - `docker compose run --rm backend alembic current`
  - `docker compose up -d --build`
- Current repo status note:
  - the `usage_ledgers` rollout for `task-016` includes Alembic migration `e4f5a6b7c8d9_add_usage_ledgers.py`
  - the chat token metering rollout includes Alembic migration `f6a7b8c9d0e1_add_chat_token_columns_to_usage_ledgers.py`
  - any environment upgrading to this version must run `alembic upgrade head` before restart

## Migration Desync Recovery

This project has already seen one real production-like incident on `2026-05-21`:

- repo code was already at `9e2006a`
- `usage_ledgers` table already existed
- Alembic `current` was still `c3d4e5f6a7b8`
- worker crashed with `column usage_ledgers.prompt_tokens does not exist`
- generation tasks could stay in `pending` / `running` until the schema was repaired

This means a release can be "partially upgraded":

- code pulled successfully
- containers restarted successfully
- but database schema and Alembic revision are still behind repo expectations

### How To Recognize This Failure Mode

Look for one or more of these signals:

- `docker compose run --rm backend alembic upgrade head` fails with `relation "..." already exists`
- `docker compose run --rm backend alembic current` reports an older revision than repo `head`
- worker logs contain `UndefinedColumn`, especially on newly added fields
- frontend generation cards stay in `pending` / `running` longer than expected, then fail only after worker recovery

### Standard Recovery Rule

Do **not** wipe volumes. Do **not** run `docker compose down -v`.

Instead:

1. inspect current revision:
   - `docker compose run --rm backend alembic current`
2. inspect the actual table / columns in PostgreSQL
3. if the table already exists but a later migration only adds missing columns, add the missing columns manually with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
4. if the schema now matches repo expectations, align Alembic metadata with:
   - `docker compose run --rm backend alembic stamp <target_revision>`
5. restart `backend` and `worker`
6. verify health and re-check worker logs

### Specific Recovery For `usage_ledgers` Token Columns

If worker logs show `column usage_ledgers.prompt_tokens does not exist`, run:

```bash
cd /www/wwwroot/qmdh-web
docker compose exec postgres psql -U qmdh -d qmdh -c "
ALTER TABLE usage_ledgers
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_ledgers ALTER COLUMN prompt_tokens DROP DEFAULT;
ALTER TABLE usage_ledgers ALTER COLUMN completion_tokens DROP DEFAULT;
ALTER TABLE usage_ledgers ALTER COLUMN total_tokens DROP DEFAULT;
"
docker compose run --rm backend alembic stamp f6a7b8c9d0e1
docker compose run --rm backend alembic current
docker compose restart backend worker
curl http://127.0.0.1:8080/api/v1/health
```

Expected result:

- Alembic current becomes `f6a7b8c9d0e1`
- worker no longer crashes on `usage_ledgers.prompt_tokens`
- generation tasks fail or succeed according to the real upstream image provider state, instead of failing on local schema mismatch

`curl http://127.0.0.1:8080/api/v1/health` is a local health probe used to confirm that the backend API is actually responding after restart.

## Backup And Restore

### Backup

- `.env`: copy to a secure off-repo location
- PostgreSQL:
  - example: `docker compose exec postgres pg_dump -U qmdh -d qmdh > qmdh-YYYYMMDD.sql`
- Media:
  - copy `backend_media` volume contents, or archive from inside the backend container

### Restore

1. Restore `.env`
2. Restore PostgreSQL dump into the `postgres` container
3. Restore `backend_media` volume contents
4. Run `docker compose up -d`
5. Run `docker compose run --rm backend alembic upgrade head`

## Data Safety Red Lines

Never do these on the live server unless you intentionally want data loss:

- `docker compose down -v`
- deleting `postgres_data`
- deleting `backend_media`
- replacing `.env` with a different `QMDH_ENCRYPTION_KEY`
- bringing up a fresh empty database without a migration / import plan

## Staff Account Recovery

Current server history:

- This server started from a fresh PostgreSQL database.
- Old company member accounts were **not** migrated from the historic database.
- Only bootstrap admin + 3 local dev accounts exist by default until roster recovery is run.

Recovery command:

- `docker compose run --rm backend python -m app.cli seed_users`

Behavior:

- Existing accounts are preserved.
- Missing company member accounts are added from the repo roster.
- Default passwords follow the roster script rule (last 4 digits of the phone number).
- Restored users should change their password after first login.

## Inspiration Library Notes

Current expected behavior after this stabilization round:

- Seed inspiration posts should no longer rely on third-party hotlinks only.
- Default inspiration images are downloaded into managed storage under `backend_media`, or replaced with a managed fallback placeholder if download fails.
- Admin-imported external inspiration images should also be localized into platform-managed storage.
- The server may still fail to recover some ArchDaily images directly because `images.adsttc.com` can return `HTTP 403 AccessDenied`.
- A more stable recovery path now exists:
  1. build a local bundle on a machine that can fetch the real seed images
  2. upload `seed-inspiration-bundle.zip` to `/www/wwwroot/qmdh-web/`
  3. import with `docker compose run --rm -v /www/wwwroot/qmdh-web/seed-inspiration-bundle.zip:/tmp/seed-inspiration-bundle.zip:ro backend python -m app.cli import_seed_inspiration_bundle --bundle /tmp/seed-inspiration-bundle.zip`

If cards exist but images are blank again, check:

1. `docker compose logs --tail=100 backend`
2. whether `image_path` values in `inspiration_posts` still point to third-party URLs
3. whether `/media/...` paths are available through the frontend container
4. whether `refresh_seed_inspiration_media` reported `placeholders > 0`
5. whether backend logs contain `HTTP 403` / `AccessDenied`
6. whether the bundle import step has already been run on the current server

## Domain And SSL (2026-06-12)

- ICP filing complete for `cityusbdisk.cn`.
- Let's Encrypt certificate path: `/etc/letsencrypt/live/cityusbdisk.cn/`
- Nginx site config: `/www/server/panel/vhost/nginx/120.79.227.11.conf`
- Production `.env` should use:
  - `QMDH_FRONTEND_ORIGIN=https://cityusbdisk.cn`
  - `QMDH_PUBLIC_MEDIA_BASE_URL=https://cityusbdisk.cn`
- IP `http://120.79.227.11` still works but domain access should be the default for designers and for upstream image fetch URLs.

## Structured Logging (prod-003)

Backend 启动时调用 `setup_logging()`（`backend/app/main.py`）。生产默认 JSON Lines，便于 ELK/Loki 采集。

| 变量 | 默认 | 说明 |
|------|------|------|
| `QMDH_LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` / `CRITICAL` |
| `QMDH_LOG_FORMAT` | `json` | 生产用 `json`；本地调试可设 `console` |

每条日志含 `correlation_id`（由请求中间件注入）。访问日志走结构化 middleware；uvicorn access log 已禁用以免重复。

验证：

```bash
docker compose logs --tail=20 backend | head
curl -s "http://127.0.0.1:8080/api/v1/health?detail=full"
```

## OSS 静态资源迁移 (prod-008)

**当前生产：** `QMDH_STORAGE_BACKEND=local`，媒体在 Docker volume `backend_media`。

**代码已就绪：** `LocalStorage` + `OSSStorage`（`oss2`）；`QMDH_STORAGE_BACKEND=oss` 时新写入会**本地优先 + 后台 mirror 到 OSS**；上游公网 URL 仍优先 `QMDH_PUBLIC_MEDIA_BASE_URL`（站点 `/media` 反代），不必切 OSS 也能通 Haodeya 参考图。

### 切换到 OSS（需用户批准后再改生产 `.env`）

1. 在 `.env` 填写：
   - `QMDH_OSS_ENDPOINT`
   - `QMDH_OSS_BUCKET_NAME`
   - `QMDH_OSS_ACCESS_KEY_ID`
   - `QMDH_OSS_ACCESS_KEY_SECRET`
   - 可选 `QMDH_CDN_BASE_URL`（自定义 CDN 域名，覆盖默认 bucket 公网 URL）
2. 先 dry-run 同步存量：

   ```bash
   docker compose run --rm backend python -m app.scripts.sync_local_media_to_oss --dry-run
   ```

3. 实际上传：

   ```bash
   docker compose run --rm backend python -m app.scripts.sync_local_media_to_oss
   ```

4. 设 `QMDH_STORAGE_BACKEND=oss`，`docker compose up -d --build backend worker`。
5. 验证：上传参考图 → 检查 OSS 控制台对象；Haodeya 任务 `image_tokens>0`。

回滚：改回 `QMDH_STORAGE_BACKEND=local` 并 restart；本地 volume 仍保留副本。

## Quick Verification Commands

```bash
cd /www/wwwroot/qmdh-web
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
curl http://127.0.0.1:8080/api/v1/health
```
