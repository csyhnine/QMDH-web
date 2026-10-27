# 新对话开发交接：项目管理（2026-10-27）

## 冷启动先读

这是当前接手入口，覆盖旧交接里的版本号、Compose路径、人员数量和页面设计。先读本文件，再按具体新需求读对应代码；不要重审全项目或原样重跑历史部署脚本。当前用户明确提出的规范分院名称与分院权限核验，以及此前日历/周计划/快捷调整均已提交、推送并部署，等待后续新需求，不重复部署。

- 仓库：`E:/projects/QMDH-web`；分支：`bugfix/migration-bootstrap-001`；origin：`https://github.com/csyhnine/QMDH-web.git`。
- 实际最新前端/后端源码：`c45fd00235bf508d05be07a58400aeb22d753553`（后端只改分院label）；worker功能源码：`55340d752cbe01058417156014abfa50b40af26c`。交接/发布文档会另提交，文档SHA不等于运行源码。
- 草稿PR：[#5](https://github.com/csyhnine/QMDH-web/pull/5)，已更新，不合并main。
- 不创建新分支/新worktree，不委派；不reset/clean/force/stash，不执行`git add .`。提交用明确白名单。后续用户明确提出开发后可沿用已有提交、推送和验证后部署授权，不重复索要同一授权。
- `docs/checks.md`、`docs/plan.md`、`docs/review.md`是本轮之前已有的未提交内容，本轮未覆盖、未提交。已另存原文、补丁、SHA及status到被忽略的`local/handoff-management-20261027-confirm/`。大量既有未跟踪`docs/archive/*`和`scripts/_tmp_*`也保留，不一起加入Git，不清理。
- 保持72项review=PENDING、25项STOPPED冻结、R98唯一DONE；发布与自验不等于独立验收。不跑整套/安全专项，不发真实GPU或付费生成，不做历史补账/补录、搜索重建、未知任务重试或无关清理。

## 用户已经确定的产品方向

1. 项目管理主入口仅：人员排期（默认）、项目计划、项目台账（最右）；详情在台账内。不要恢复管理总览为独立主页面。
2. 极简立项：名称必填，统筹和目标日期选填；创建时随机保存颜色，不让用户填颜色。
3. 项目计划支持按自然周展示七天，前后按整周翻页，跨年/重挂载保持范围；两周/月/季度保留。人员排期横向为人名、纵向为日期，约60px列宽，仅显示姓名。默认自然周，可切换自然月/季度/年；当前仍按每日一行展示，并非把季度/年聚合成月份行。
4. 不能再恢复“选人面板”“安排工作”两个侧面入口，不在人员图显示职位或100%计划占用比例。
5. 工作是连续20px细竖柱；点击空白日期格新增，点击柱体或甘特工作条打开就地快捷卡片，可改进度、暂停/恢复或中断并支援其他项目；详细编辑另有按钮。柱顶“↕”拖动整项改期/转交；柱体划选一段日期直接预填快捷区间。
6. 默认工作卡片只保留项目、工作内容、日期、参与者；更多说明/交付物/推进记录折叠，交付节点在项目计划的项目行或甘特空白日期格快捷插入，交付物选填并显示单日菱形。
7. 上周实际推进、下周安排可手写、从已有记录整理、自动保存。整理为本地确定性汇总，不调用AI/付费模型，不把计划推测成实际完成。
8. 临时抽调在选中区间生成另一项目的工作，同时暂停原工作中该人；无人接替的区间灰白蒙层显示“工作暂停”及警示。不另填复杂暂停表，不自动推迟交付日。
9. 三个页签（Tabs）切换位置和尺寸必须一致，长台账滚动也不跳位。共同页头/页签吸顶，不能再用只有人员日历存在时才启用的条件布局。
10. 页面内关闭/删除/切换/覆盖确认都在整个视口正中央，不用`window.confirm`。浏览器关闭/刷新整个标签页的beforeunload系统提示不能由网页定位，已保留并向用户说明。
11. 人员/甘特排期自动保存开启时，不显示待保存横条/调整清单/保存成功提示；失败或关闭自动保存时仍保留手动保存和调整记录。
12. 管理页面所有日期统一用PlanningDate自定义日历，快捷卡片也一样；顶层popover避开裁切，Escape先关日历，选填可清空，今天也遵守min/max。
13. 界面/API仅用规范分院名称，不加历史括注。仅在用个人账号+company_management+admin可显式跨院；其他院管理者只能本院，直接unit参数/其他院项目及快照ID均被后端拦截。最新18路由与权限聚合只读核验保持，未扩大授权。
14. 左侧Studio入口已归并：灵感、反馈、导航归其他；无限画布归生成，原URL与鉴权保留。Qwen图像编辑按1/2张输入调用固定v1.1工作流，不退回旧v1.0参数。

## 代码导航

主要目录：`frontend/src/pages/management/`。

| 文件 | 职责 / 需要保留的语义 |
| --- | --- |
| `ManagementProjectsPage.tsx` | 院/年度/筛选、主Tabs、快速立项/详情、请求与保存协调。`persistSchedule`做项目CAS保存；`reassignSchedule`调用改派API后同时合并两个项目。 |
| `PeopleSchedule.tsx` | 日期底表+绝对定位竖柱覆盖层，按并行工作排窄轨道；列宽同时用于表头/底表/覆盖层，不能错位。划选区间用Pointer Capture，抑制随后click；↕单独用原生drag。 |
| `PeoplePlanner.tsx` | 拖动整项的本地预览、待保存队列、约1秒自动保存、失败保留与手动重试。负荷仍在内部用于冲突提示，包含被项目筛选隐藏的安排。 |
| `QuickWorkActions.tsx` | 人员/甘特共用就地快捷卡片、单人时段暂停恢复、原子改派及交付节点快速插入。恢复原工作不会删除支援安排。 |
| `PlanningDesk.tsx` | 共享关键总览、极简工作卡片、交付节点只读摘要、旧部分日期改派表单、无人接替警示。接收`WorkRequest`（可带personId/date/end/intent=segment）；日常快捷操作已转到QuickWorkActions。 |
| `WeeklyBrief.tsx` | 按项目及工作周手写/整理，约1秒自动保存，保留版本基线与失败输入；未保存时不能折叠/换项目。 |
| `pillarPlanning.ts` | `adjustWorkPause`按人员与含结束日区间暂停/部分恢复，保留其他人员和前后片段；暂停片段、无人接替区间、上周实际/下周排期整理、日期命中计算；`Reassignment`请求类型。 |
| `confirmPlanning.ts` | `await confirmPlanning(message)`：独立HTML dialog顶层、全视口居中、取消默认焦点、Escape/Enter取消、Tab循环、焦点恢复、安全textContent、顺序队列、单次结算。 |
| `ProjectPlan.tsx` / `ganttBridge.ts` | DHTMLX项目甘特、真实拖动/拉伸、整项阶段编辑；与人员页共用项目/stages。 |
| `planning.ts` / `staffPlanning.ts` | 类型、随机/稳定项目色、暂停/日期/参与人数/负荷、旧整项移动与人员转交、保存队列；不可把计划负荷误当完成进度。 |
| `scheduleCalendar.ts` / `PlanningDate.tsx` | 周/月/季/年真实边界、跨年闰年、日期输入/顶层popover自定义月历（min/max/caption），含快捷卡片与台账数据更新日期；不再用details或原生选择器替代。 |
| `management.css` | 多轮样式在文件后段覆盖。共同frame是`.management-shell > .canvas-area`，共享`.mp-workspace-header`吸顶；确认框`.mp-confirm-dialog`在body顶层。 |
| `ProjectLedger.tsx` / `ManagementReporting.tsx` / `reporting.ts` / `reportWorkbook.ts` | 详情入口、折叠经营/人员周报、金额精确统计、不可改写快照和三表Excel。 |

确认框是异步Promise：新加调用必须await，不要误把Promise当boolean。事件的value/checked要在await之前捕获；左导航捕获阶段先同步阻止原click，确认后用稳定ref只重放一次，避免直接await后才preventDefault。

后端：`backend/app/routers/management.py`。`ProjectInput.weekly_briefs`存周文字；旧客户端省略时保留。Stage保留`deliverable`、`pauses`、`updates`，旧客户端省略也不覆盖。

新增`POST /api/v1/management/assignments/reassign`请求含源项目/阶段/版本、目标项目/版本、person_id、start、end、work。项目按ID排序行锁、人员校验，在一个事务中更新两项目和两修订并审计；失败rollback。拒绝跨院、跨年度、停用、归档、越界、既有暂停重叠和容量溢出。暂停until是恢复当天（右开），因此用户选到10/28，保存until=10/29。原stage起止日期和assignees保留。

数据均为已有JSON扩展，无本轮数据库迁移，生产迁移head仍`b94de295f179`。

## 组织与业务口径

- 一分院15、合并后二分院26、三分院8名在用人员。旧二/四已并入二；不得新建第四个独立池或授予跨院权限。
- 二分院名册共27条（含离职停用历史），在用19内部+7彩旺外包。用户更正归属的人员已入二分院，离职者已停用保留历史；人员真实名单不要复制到Git/新文档。
- 网站角色admin本身不够，必须company_management及公司院信息授权；仅已获公司管理权限的admin可以显式切换授权院，院管理者仍仅本院。人员名册与网站账号授权独立，外包不自动创建账号。
- `PlanningDesk`总人数是全项目各阶段去重；图例人数是所选时间窗内有效参与，两者可能不同，改文案时要说清口径。
- 当前“无人接替”按stage.assignees及暂停区间计算，未额外按名册停用状态剔除。若后续处理离职者残留历史/未来排期，需单独核验该边界，勿宣称已经覆盖。
- 撤销原工作暂停不会自动删除另一项目临时安排；不要无提示删除另一项目的数据。

## 最新线上基线（上次已验证，不等于永远实时）

公开入口：`https://cityusbdisk.cn`；主机`120.79.227.11`；应用目录`/www/wwwroot/qmdh-web`。

| 服务 | 当前镜像 |
| --- | --- |
| backend | `sha256:dad05b8dc0474e3f7996c87ec0a51442410c4c663b6fdb748931d595707a4894` |
| worker ×3 | `sha256:fa3f8984f8a464343a89628ba937813163a94200b052257cbebdc00ce2f41793` |
| frontend | `sha256:69e51190c586f0a7de422f8a26b6cdfd7c69bc460dca922a7492357649e02cc9` |

生效Compose三件套：

1. `/www/wwwroot/qmdh-web/docker-compose.yml`
2. `/opt/qmdh-frp/compose.frp.yml`
3. `/opt/qmdh-frp/releases/unit-access-20261027/compose.release.yml`

**模板挂载源仍是**`/opt/qmdh-frp/releases/management-categories-20261026/workflows` → `/app/integration/comfyui:ro`，8文件，不要因为目录旧而删除。保留env/key、媒体、FRP网络、ODA/FFmpeg/Xvfb等挂载与依赖。

服务器Git checkout仍是旧main/c70eac02，不能pull后直接重建，也不能运行旧`scripts/_tmp_*`或通用rebuild覆盖线上。使用实际运行镜像作为COPY overlay父镜像，逐文件核对线上LF归一哈希、候选哈希、配置、挂载与网络。发布必须用新目录/新镜像标签/新备份名，不能覆盖旧恢复基线。

SSH只从被忽略的`local/server-access.md`在内存中读取；不输出凭据，不提交。现成runner固定校验`docs/archive/server-readonly-2026-10-25/server-metadata.json`中SSH指纹。

最新规范名称/分院核验轮：52个当前前端文件逐字节、10公网资源、9路由、健康、Qwen输入数[1,2]、未登录管理鉴权通过；替换前后端（后端只改名称），三worker及其他容器未重启，无测试安排写入。旧hash资源保留，静态包不按容器内全部资源数断言。

## 备份、容量与发布脚本

最新前后端回滚/配置/数据配对备份：

- 服务器`/www/backup/qmdh-release-20261027-unit-access`
- 本机`E:/backups/QMDH-web/release-20261027-unit-access`
- 28文件SHA一致。**本轮在前后端暂停、队列空闲后创建独立新DB快照，非硬链接旧dump；媒体清单与pillars链一致，继续复用旧媒体恢复链和本机基础包。**回滚不降迁移或覆盖新业务数据。

此前完整数据/媒体链基线（新数据库快照以上述unit-access轮为准）：

- `/www/backup/qmdh-release-20261027-pillars`
- `E:/backups/QMDH-web/release-20261027-pillars`
- 28个列入checksums文件一致；另留本机`database-before-pause.dump`，其私有SHA已核验。5849媒体、37归档恢复链仍依赖本机两基础包；按`resolved-media-chain.json`和本机基础连续性记录查找，不把服务器小增量误当完整媒体备份。

上次盘余8.021GiB；这是时点值，后续发布前复测8GiB门槛、内存及任务/队列/GPU锁/上游队列。只可处理本任务能证明有镜像/本机原包/配对备份的临时构建副本，不清理业务媒体、正式备份、工作流或回滚镜像。几个旧release的html/verified-html、源码bundle/前端tar临时副本已退役，不能原样重跑依赖它们的旧verify脚本后误判生产坏了。

本次pillars发布第一次因备份后新增媒体而自动恢复旧服务，补备份后重发成功；以后遇到清单变化也必须补增量后再切换，不能跳过断言。停止服务后最终DB备份没有在服务器再复制一份大dump，初始dump先留本机，避免磁盘门槛溢出。

私有脚本与产物均在被忽略的local：

- `local/unit_runner.py`、`unit_backup.py`、`unit_deploy.py`：最新规范名称轮，读取`local/unit-access-20261027/`；仅覆盖backend的management.py和前端，保持worker。切换中停止前后端、借worker再次只读查空队列、创建独立dump、核媒体不变后启新服务，失败退镜像不还原业务库。
- `local/calendar_runner.py`、`calendar_backup.py`、`calendar_deploy.py`：此前日历/周计划纯前端轮，读取`local/calendar-week-20261027/`；数据继承pillars基线，不用于后端/迁移发布完整备份。
- `local/quick_runner.py`、`quick_backup.py`、`quick_deploy.py`：此前快捷调整纯前端轮，读取`local/quick-actions-20261027/`，同样只继承数据恢复基线；不能用于后端/迁移发布完整备份。
- `local/confirm_runner.py`、`confirm_backup.py`、`confirm_deploy.py`：此前确认框前端轮，读取`local/center-confirm-20261027/`。本轮backup逻辑是继承数据基线，仅适用于纯前端；不能拿它当后端/迁移发布完整备份。
- `local/pillar_runner.py`、`pillar_backup.py`、`pillar_prepare_dir.py`、`pillar_build.py`、`pillar_smoke.py`、`pillar_accept.py`、`pillar_prepare.py`、`pillar_switch.py`、`pillar_verify.py`：最近后端+三worker+前端轮，读取`local/pillars-20261027/`。
- `pillar_media_diff.py` / `pillar_media_backup.py`：该轮补媒体增量；均为一次性路径，不直接重跑。
- `pillar_switch.py`的本机初始DB证明与`pillar_prepare.py`的不可变源码bundle硬链接要保留理解；复制成新发布时逐项改路径/标签/旧版本断言，别替换过度把历史依赖路径也改掉。
- 新前端包应独立清洁解包校验预期文件。运行镜像保留旧hash静态资源供缓存页面使用，不能按容器里所有assets数量断言只52文件，也不删除旧资源。

## 验证命令与证据

只运行与改动相关的定向检查；后端未改时不机械重跑后端。不要触发冻结全套。

```powershell
# cwd E:/projects/QMDH-web/frontend
node --test scripts/test-management.mjs
# 最近20项通过

# cwd E:/projects/QMDH-web/backend
.venv/Scripts/python.exe -m pytest tests/test_management.py tests/test_management_categories.py tests/test_management_affiliation.py tests/test_management_reporting.py tests/test_management_simple.py tests/test_management_pillars.py -q --disable-warnings
# 此为此前36项范围。最新名称/权限轮仅跑categories、reporting、pillars及个人登录撤权用例，共22项通过；不扩大到全套。

# cwd E:/projects/QMDH-web
node local/quick-types.mjs
# 13个目标文件strict诊断零新增；不是整仓typecheck通过
node local/unit-access-20261027/browser.mjs
# 3新场景：旧label也显示规范名称、管理员切院请求作用域、院管理者仅本院
node local/calendar-week-20261027/browser.mjs
# 7新场景：空交付物、自然周/跨年/重挂载、周内节点、日历上下界/焦点/Escape、闰年月历/受限今天、视窗/立项/台账日历、手机
node local/calendar-week-20261027/regression.mjs
# 10回归场景：安静保存/失败恢复、暂停/部分恢复、划选改派、冲突/详细编辑、甘特快捷进度、真实拖动/拉伸、交付节点、空白日期落点、节点重试、手机/键盘
node local/pillars-20261027/browser.mjs
# 8场景：竖柱、极简表单、周文字、划选改派、灰白警示、冲突、整项拖动、手机/周期
```

浏览器脚本使用实际AppShell和页面，API为合成数据，拒绝外部请求；不能切成生产API写真实安排。pillar浏览器脚本有些操作仍按旧原生确认自动应答，center-confirm脚本的柱体点击则仍预期直接开完整表单；最新交互以calendar-week及其regression脚本为准，复用历史脚本需先适配快捷卡片/详细编辑入口与站内确认。

离线Vite（cwd frontend）：`node node_modules/vite/bin/vite.js build --outDir ../local/新的发布目录/dist --emptyOutDir`。保持此前构建开关/环境，不把`frontend/dist`当源码提交；仅保留既有大块提示，不宣称整套通过。

现成Chromium：`C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe`。Playwright通过`createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright')`加载。TypeScript/esbuild在frontend依赖中。隔离PG脚本不允许生产凭据、业务记录、卷、网络或真实GPU；需要先检查容量，结束只移除本轮拥有的容器/网络。

最新正式证据与说明：

- `docs/unit-access-2026-10-27.md`、`docs/archive/unit-access-2026-10-27/`
- `docs/calendar-week-2026-10-27.md`、`docs/archive/calendar-week-2026-10-27/`
- `docs/quick-actions-2026-10-27.md`、`docs/archive/quick-actions-2026-10-27/`
- `docs/center-confirm-2026-10-27.md`、`docs/archive/center-confirm-2026-10-27/`
- `docs/planning-pillars-2026-10-27.md`、`docs/archive/planning-pillars-2026-10-27/`
- `docs/management-tabs-2026-10-26.md`、`docs/archive/management-tabs-2026-10-26/`
- `docs/personnel-calendar-2026-10-26.md`：前一版逐日卡片，仅作历史；当前竖柱以pillars为准。

不要把私有备份、真实名单、生产凭据或数据库/业务指纹带入Git。公开RELEASE已剔除初始数据库SHA。

## GitHub邮件 / CI 的已知状态

用户问过为什么经常收到GitHub邮件。已查到Quality checks对PR每次push（含文档）触发整套检查，且有既有失败，并没有读取用户邮箱内容，也没证明是安全告警。

历史观察包括前端studio-data-loader模块引用、后端迁移head硬编码、搜索索引初始化/域数量和计费零金额记录断言等失败；旧日志在`local/github-ci-40284543430.log`。这些不是实时head结果，不据此擅自修复冻结项或重跑整套。近期提交`[skip ci]`避免反复触发已知失败的整套，不代表CI全绿，未更改工作流或用户邮件通知。若用户明确要处理CI，重新查当前head的真实checks/logs再限定任务。

## 接手动作

1. 读本文件和`git status`，保留上面三份脏文档及所有既有未跟踪资料；当前运行代码没有未提交WIP。
2. 根据用户的新反馈定位管理页面组件，不恢复已明确删除的入口/表单字段；验证要在实际完整页面框架上观察，避免仅测孤立组件漏掉布局。
3. 若需要发布，先只读核对实际镜像/Compose/迁移/工作流/容量及恢复链。本文是已验证的时点，不跳过新基线断言。
4. 按现有业务授权完成实现、定向检查、明确白名单提交/推送；保持草稿PR，不合并main。无必要不要再征求已经给过的权限。
5. 交接后由新对话接着处理用户新需求；不要同时让两个对话写同一个工作区。

此前完整主handoff已逐字节归档到`docs/archive/handoff-before-2026-10-27-management.md`，其相对链接按原docs目录解析；这里只保留最新三个入口，避免旧版本说明冒充当前状态。
